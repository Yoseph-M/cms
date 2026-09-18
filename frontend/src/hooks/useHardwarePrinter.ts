import { useEffect, useRef, useCallback } from 'react';
import { axiosClient } from '../api/axiosClient';
import { useSocketStore } from '../store/socketStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';

export interface PrintJob {
  id: string;
  station: string;
  transport: 'BLUETOOTH' | 'USB';
  printerMacAddress: string | null;
  printerVendorId: string | null;
  printerProductId: string | null;
  payloadBase64: string;
}

let cachedTransports: Set<PrintJob['transport']> | null = null;

function getSupportedTransports() {
  if (cachedTransports) return cachedTransports;
  
  const transports = new Set<PrintJob['transport']>();
  if (typeof navigator !== 'undefined') {
    try {
      if (typeof (navigator as any).usb?.getDevices === 'function') transports.add('USB');
    } catch (e) { /* ignore */ }
    
    try {
      if (typeof (navigator as any).bluetooth?.getDevices === 'function') {
        transports.add('BLUETOOTH');
      }
    } catch (e) { /* ignore */ }
  }
  
  cachedTransports = transports;
  return transports;
}

export function useHardwarePrinter() {
  const { socket } = useSocketStore();
  const { isAuthenticated } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const isPollingRef = useRef(false);
  // Don't spam the operator: report each device failure at most once a minute.
  const lastNotifiedRef = useRef<Record<string, number>>({});

  const fetchAndProcessJobs = useCallback(async () => {
    if (isPollingRef.current || !isAuthenticated) return;
    const transports = getSupportedTransports();
    // Most browsers do not expose WebBluetooth's getDevices API. Avoid polling
    // and then incorrectly marking every kitchen ticket as failed on devices
    // that cannot print it.
    if (transports.size === 0) return;
    isPollingRef.current = true;

    try {
      const res = await axiosClient.get('/print-jobs/frontend/pending');
      const jobs: PrintJob[] = res.data;

      for (const job of jobs.filter((job) => transports.has(job.transport))) {
        let success = false;
        let errorMessage = '';

        try {
          const payload = Uint8Array.from(atob(job.payloadBase64), c => c.charCodeAt(0));

          if (job.transport === 'USB') {
            success = await printViaUSB(job, payload);
          } else if (job.transport === 'BLUETOOTH') {
            success = await printViaBluetooth(job, payload);
          }
        } catch (err: any) {
          errorMessage = err.message || 'Unknown printing error';
          console.error(`Error processing print job ${job.id}:`, err);
        }

        if (!success) {
          const now = Date.now();
          const last = lastNotifiedRef.current[job.station] ?? 0;
          if (now - last > 60_000) {
            lastNotifiedRef.current[job.station] = now;
            addToast({
              type: 'error',
              title: 'Kitchen ticket not printed',
              message:
                'Open the Tickets page and tap Reprint. If it keeps failing, check the printer is switched on.',
            });
          }
        }

        // ACK the job (the backend also notifies Owner/Manager on FAILED).
        await axiosClient.post(`/print-jobs/frontend/${job.id}/ack`, {
          status: success ? 'PRINTED' : 'FAILED',
          error: success ? null : errorMessage,
        });
      }
    } catch (err) {
      console.error('Error fetching pending print jobs:', err);
    } finally {
      isPollingRef.current = false;
    }
  }, [isAuthenticated, addToast]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // The interval is a fallback for a tab which missed a socket event while
    // asleep. Normal printing starts from the `printJob:queued` listener
    // below, so a newly-created ticket is picked up immediately.
    const interval = window.setInterval(fetchAndProcessJobs, 5000);
    void fetchAndProcessJobs();
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchAndProcessJobs]);

  useEffect(() => {
    if (!isAuthenticated || !socket) return;

    const scanNow = () => void fetchAndProcessJobs();
    socket.on('printJob:queued', scanNow);
    socket.on('printJob:retry', scanNow);
    socket.on('connect', scanNow);

    return () => {
      socket.off('printJob:queued', scanNow);
      socket.off('printJob:retry', scanNow);
      socket.off('connect', scanNow);
    };
  }, [isAuthenticated, socket, fetchAndProcessJobs]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;

    // A printer can be plugged in after the POS is already open. WebUSB emits
    // these events immediately; the visibility handler covers a POS returning
    // from sleep or a browser that does not expose the hardware event.
    const scanWhenVisible = () => {
      if (document.visibilityState === 'visible') void fetchAndProcessJobs();
    };
    const usb = (navigator as any).usb;
    usb?.addEventListener?.('connect', scanWhenVisible);
    document.addEventListener('visibilitychange', scanWhenVisible);

    return () => {
      usb?.removeEventListener?.('connect', scanWhenVisible);
      document.removeEventListener('visibilitychange', scanWhenVisible);
    };
  }, [isAuthenticated, fetchAndProcessJobs]);

  return null;
}

async function printViaUSB(job: PrintJob, payload: Uint8Array): Promise<boolean> {
  if (!(navigator as any).usb) {
    throw new Error('WebUSB is not supported in this browser.');
  }

  const vId = parseInt(job.printerVendorId || '0', 16);
  const pId = parseInt(job.printerProductId || '0', 16);

  const devices = await (navigator as any).usb.getDevices();
  const targetDevice = devices.find((d: any) => d.vendorId === vId && d.productId === pId);

  if (!targetDevice) {
    throw new Error('USB Printer not found or not permitted. User must pair it first.');
  }

  await targetDevice.open();
  if (targetDevice.configuration === null) {
    await targetDevice.selectConfiguration(1);
  }
  await targetDevice.claimInterface(0);
  
  // Find bulk out endpoint
  let outEndpoint: any = null;
  for (const alt of targetDevice.configuration!.interfaces[0].alternates) {
    for (const ep of alt.endpoints) {
      if (ep.direction === 'out' && ep.type === 'bulk') {
        outEndpoint = ep;
        break;
      }
    }
    if (outEndpoint) break;
  }

  if (!outEndpoint) {
    throw new Error('Could not find bulk out endpoint on USB device');
  }

  await targetDevice.transferOut(outEndpoint.endpointNumber, payload);
  // Optional: close device. Sometimes it's better to keep it open.
  // await targetDevice.close();
  
  return true;
}

async function printViaBluetooth(job: PrintJob, payload: Uint8Array): Promise<boolean> {
  if (!(navigator as any).bluetooth) {
    throw new Error('WebBluetooth is not supported in this browser.');
  }

  const printerId = job.printerMacAddress ?? '';

  // navigator.bluetooth.getDevices() is a newer API, may not be in all browsers
  if (typeof (navigator as any).bluetooth.getDevices !== 'function') {
    throw new Error('navigator.bluetooth.getDevices is not supported in this browser.');
  }

  const devices = await (navigator as any).bluetooth.getDevices();

  // Web Bluetooth exposes an opaque, case-sensitive device id instead of a MAC
  // address, so match it exactly. Records saved before that (or by hand) may
  // hold a MAC, so fall back to a case-insensitive match, then to the first
  // permitted device.
  let targetDevice = printerId
    ? devices.find((d: any) => d.id === printerId || d.name?.includes(printerId))
    : undefined;

  if (!targetDevice && printerId) {
    const needle = printerId.toLowerCase();
    targetDevice = devices.find(
      (d: any) => d.id?.toLowerCase() === needle || d.name?.toLowerCase().includes(needle),
    );
  }

  if (!targetDevice && devices.length > 0) {
    targetDevice = devices[0]; // Fallback to first paired
  }

  if (!targetDevice) {
    throw new Error('Bluetooth Printer not found or not permitted. User must pair it first.');
  }

  const server = await targetDevice.gatt?.connect();
  if (!server) throw new Error('Could not connect to GATT server');

  // Generic UUIDs for ESC/POS BLE printers
  const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb').catch(() => 
    server.getPrimaryService('49535343-fe7d-4ae5-8fa9-9fafd205e455')
  );
  
  const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb').catch(() => 
    service.getCharacteristic('49535343-8841-43f4-a8d4-ecbe34729bb3')
  );

  // Send in chunks of 512 bytes for BLE limits
  const CHUNK_SIZE = 512;
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    const chunk = payload.slice(i, i + CHUNK_SIZE);
    await characteristic.writeValue(chunk);
  }

  return true;
}
