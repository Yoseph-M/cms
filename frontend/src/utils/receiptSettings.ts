/**
 * Receipt/ticket layout settings.
 *
 * Stored as one JSON value under the `receiptSettings` SystemSetting key so the
 * owner edits a single card and every terminal reads the same layout. The
 * backend parses the same shape when it builds ESC/POS bytes, so a new field
 * must be added in both places (and with a default that keeps old records
 * readable).
 */

export type ReceiptPaperSize = '58mm' | '80mm';
export type ReceiptTaxDisplay = 'show' | 'hide' | 'included';

export interface PrintLayoutSettings {
  bottomMessage: string;
  secondaryBottomMessage: string;
  paperSize: ReceiptPaperSize;
  taxDisplay: ReceiptTaxDisplay;
  copies: number;
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  showBusinessName: boolean;
  showEmail: boolean;
  showBusinessPhone: boolean;
  showBusinessAddress: boolean;
  showCashierName: boolean;
  showReceiptNumber: boolean;
  showDateTime: boolean;
  showPaymentMethod: boolean;
  showAmountPaid: boolean;
  showChange: boolean;
}

/** Customer receipt settings plus an independently editable kitchen ticket layout. */
export interface ReceiptSettings extends PrintLayoutSettings {
  kitchenTicket: PrintLayoutSettings;
}

export const RECEIPT_SETTINGS_KEY = 'receiptSettings';

export const DEFAULT_PRINT_LAYOUT_SETTINGS: PrintLayoutSettings = {
  bottomMessage: 'Thank you for shopping with us!',
  secondaryBottomMessage: 'Visit us again!',
  paperSize: '80mm',
  taxDisplay: 'show',
  copies: 1,
  businessName: '',
  businessEmail: '',
  businessPhone: '',
  businessAddress: '',
  showBusinessName: true,
  showEmail: true,
  showBusinessPhone: true,
  showBusinessAddress: true,
  showCashierName: true,
  showReceiptNumber: true,
  showDateTime: true,
  showPaymentMethod: true,
  showAmountPaid: true,
  showChange: true,
};

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  ...DEFAULT_PRINT_LAYOUT_SETTINGS,
  kitchenTicket: { ...DEFAULT_PRINT_LAYOUT_SETTINGS },
};

/** Characters that fit on one printed line, per paper width. */
export const PAPER_SIZE_COLUMNS: Record<ReceiptPaperSize, number> = {
  '58mm': 32,
  '80mm': 48,
};

const asString = (value: unknown, fallback: string, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : fallback;

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export function normalizePrintLayoutSettings(raw: unknown): PrintLayoutSettings {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const paperSize = value.paperSize === '58mm' ? '58mm' : '80mm';
  const taxDisplay: ReceiptTaxDisplay =
    value.taxDisplay === 'hide' || value.taxDisplay === 'included'
      ? value.taxDisplay
      : 'show';
  const copies = Number(value.copies);

  return {
    bottomMessage: asString(value.bottomMessage, DEFAULT_PRINT_LAYOUT_SETTINGS.bottomMessage, 120),
    secondaryBottomMessage: asString(
      value.secondaryBottomMessage,
      DEFAULT_PRINT_LAYOUT_SETTINGS.secondaryBottomMessage,
      120,
    ),
    paperSize,
    taxDisplay,
    copies: Number.isFinite(copies) ? Math.min(3, Math.max(1, Math.round(copies))) : 1,
    businessName: asString(value.businessName, '', 60),
    businessEmail: asString(value.businessEmail, '', 80),
    businessPhone: asString(value.businessPhone, '', 30),
    businessAddress: asString(value.businessAddress, '', 120),
    showBusinessName: asBoolean(value.showBusinessName, true),
    showEmail: asBoolean(value.showEmail, true),
    showBusinessPhone: asBoolean(value.showBusinessPhone, true),
    showBusinessAddress: asBoolean(value.showBusinessAddress, true),
    showCashierName: asBoolean(value.showCashierName, true),
    showReceiptNumber: asBoolean(value.showReceiptNumber, true),
    showDateTime: asBoolean(value.showDateTime, true),
    showPaymentMethod: asBoolean(value.showPaymentMethod, true),
    showAmountPaid: asBoolean(value.showAmountPaid, true),
    showChange: asBoolean(value.showChange, true),
  };
}

export function normalizeReceiptSettings(raw: unknown): ReceiptSettings {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const receipt = normalizePrintLayoutSettings(value);
  // Existing installations only stored one layout. Seed the kitchen ticket
  // from that layout once so the current printed result is preserved.
  const kitchenTicket = normalizePrintLayoutSettings(value.kitchenTicket ?? value);
  return { ...receipt, kitchenTicket };
}

/** Parse the stored JSON, falling back to defaults for missing/corrupt values. */
export function parseReceiptSettings(value?: string | null): ReceiptSettings {
  if (!value) return { ...DEFAULT_RECEIPT_SETTINGS };
  try {
    return normalizeReceiptSettings(JSON.parse(value));
  } catch {
    return { ...DEFAULT_RECEIPT_SETTINGS };
  }
}

export function serializeReceiptSettings(settings: ReceiptSettings): string {
  return JSON.stringify(normalizeReceiptSettings(settings));
}
