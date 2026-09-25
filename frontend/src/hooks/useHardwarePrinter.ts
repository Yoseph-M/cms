import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
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
  const { t } = useTranslation();
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
          errorMessage = err.message || i18n.t('printers.unknownPrintError');
          console.error(`Error processing print job ${job.id}:`, err);
        }

        if (!success) {
          const now = Date.now();
          const last = lastNotifiedRef.current[job.station] ?? 0;
          if (now - last > 60_000) {
            lastNotifiedRef.current[job.station] = now;
            addToast({
              type: 'error',
              title: t('printers.ticketNotPrinted'),
              message: t('printers.ticketNotPrintedMsg'),
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

/**
 * Raw ESC/POS write to an already-permitted USB device. Shared by the queued
 * ticket path and by the printer page's Test Print button, so both write bytes
 * to the printer the exact same way.
 */
async function writeToUsbDevice(targetDevice: any, payload: Uint8Array): Promise<void> {
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
    throw new Error(i18n.t('printers.noBulkEndpoint'));
  }

  await targetDevice.transferOut(outEndpoint.endpointNumber, payload);
  // Optional: close device. Sometimes it's better to keep it open.
  // await targetDevice.close();
}

/** Permitted USB devices, tolerating browsers without the permission API. */
async function permittedUsbDevices(): Promise<any[]> {
  const usb = (navigator as any).usb;
  if (!usb) throw new Error(i18n.t('printers.webUsbUnsupported'));
  if (typeof usb.requestDevice !== 'function') throw new Error(i18n.t('printers.webUsbUnsupported'));
  if (typeof usb.getDevices !== 'function') return [];
  return usb.getDevices();
}

async function printViaUSB(job: PrintJob, payload: Uint8Array): Promise<boolean> {
  if (!(navigator as any).usb) {
    throw new Error(i18n.t('printers.webUsbUnsupported'));
  }

  const vId = parseInt(job.printerVendorId || '0', 16);
  const pId = parseInt(job.printerProductId || '0', 16);

  const devices = await permittedUsbDevices();
  const targetDevice = devices.find((d: any) => d.vendorId === vId && d.productId === pId);

  if (!targetDevice) {
    throw new Error(i18n.t('printers.usbNotPaired'));
  }

  await writeToUsbDevice(targetDevice, payload);

  return true;
}

async function printViaBluetooth(job: PrintJob, payload: Uint8Array): Promise<boolean> {
  if (!(navigator as any).bluetooth) {
    throw new Error(i18n.t('printers.bluetoothUnsupported'));
  }

  const printerId = job.printerMacAddress ?? '';

  // navigator.bluetooth.getDevices() is a newer API, may not be in all browsers
  if (typeof (navigator as any).bluetooth.getDevices !== 'function') {
    throw new Error(i18n.t('printers.bluetoothUnsupported'));
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
    throw new Error(i18n.t('printers.bluetoothNotPaired'));
  }

  await writeToBluetoothDevice(targetDevice, payload);

  return true;
}

/**
 * Raw ESC/POS write to an already-connected BLE device. Shared by the queued
 * ticket path and by the printer page's Test Print button.
 */
async function writeToBluetoothDevice(targetDevice: any, payload: Uint8Array): Promise<void> {
  const server = await targetDevice.gatt?.connect();
  if (!server) throw new Error(i18n.t('printers.gattConnectFailed'));

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
}

/** The slip a station's Test Print button sends, as returned by the API. */
export interface TestSlip {
  transport: 'USB' | 'BLUETOOTH';
  printerMacAddress: string | null;
  printerVendorId: string | null;
  printerProductId: string | null;
  payloadBase64: string;
}

/**
 * Print a test slip from THIS terminal.
 *
 * Reached from a click, which is exactly the user gesture WebUSB/Web Bluetooth
 * need — so an unpaired printer is paired here instead of failing with "not
 * permitted". Returns nothing on success and throws a readable message on
 * failure, so the page can report the real outcome rather than a hopeful toast.
 */
export const printTestSlip = async (slip: TestSlip): Promise<void> => {
  const t = i18n.t.bind(i18n);
  const payload = Uint8Array.from(atob(slip.payloadBase64), (c) => c.charCodeAt(0));

  if (slip.transport === 'USB') {
    const usb = (navigator as any).usb;
  if (!usb?.requestDevice) {
    throw new Error(t('printers.usbUnsupported'));
  }

    const vendorId = parseInt(slip.printerVendorId || '0', 16);
    const productId = parseInt(slip.printerProductId || '0', 16);

    let device = (await permittedUsbDevices()).find(
      (d: any) => d.vendorId === vendorId && d.productId === productId,
    );

    if (!device) {
      // Offer the configured printer first; fall back to any device rather than
      // dead-ending when the stored ids drifted from the hardware.
      device = await usb
        .requestDevice({ filters: [{ vendorId, productId }] })
        .catch(() => (usb.requestDevice ? usb.requestDevice({ filters: [] }) : null));
    }

    if (!device) throw new Error(t('printers.noUsbSelected'));
    await writeToUsbDevice(device, payload);
    return;
  }

  const bt = (navigator as any).bluetooth;
  if (!bt?.requestDevice) {
    throw new Error(t('printers.bluetoothUnsupported'));
  }

  const printerId = slip.printerMacAddress ?? '';
  let device: any;

  if (typeof bt.getDevices === 'function') {
    const devices = await bt.getDevices();
    if (printerId) {
      device = devices.find((d: any) => d.id === printerId || d.name?.includes(printerId));
      if (!device) {
        const needle = printerId.toLowerCase();
        device = devices.find(
          (d: any) => d.id?.toLowerCase() === needle || d.name?.toLowerCase().includes(needle),
        );
      }
    }
    if (!device && devices.length === 1) device = devices[0];
  }

  if (!device) {
    device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455'],
    });
  }

  if (!device) throw new Error(t('printers.noBluetoothSelected'));
  await writeToBluetoothDevice(device, payload);
}
