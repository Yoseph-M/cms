import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A POS terminal prints a ticket every few minutes from a poll loop, and the
 * failure that prompted these tests came from the field:
 *
 *   NetworkError: Failed to execute 'claimInterface' on 'USBService':
 *   Unable to claim interface.
 *
 * Chromium answers that for *any* refused platform claim (libusb's
 * LIBUSB_ERROR_BUSY underneath), which on a till means another window of the
 * app, another tab, or the OS printer driver already holds the interface. It is
 * not a network problem and it is usually gone a moment later, so a ticket must
 * not be reported as failed for it on the first try.
 */

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/toastStore', () => ({ useToastStore: vi.fn() }));
vi.mock('../store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('../store/socketStore', () => ({ useSocketStore: vi.fn() }));
vi.mock('react-i18next', () => {
  // Resolve keys against the real English catalogue so assertions keep reading
  // the UI text operators see, not translation keys.
  const en = require('../locales/en/common.json');
  const lookup = (key: string): string =>
    key
      .split('.')
      .reduce<any>((node, part) => (node == null ? undefined : node[part]), en);
  return { useTranslation: () => ({ t: (key: string) => lookup(key) ?? key }) };
});

import { printTestSlip, PrinterBusyError, useHardwarePrinter } from '../hooks/useHardwarePrinter';
import { axiosClient } from '../api/axiosClient';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { useSocketStore } from '../store/socketStore';

const VENDOR_ID = 0x04b8;
const PRODUCT_ID = 0x0e15;

const claimBusyError = () =>
  Object.assign(
    new Error("Failed to execute 'claimInterface' on 'USBService': Unable to claim interface."),
    { name: 'NetworkError' },
  );

/** Interface 0 carries a bulk OUT endpoint, like most ESC/POS printers. */
const PRINTER_INTERFACES = [
  {
    interfaceNumber: 0,
    alternates: [{ endpoints: [{ direction: 'out', type: 'bulk', endpointNumber: 1 }] }],
  },
];

function makeUsbDevice(options: { interfaces?: any[]; claim?: (call: number) => void } = {}) {
  let claims = 0;
  const device: any = {
    vendorId: VENDOR_ID,
    productId: PRODUCT_ID,
    opened: false,
    configuration: null,
    configurations: [{ configurationValue: 1 }],
    transfers: [] as string[],
    open: vi.fn(async () => {
      device.opened = true;
    }),
    selectConfiguration: vi.fn(async () => {
      device.configuration = { interfaces: options.interfaces ?? PRINTER_INTERFACES };
    }),
    close: vi.fn(async () => {
      device.opened = false;
      device.configuration = null;
    }),
    claimInterface: vi.fn(async () => {
      claims += 1;
      options.claim?.(claims);
    }),
    releaseInterface: vi.fn(async () => undefined),
    transferOut: vi.fn(async (_endpointNumber: number, payload: Uint8Array) => {
      device.transfers.push(new TextDecoder().decode(payload));
    }),
  };
  return device;
}

const installUsb = (device: any) => {
  Object.defineProperty(navigator, 'usb', {
    configurable: true,
    value: { requestDevice: vi.fn(), getDevices: vi.fn().mockResolvedValue([device]) },
  });
};

const slip = (text = 'TABLE 4') => ({
  transport: 'USB' as const,
  printerMacAddress: null,
  printerVendorId: VENDOR_ID.toString(16),
  printerProductId: PRODUCT_ID.toString(16),
  payloadBase64: btoa(text),
});

describe('USB ticket printer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (navigator as any).usb;
  });

  it('retries a claim another window is holding instead of losing the ticket', async () => {
    const device = makeUsbDevice({ claim: (call) => {
      if (call === 1) throw claimBusyError();
    } });
    installUsb(device);

    await printTestSlip(slip('TABLE 4'));

    expect(device.claimInterface).toHaveBeenCalledTimes(2);
    expect(device.transfers).toEqual(['TABLE 4']);
  });

  it('hands the printer back the moment the ticket is written', async () => {
    const device = makeUsbDevice();
    installUsb(device);

    await printTestSlip(slip());

    // A claim kept for the life of the page is what makes the *next* job — in
    // this window or any other — fail with "Unable to claim interface".
    expect(device.releaseInterface).toHaveBeenCalledWith(0);
    expect(device.close).toHaveBeenCalledTimes(1);
    expect(device.opened).toBe(false);
  });

  it('claims whichever interface actually carries the bulk out endpoint', async () => {
    const device = makeUsbDevice({
      interfaces: [
        {
          interfaceNumber: 0,
          alternates: [{ endpoints: [{ direction: 'in', type: 'bulk', endpointNumber: 1 }] }],
        },
        {
          interfaceNumber: 1,
          alternates: [{ endpoints: [{ direction: 'out', type: 'bulk', endpointNumber: 2 }] }],
        },
      ],
    });
    installUsb(device);

    await printTestSlip(slip());

    expect(device.claimInterface).toHaveBeenCalledWith(1);
    expect(device.transferOut).toHaveBeenCalledWith(2, expect.any(Uint8Array));
    expect(device.releaseInterface).toHaveBeenCalledWith(1);
  });

  it('names the real cause when another program keeps the printer', async () => {
    const device = makeUsbDevice({ claim: () => { throw claimBusyError(); } });
    installUsb(device);

    const error: any = await printTestSlip(slip()).catch((err) => err);

    expect(error).toBeInstanceOf(PrinterBusyError);
    expect(error.code).toBe('USB_CLAIM_BUSY');
    expect(error.message).toContain('Another window or program is using this printer');
    // Chromium's wording would only send the operator hunting for the network.
    expect(error.message).not.toContain('claimInterface');
    expect(device.close).toHaveBeenCalledTimes(1);
  });

  it('sends the rest of the ticket when a bulk write completes short', async () => {
    const device = makeUsbDevice();
    const written: string[] = [];
    device.transferOut = vi.fn(async (_endpointNumber: number, payload: Uint8Array) => {
      // A bulk transfer may hand back only part of the buffer; treating that as
      // success cuts the slip off mid-line.
      const bytesWritten = written.length === 0 ? 4 : payload.byteLength;
      written.push(new TextDecoder().decode(payload.subarray(0, bytesWritten)));
      return { status: 'ok', bytesWritten };
    });
    installUsb(device);

    await printTestSlip(slip('ABCDEFGHIJ'));

    expect(device.transferOut).toHaveBeenCalledTimes(2);
    expect(written.join('')).toBe('ABCDEFGHIJ');
  });

  it('gives up on a hung transfer instead of blocking every later ticket', async () => {
    vi.useFakeTimers();
    try {
      const device = makeUsbDevice();
      device.transferOut = vi.fn(() => new Promise(() => undefined));
      installUsb(device);

      const result = printTestSlip(slip()).catch((err) => err);
      await vi.advanceTimersByTimeAsync(10_001);
      const error: any = await result;

      // The write queue is page-wide: leaving this pending would silently stop
      // the poll loop and every later Test Print in this window.
      expect(error.message).toContain('stopped responding');
      expect(device.releaseInterface).toHaveBeenCalledWith(0);
      expect(device.close).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a cancelled device chooser as a cancellation, not a raw NotFoundError', async () => {
    Object.defineProperty(navigator, 'usb', {
      configurable: true,
      value: {
        getDevices: vi.fn().mockResolvedValue([]),
        requestDevice: vi.fn().mockRejectedValue(
          Object.assign(new Error('No device selected.'), { name: 'NotFoundError' }),
        ),
      },
    });

    const error: any = await printTestSlip(slip()).catch((err) => err);

    expect(error.message).toBe('No USB printer was selected.');
  });

  it('never writes two tickets to one endpoint at the same time', async () => {
    const device = makeUsbDevice();
    let inFlight = 0;
    let maxInFlight = 0;
    device.transferOut = vi.fn(async (_endpointNumber: number, payload: Uint8Array) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      device.transfers.push(new TextDecoder().decode(payload));
      inFlight -= 1;
    });
    installUsb(device);

    // The poll loop and the printers page's Test Print button end up here at
    // the same time; interleaved writes print one garbled ticket.
    await Promise.all([printTestSlip(slip('A')), printTestSlip(slip('B'))]);

    expect(maxInFlight).toBe(1);
    expect(device.transfers).toEqual(['A', 'B']);
  });
});

/** A terminal component: the queued ticket path only exists inside the hook. */
const Terminal = () => {
  useHardwarePrinter();
  return null;
};

describe('queued tickets on a busy printer', () => {
  const addToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    delete (navigator as any).usb;
    (useAuthStore as any).mockReturnValue({ isAuthenticated: true });
    (useSocketStore as any).mockReturnValue({ socket: null });
    (useToastStore as any).mockImplementation((selector: any) => selector({ addToast }));
  });

  it('tells the operator to close the other window, and reports why on the ticket', async () => {
    const device = makeUsbDevice({ claim: () => { throw claimBusyError(); } });
    installUsb(device);
    (axiosClient.get as any).mockResolvedValue({
      data: [
        {
          id: 'job-1',
          station: 'kitchen',
          transport: 'USB',
          printerMacAddress: null,
          printerVendorId: VENDOR_ID.toString(16),
          printerProductId: PRODUCT_ID.toString(16),
          payloadBase64: btoa('TABLE 4'),
        },
      ],
    });
    (axiosClient.post as any).mockResolvedValue({ data: {} });

    render(<Terminal />);

    await waitFor(() => expect(axiosClient.post).toHaveBeenCalled(), { timeout: 5000 });

    const [url, body] = (axiosClient.post as any).mock.calls[0];
    expect(url).toBe('/print-jobs/frontend/job-1/ack');
    expect(body.status).toBe('FAILED');
    expect(body.error).toContain('Another window or program is using this printer');
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Printer is busy',
        message: expect.stringContaining('Close other copies of the app'),
      }),
    );
  });
});
