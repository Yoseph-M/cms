import i18n from '../i18n';

/**
 * Turns any printer failure into the two things an operator needs: what went
 * wrong, and what to do next.
 *
 * Raw DOM errors ("NetworkError: Failed to execute 'claimInterface' on
 * 'USBService'") and driver numbers are deliberately not shown — the till is
 * staffed by waiters and cashiers, not browser engineers. The original error is
 * still logged to the console for whoever services the hardware.
 *
 * Errors raised by our own print path carry a stable `code`, so the mapping
 * does not depend on the user's language. Name/message matching is only a
 * fallback for raw browser errors.
 */
export interface PrinterFailureCopy {
  title: string;
  message: string;
}

const copy = (titleKey: string, messageKey: string): PrinterFailureCopy => ({
  title: i18n.t(titleKey),
  message: i18n.t(messageKey),
});

export function describePrinterFailure(error: unknown): PrinterFailureCopy {
  const err = error as { code?: unknown; name?: unknown; message?: unknown } | null | undefined;
  const code = typeof err?.code === 'string' ? err.code : '';
  const name = typeof err?.name === 'string' ? err.name : '';
  const message = String(err?.message ?? '');

  switch (code) {
    case 'USB_CLAIM_BUSY':
      return copy('printers.printerBusy', 'printers.printerBusyMsg');
    case 'USB_WRITE_TIMEOUT':
      return copy('printers.printerOffline', 'printers.printerOfflineMsg');
    case 'USB_WRITE_STALLED':
      return copy('printers.printerOffline', 'printers.usbWriteStalled');
    case 'USB_NO_ENDPOINT':
      return copy('printers.printerIncompatible', 'printers.printerIncompatibleMsg');
    case 'USB_SELECTION_CANCELLED':
    case 'BLUETOOTH_SELECTION_CANCELLED':
      return copy('printers.printerCancelled', 'printers.printerCancelledMsg');
    case 'USB_UNSUPPORTED':
      return copy('printers.printerIncompatible', 'printers.usbUnsupported');
    case 'BLUETOOTH_UNSUPPORTED':
      return copy('printers.printerIncompatible', 'printers.bluetoothUnsupported');
    case 'USB_NOT_PAIRED':
      return copy('printers.printerFailed', 'printers.usbNotPaired');
    case 'BLUETOOTH_NOT_PAIRED':
      return copy('printers.printerFailed', 'printers.bluetoothNotPaired');
    case 'BLUETOOTH_GATT_FAILED':
      return copy('printers.printerOffline', 'printers.printerOfflineMsg');
    default:
      break;
  }

  // Raw browser errors, in the order that best identifies the cause.
  if (name === 'NetworkError' && /claim/i.test(message)) {
    return copy('printers.printerBusy', 'printers.printerBusyMsg');
  }
  if (name === 'SecurityError' || /permission|not allowed|denied/i.test(message)) {
    return copy('printers.printerBlocked', 'printers.printerBlockedMsg');
  }
  if (name === 'NotFoundError') {
    return /device selected|chooser|cancel/i.test(message)
      ? copy('printers.printerCancelled', 'printers.printerCancelledMsg')
      : copy('printers.printerUnplugged', 'printers.printerUnpluggedMsg');
  }
  if (/disconnect|unplug|device was lost|lost its connection/i.test(message)) {
    return copy('printers.printerUnplugged', 'printers.printerUnpluggedMsg');
  }
  if (/timed out|timeout|stopped responding|did not respond/i.test(message)) {
    return copy('printers.printerOffline', 'printers.printerOfflineMsg');
  }
  if (/no bulk|endpoint|not support|unsupported/i.test(message)) {
    return copy('printers.printerIncompatible', 'printers.printerIncompatibleMsg');
  }

  // Never surface the raw text: a generic, actionable sentence is better than
  // an error code the operator cannot act on.
  return copy('printers.printerFailed', 'printers.printerFailedMsg');
}
