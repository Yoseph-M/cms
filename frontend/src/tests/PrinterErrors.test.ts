import { describe, it, expect, vi } from 'vitest';

/**
 * Staff read these messages at the till. They must name the cause and the fix —
 * never the browser API, the driver, or a number from the operating system.
 */
vi.mock('../i18n', () => {
  const en = require('../locales/en/common.json');
  const lookup = (key: string): any =>
    key.split('.').reduce<any>((node, part) => (node == null ? undefined : node[part]), en);
  return {
    default: {
      t: (key: string) => (typeof lookup(key) === 'string' ? lookup(key) : key),
    },
  };
});

import { describePrinterFailure } from '../utils/printerErrors';

const withName = (name: string, message: string) => Object.assign(new Error(message), { name });

describe('printer failure copy', () => {
  it('explains a held interface without repeating Chromium or libusb text', () => {
    const failure = describePrinterFailure(
      withName(
        'NetworkError',
        "Failed to execute 'claimInterface' on 'USBService': Unable to claim interface.",
      ),
    );

    expect(failure.title).toBe('Printer is busy');
    expect(failure.message).toContain('Another window or program is using this printer');
    expect(failure.message).not.toMatch(/claimInterface|USBService|NetworkError|libusb/);
  });

  it('distinguishes a permission block from a cable problem', () => {
    expect(
      describePrinterFailure(withName('SecurityError', 'Access denied.')).title,
    ).toBe('Printer not allowed');

    expect(
      describePrinterFailure(
        withName('NotFoundError', 'The device was disconnected.'),
      ).title,
    ).toBe('Printer disconnected');
  });

  it('reports a cancelled chooser as a cancellation', () => {
    const failure = describePrinterFailure(
      withName('NotFoundError', 'No device selected.'),
    );

    expect(failure.title).toBe('No printer selected');
    expect(failure.message).toContain('chooser was closed');
  });

  it('uses the stable error codes, not translated message text', () => {
    expect(
      describePrinterFailure(Object.assign(new Error('anything'), { code: 'USB_WRITE_TIMEOUT' }))
        .title,
    ).toBe('Printer not responding');
    expect(
      describePrinterFailure(Object.assign(new Error('anything'), { code: 'USB_NO_ENDPOINT' }))
        .title,
    ).toBe('Printer not supported');
  });

  it('never shows an unclassified error verbatim', () => {
    const failure = describePrinterFailure(new Error('Error 0x5f3a at libusb_claim_interface'));

    expect(failure.title).toBe('Ticket not printed');
    expect(failure.message).not.toMatch(/0x5f3a|libusb|Error \d/);
    expect(failure.message).toContain('Check that it is switched on');
  });
});
