import { prisma } from './prisma.service';
import { logger } from '../utils/logger';

/**
 * Receipt/ticket layout, edited in Settings → Receipts & Printing.
 *
 * Stored as JSON under one SystemSetting key so every terminal and the server
 * render the same layout. The frontend has the same shape in
 * `src/utils/receiptSettings.ts` — keep the two in step, and keep every field
 * optional when parsing so an older record never breaks printing.
 */
export type ReceiptPaperSize = '58mm' | '80mm';
export type ReceiptTaxDisplay = 'show' | 'hide' | 'included';

export interface ReceiptSettings {
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

export const RECEIPT_SETTINGS_KEY = 'receiptSettings';

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
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

const asString = (value: unknown, fallback: string, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : fallback;

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export function normalizeReceiptSettings(raw: unknown): ReceiptSettings {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const copies = Number(value.copies);

  return {
    bottomMessage: asString(value.bottomMessage, DEFAULT_RECEIPT_SETTINGS.bottomMessage, 120),
    secondaryBottomMessage: asString(
      value.secondaryBottomMessage,
      DEFAULT_RECEIPT_SETTINGS.secondaryBottomMessage,
      120,
    ),
    paperSize: value.paperSize === '58mm' ? '58mm' : '80mm',
    taxDisplay:
      value.taxDisplay === 'hide' || value.taxDisplay === 'included'
        ? value.taxDisplay
        : 'show',
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

/**
 * Read the layout for the next ticket.
 *
 * Deliberately uncached: settings are read once per ticket, and an owner who
 * just saved a paper size should see it on the very next order — not after a
 * cache TTL. A missing or corrupt record falls back to defaults rather than
 * failing the print.
 */
export async function getReceiptSettings(): Promise<ReceiptSettings> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: RECEIPT_SETTINGS_KEY } });
    if (!row?.value) return { ...DEFAULT_RECEIPT_SETTINGS };
    return normalizeReceiptSettings(JSON.parse(row.value));
  } catch (err) {
    logger.warn({ err }, 'Could not read receipt settings; using defaults');
    return { ...DEFAULT_RECEIPT_SETTINGS };
  }
}
