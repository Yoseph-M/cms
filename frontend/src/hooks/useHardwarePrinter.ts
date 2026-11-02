import { useEffect, useRef, useCallback } from 'react';
import i18n from '../i18n';
import { axiosClient } from '../api/axiosClient';
import { useSocketStore } from '../store/socketStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { describePrinterFailure, type PrinterFailureCopy } from '../utils/printerErrors';

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
        let failure: PrinterFailureCopy | null = null;

        try {
          const payload = Uint8Array.from(atob(job.payloadBase64), c => c.charCodeAt(0));

          if (job.transport === 'USB') {
            success = await printViaUSB(job, payload);
          } else if (job.transport === 'BLUETOOTH') {
            success = await printViaBluetooth(job, payload);
          }
        } catch (err: any) {
          // Say what actually went wrong in plain language. The raw browser
          // error stays in the console for whoever services the hardware.
          failure = describePrinterFailure(err);
          errorMessage = failure.message;
          // Lead with the sentence staff can act on; keep the raw DOMException
          // on a debug line for whoever services the hardware. Concatenating
          // the raw error into the visible line is what produced messages like
          // "Failed to execute 'claimInterface' on 'USBService'".
          console.error(`Print job ${job.id} did not print: ${failure.message}`);
          console.debug('Printer error details', err);
        }

        if (!success) {
          const now = Date.now();
          const last = lastNotifiedRef.current[job.station] ?? 0;
          if (now - last > 60_000) {
            lastNotifiedRef.current[job.station] = now;
            // Each failure names its own cause and remedy — a busy printer, a
            // disconnected cable and a rejected ticket need different actions.
            const shown = failure ?? describePrinterFailure(null);
            addToast({
              type: 'error',
              title: shown.title,
              message: shown.message,
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
 * Thrown when somebody else is holding the printer's USB interface, so the
 * operator is told what to close instead of Chromium's raw
 * `NetworkError: Unable to claim interface`.
 */
export class PrinterBusyError extends Error {
  readonly code = 'USB_CLAIM_BUSY';

  constructor() {
    super(i18n.t('printers.printerBusyMsg'));
    this.name = 'PrinterBusyError';
  }
}

/** An error our print path can recognise later without parsing translated text. */
function printError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const CLAIM_ATTEMPTS = 3;
const CLAIM_RETRY_DELAY_MS = 300;

/**
 * A bulk transfer to an unplugged or crashed printer can stay pending forever.
 * The write queue is page-wide, so one hung transfer would silently stop every
 * later ticket in this window — including the poll loop. A ticket never takes
 * this long; give up and let the operator retry.
 */
const USB_TRANSFER_TIMEOUT_MS = 10_000;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number, message: string, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(printError(code, message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Chromium reports every failed platform claim as `NetworkError: Unable to
 * claim interface` (libusb's LIBUSB_ERROR_BUSY underneath). It says nothing
 * about the network: another window, another tab or the OS printer driver
 * (usblp, the Windows spooler) holds the interface, and it usually lets go a
 * moment later.
 */
function isClaimBusyError(err: any): boolean {
  return err?.name === 'NetworkError' && /claim/i.test(String(err?.message ?? ''));
}

/**
 * Send the whole slip. A bulk transfer may complete short of the requested
 * length; treating that as success cuts the ticket off mid-line, so keep
 * sending from where the printer stopped until every byte is out.
 */
async function transferAll(
  targetDevice: any,
  endpointNumber: number,
  payload: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < payload.length) {
    const chunk = payload.subarray(offset);
    const result = await withTimeout<any>(
      targetDevice.transferOut(endpointNumber, chunk),
      USB_TRANSFER_TIMEOUT_MS,
      i18n.t('printers.usbWriteTimeout'),
      'USB_WRITE_TIMEOUT',
    );
    const written = typeof result?.bytesWritten === 'number' ? result.bytesWritten : chunk.length;
    if (written <= 0) {
      throw printError('USB_WRITE_STALLED', i18n.t('printers.usbWriteStalled'));
    }
    offset += Math.min(written, chunk.length);
  }
}

/** The interface and endpoint that actually carry the printer's bytes. */
function findUsbWriteTarget(
  device: any,
): { interfaceNumber: number; endpointNumber: number } | null {
  for (const iface of device.configuration?.interfaces ?? []) {
    for (const alt of iface.alternates ?? []) {
      const endpoint = (alt.endpoints ?? []).find(
        (ep: any) => ep.direction === 'out' && ep.type === 'bulk',
      );
      if (endpoint) {
        return {
          interfaceNumber: iface.interfaceNumber ?? 0,
          endpointNumber: endpoint.endpointNumber,
        };
      }
    }
  }
  return null;
}

/**
 * One write, start to finish: open, claim, send the bytes, then hand the
 * printer straight back.
 *
 * Holding the claim for the lifetime of the page is what the WebUSB examples
 * do for a streaming session, but this app prints a ticket every few minutes
 * from a poll loop. A page that never releases keeps the interface away from
 * every other window and from the OS driver — which is exactly how the *next*
 * job ends up failing with "Unable to claim interface". The interface is
 * released and the device closed in `finally`, even when the write throws.
 */
async function writeUsbNow(targetDevice: any, payload: Uint8Array): Promise<void> {
  try {
    if (!targetDevice.opened) await targetDevice.open();
    if (targetDevice.configuration === null) {
      // Not always configuration 1: ask the device for its own.
      const configuration = targetDevice.configurations?.[0]?.configurationValue ?? 1;
      await targetDevice.selectConfiguration(configuration);
    }

    // Interfaces are only known once a configuration is selected.
    const target = findUsbWriteTarget(targetDevice);
    if (!target) {
      throw printError('USB_NO_ENDPOINT', i18n.t('printers.noBulkEndpoint'));
    }

    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
      try {
        await targetDevice.claimInterface(target.interfaceNumber);
        await transferAll(targetDevice, target.endpointNumber, payload);
        return;
      } catch (err) {
        if (!isClaimBusyError(err)) throw err;
        if (attempt === CLAIM_ATTEMPTS - 1) throw new PrinterBusyError();
        // Give the other window/driver time to finish, then claim again.
        await wait(CLAIM_RETRY_DELAY_MS * (attempt + 1));
      } finally {
        // Let go immediately so the next ticket — or the other terminal — can
        // claim the printer instead of inheriting our claim.
        await targetDevice.releaseInterface(target.interfaceNumber).catch(() => undefined);
      }
    }
  } finally {
    try {
      await targetDevice.close();
    } catch {
      // Already closed or unplugged: nothing to give back.
    }
  }
}

/**
 * Raw ESC/POS write to an already-permitted USB device. Shared by the queued
 * ticket path and by the printer page's Test Print button, so both write bytes
 * to the printer the exact same way.
 *
 * Every write in this page is queued behind the previous one: the poll loop,
 * the Test Print button and a reprint can otherwise overlap, and two writers on
 * one endpoint interleave their bytes into a garbled ticket.
 */
let usbWriteQueue: Promise<unknown> = Promise.resolve();

function writeToUsbDevice(targetDevice: any, payload: Uint8Array): Promise<void> {
  const write = usbWriteQueue.then(() => writeUsbNow(targetDevice, payload));
  // Keep the queue alive after a failure: the next ticket must still print.
  usbWriteQueue = write.catch(() => undefined);
  return write;
}

/** Permitted USB devices, tolerating browsers without the permission API. */
async function permittedUsbDevices(): Promise<any[]> {
  const usb = (navigator as any).usb;
  if (!usb) throw printError('USB_UNSUPPORTED', i18n.t('printers.webUsbUnsupported'));
  if (typeof usb.requestDevice !== 'function') {
    throw printError('USB_UNSUPPORTED', i18n.t('printers.webUsbUnsupported'));
  }
  if (typeof usb.getDevices !== 'function') return [];
  return usb.getDevices();
}

async function printViaUSB(job: PrintJob, payload: Uint8Array): Promise<boolean> {
  if (!(navigator as any).usb) {
    throw printError('USB_UNSUPPORTED', i18n.t('printers.webUsbUnsupported'));
  }

  const vId = parseInt(job.printerVendorId || '0', 16);
  const pId = parseInt(job.printerProductId || '0', 16);

  const devices = await permittedUsbDevices();
  const targetDevice = devices.find((d: any) => d.vendorId === vId && d.productId === pId);

  if (!targetDevice) {
    throw printError('USB_NOT_PAIRED', i18n.t('printers.usbNotPaired'));
  }

  await writeToUsbDevice(targetDevice, payload);

  return true;
}

async function printViaBluetooth(job: PrintJob, payload: Uint8Array): Promise<boolean> {
  if (!(navigator as any).bluetooth) {
    throw printError('BLUETOOTH_UNSUPPORTED', i18n.t('printers.bluetoothUnsupported'));
  }

  const printerId = job.printerMacAddress ?? '';

  // navigator.bluetooth.getDevices() is a newer API, may not be in all browsers
  if (typeof (navigator as any).bluetooth.getDevices !== 'function') {
    throw printError('BLUETOOTH_UNSUPPORTED', i18n.t('printers.bluetoothUnsupported'));
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
    throw printError('BLUETOOTH_NOT_PAIRED', i18n.t('printers.bluetoothNotPaired'));
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
  if (!server) throw printError('BLUETOOTH_GATT_FAILED', i18n.t('printers.gattConnectFailed'));

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
      throw printError('USB_UNSUPPORTED', t('printers.usbUnsupported'));
    }

    const vendorId = parseInt(slip.printerVendorId || '0', 16);
    const productId = parseInt(slip.printerProductId || '0', 16);

    let device = (await permittedUsbDevices()).find(
      (d: any) => d.vendorId === vendorId && d.productId === productId,
    );

    if (!device) {
      // Offer the configured printer first; fall back to any device rather than
      // dead-ending when the stored ids drifted from the hardware. A cancelled
      // chooser rejects with NotFoundError, which must become the page's own
      // "no printer selected" instead of Chromium's wording in a toast.
      try {
        device = await usb.requestDevice({ filters: [{ vendorId, productId }] });
      } catch {
        device = await (usb.requestDevice
          ? usb.requestDevice({ filters: [] }).catch(() => null)
          : null);
      }
    }

    if (!device) throw printError('USB_SELECTION_CANCELLED', t('printers.noUsbSelected'));
    await writeToUsbDevice(device, payload);
    return;
  }

  const bt = (navigator as any).bluetooth;
  if (!bt?.requestDevice) {
    throw printError('BLUETOOTH_UNSUPPORTED', t('printers.bluetoothUnsupported'));
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
    // A cancelled chooser rejects; report it as a cancellation, not as a raw
    // NotFoundError from the browser.
    device = await bt
      .requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455'],
      })
      .catch(() => null);
  }

  if (!device) throw printError('BLUETOOTH_SELECTION_CANCELLED', t('printers.noBluetoothSelected'));
  await writeToBluetoothDevice(device, payload);
}
