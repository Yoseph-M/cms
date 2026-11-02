import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Save, X, Eye, Printer } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { extractErrorMessage } from '../../utils/errorHandler';
import { formatCurrency } from '../../utils/currency';
import {
  DEFAULT_RECEIPT_SETTINGS,
  RECEIPT_SETTINGS_KEY,
  parseReceiptSettings,
  serializeReceiptSettings,
  type ReceiptSettings,
} from '../../utils/receiptSettings';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { cn } from '../../lib/utils';

/** Sample figures for the layout preview — fixed so every terminal looks the same. */
const SAMPLE = {
  subtotal: 250,
  tax: 0,
  total: 250,
  paid: 300,
  change: 50,
};

/** The serrated bottom edge of a torn receipt roll. */
const TornEdge: React.FC<{ className?: string }> = ({ className }) => {
  const teeth = 20;
  const path = `M0 0 ${Array.from({ length: teeth }, (_, index) => {
    const x = ((index + 1) * 120) / teeth;
    return `L${x.toFixed(1)} ${index % 2 === 0 ? 8 : 0}`;
  }).join(' ')} L120 0 Z`;

  return (
    <svg
      viewBox="0 0 120 8"
      preserveAspectRatio="none"
      aria-hidden
      className={cn('block h-2 w-full text-slate-300', className)}
    >
      <path d={path} fill="white" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
};

const PreviewRow: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <div className={cn('flex justify-between gap-2', strong && 'text-[1.1em] font-bold')}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

/**
 * Live preview of the printed receipt.
 *
 * Every value comes from the draft settings, so any field edit or toggle is
 * reflected immediately — the sample order itself never changes.
 */
const ReceiptPreview: React.FC<{ settings: ReceiptSettings }> = ({ settings }) => {
  const { t } = useTranslation();
  const narrow = settings.paperSize === '58mm';
  const businessName = settings.businessName.trim() || t('receiptSettings.businessNamePlaceholder');
  const businessEmail = settings.businessEmail.trim() || t('receiptSettings.businessEmailPlaceholder');
  const businessPhone = settings.businessPhone.trim() || t('receiptSettings.businessPhonePlaceholder');
  const businessAddress =
    settings.businessAddress.trim() || t('receiptSettings.businessAddressPlaceholder');

  const showContact =
    (settings.showEmail && businessEmail.length > 0) ||
    (settings.showBusinessPhone && businessPhone.length > 0) ||
    (settings.showBusinessAddress && businessAddress.length > 0);
  const showHeader = settings.showBusinessName || showContact;

  const showPaymentBlock =
    settings.showPaymentMethod || settings.showAmountPaid || settings.showChange;

  return (
    <div className="relative" data-testid="receipt-preview">
      {settings.copies > 1 && (
        <div
          aria-hidden
          className="absolute inset-x-3 -top-2 h-4 rounded-t-md border border-slate-300 bg-white/70"
        />
      )}
      <div
        className={cn(
          'relative mx-auto border border-b-0 border-slate-300 bg-white px-4 pb-3 pt-5 font-mono text-slate-900 shadow-md',
          narrow ? 'w-[220px] text-[10px]' : 'w-[290px] text-[11px]',
        )}
        style={{ borderTopLeftRadius: 6, borderTopRightRadius: 6 }}
      >
        {showHeader && (
          <div className="space-y-0.5 text-center">
            {settings.showBusinessName && (
              <p className="text-[1.15em] font-bold uppercase leading-tight">{businessName}</p>
            )}
            {settings.showEmail && <p className="break-all">{businessEmail}</p>}
            {settings.showBusinessPhone && <p className="break-all">{businessPhone}</p>}
            {settings.showBusinessAddress && <p className="break-words">{businessAddress}</p>}
          </div>
        )}

        {showHeader && <div className="my-2 border-t border-dashed border-slate-400" />}

        <div className="space-y-0.5">
          {settings.showReceiptNumber && (
            <PreviewRow label={t('receiptSettings.receiptNo')} value="000123" />
          )}
          {settings.showCashierName && (
            <PreviewRow label={t('receiptSettings.cashier')} value={t('receiptSettings.sampleCashier')} />
          )}
          {settings.showDateTime && (
            <PreviewRow label={t('receiptSettings.date')} value="05/09/2026 11:45 AM" />
          )}
        </div>

        <div className="my-2 border-t border-dashed border-slate-400" />

        <div className="grid grid-cols-[1fr_auto_auto] gap-2 font-bold">
          <span>{t('receiptSettings.items')}</span>
          <span className="text-right">{t('receiptSettings.qty')}</span>
          <span className="min-w-[48px] text-right">{t('receiptSettings.price')}</span>
        </div>

        <div className="mt-1 space-y-0.5">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <span className="truncate">{t('receiptSettings.sampleItem1')}</span>
            <span className="text-right">1</span>
            <span className="min-w-[48px] text-right">{formatCurrency(100)}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <span className="truncate">{t('receiptSettings.sampleItem2')}</span>
            <span className="text-right">1</span>
            <span className="min-w-[48px] text-right">{formatCurrency(150)}</span>
          </div>
        </div>

        <div className="my-2 border-t border-dashed border-slate-400" />

        {settings.taxDisplay === 'show' && (
          <>
            <PreviewRow label={t('receiptSettings.subtotal')} value={formatCurrency(SAMPLE.subtotal)} />
            <PreviewRow label={t('receiptSettings.tax')} value={formatCurrency(SAMPLE.tax)} />
          </>
        )}

        {settings.taxDisplay === 'included' && (
          <PreviewRow label={t('receiptSettings.taxIncluded')} value={formatCurrency(SAMPLE.tax)} />
        )}

        <div className="mt-1">
          <PreviewRow label={t('receiptSettings.total')} value={formatCurrency(SAMPLE.total)} strong />
        </div>

        {showPaymentBlock && (
          <>
            <div className="my-2 border-t border-dashed border-slate-400" />
            {settings.showPaymentMethod && (
              <PreviewRow label={t('receiptSettings.payment')} value={t('receiptSettings.cash')} />
            )}
            {settings.showAmountPaid && (
              <PreviewRow label={t('receiptSettings.amountPaid')} value={formatCurrency(SAMPLE.paid)} />
            )}
            {settings.showChange && (
              <PreviewRow label={t('receiptSettings.change')} value={formatCurrency(SAMPLE.change)} />
            )}
          </>
        )}

        {(settings.bottomMessage.trim() || settings.secondaryBottomMessage.trim()) && (
          <div className="my-2 border-t border-dashed border-slate-400" />
        )}
        {settings.bottomMessage.trim() && (
          <p className="text-center leading-snug">{settings.bottomMessage}</p>
        )}
        {settings.secondaryBottomMessage.trim() && (
          <p className="mt-1 text-center leading-snug">{settings.secondaryBottomMessage}</p>
        )}
      </div>
      <div className="mx-auto" style={{ width: narrow ? 220 : 290 }}>
        <TornEdge />
      </div>
      {settings.copies > 1 && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {t('receiptSettings.copiesNote', { count: settings.copies })}
        </p>
      )}
    </div>
  );
};

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="mb-1.5 block text-xs font-semibold text-foreground">{children}</span>
);

type ReceiptToggleKey = {
  [K in keyof ReceiptSettings]: ReceiptSettings[K] extends boolean ? K : never;
}[keyof ReceiptSettings];

/** Two toggle columns, exactly as laid out in the design. */
const TOGGLE_ROWS: Array<[ReceiptToggleKey, string, ReceiptToggleKey, string]> = [
  ['showEmail', 'receiptSettings.showEmail', 'showBusinessName', 'receiptSettings.showBusinessName'],
  [
    'showBusinessPhone',
    'receiptSettings.showBusinessPhone',
    'showBusinessAddress',
    'receiptSettings.showBusinessAddress',
  ],
  [
    'showCashierName',
    'receiptSettings.showCashierName',
    'showReceiptNumber',
    'receiptSettings.showReceiptNumber',
  ],
  [
    'showDateTime',
    'receiptSettings.showDateTime',
    'showPaymentMethod',
    'receiptSettings.showPaymentMethod',
  ],
  ['showAmountPaid', 'receiptSettings.showAmountPaid', 'showChange', 'receiptSettings.showChange'],
];

const ToggleCell: React.FC<{
  label: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}> = ({ label, checked, disabled, onCheckedChange, className }) => (
  <div className={cn('flex items-center justify-between gap-3', className)}>
    <span className="text-sm font-semibold text-foreground">{label}</span>
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
    />
  </div>
);

export const ReceiptPrintingSection: React.FC = () => {
  const { t } = useTranslation();
  const addToast = useToastStore((state) => state.addToast);
  const queryClient = useQueryClient();
  const settingQuery = useSystemSettingQuery(RECEIPT_SETTINGS_KEY);

  const saved = useMemo(
    () => parseReceiptSettings(settingQuery.data?.value),
    [settingQuery.data?.value],
  );
  const [draft, setDraft] = useState<ReceiptSettings>(saved);
  const [editing, setEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // A socket/refetch must not overwrite what the owner is typing.
  useEffect(() => {
    if (!editing) setDraft(saved);
  }, [saved, editing]);

  const update = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const value = serializeReceiptSettings(draft);
      const response = await axiosClient.patch(`/settings/system/${RECEIPT_SETTINGS_KEY}`, { value });
      queryClient.setQueryData(['systemSetting', RECEIPT_SETTINGS_KEY], response.data);
      setEditing(false);
      addToast({
        type: 'success',
        title: t('receiptSettings.saved'),
        message: t('receiptSettings.savedMsg'),
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: t('receiptSettings.saveFailed'),
        message: extractErrorMessage(err) || t('receiptSettings.saveFailedMsg'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(saved);
    setEditing(false);
  };

  const disabled = !editing || isSaving;

  const actions = editing ? (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleCancel}
        disabled={isSaving}
        leftIcon={<X className="h-4 w-4" />}
      >
        {t('receiptSettings.cancel')}
      </Button>
      <Button
        size="sm"
        onClick={handleSave}
        disabled={isSaving}
        leftIcon={<Save className="h-4 w-4" />}
      >
        {isSaving ? t('receiptSettings.saving') : t('receiptSettings.save')}
      </Button>
    </>
  ) : (
    <Button
      size="sm"
      onClick={() => setEditing(true)}
      disabled={settingQuery.isLoading}
      leftIcon={<Pencil className="h-4 w-4" />}
    >
      {t('receiptSettings.edit')}
    </Button>
  );

  return (
    <div className="grid grid-cols-1 gap-5 tablet-portrait:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] desktop:grid-cols-[minmax(0,2.2fr)_minmax(360px,0.9fr)]">
      <section
        id="receipt-printing"
        className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm tablet-portrait:p-6"
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-black/5 dark:text-sky-400 dark:ring-white/10">
              <Printer className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-tight text-foreground">
                {t('receiptSettings.title')}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t('receiptSettings.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 tablet-portrait:grid-cols-2">
            <label className="block">
              <FieldLabel>{t('receiptSettings.bottomMessage')}</FieldLabel>
              <Input
                value={draft.bottomMessage}
                onChange={(event) => update('bottomMessage', event.target.value)}
                placeholder={t('receiptSettings.bottomMessagePlaceholder')}
                maxLength={120}
                disabled={disabled}
                data-testid="receipt-bottom-message"
              />
            </label>
            <label className="block">
              <FieldLabel>{t('receiptSettings.secondaryBottomMessage')}</FieldLabel>
              <Input
                value={draft.secondaryBottomMessage}
                onChange={(event) => update('secondaryBottomMessage', event.target.value)}
                placeholder={t('receiptSettings.secondaryBottomMessagePlaceholder')}
                maxLength={120}
                disabled={disabled}
                data-testid="receipt-secondary-bottom-message"
              />
            </label>
          </div>

          <div className="grid gap-4 tablet-portrait:grid-cols-3">
            <label className="block">
              <FieldLabel>{t('receiptSettings.paperSize')}</FieldLabel>
              <Select
                value={draft.paperSize}
                onChange={(event) => update('paperSize', event.target.value as ReceiptSettings['paperSize'])}
                disabled={disabled}
                className="h-11"
                data-testid="receipt-paper-size"
              >
                <option value="58mm">{t('receiptSettings.paper58')}</option>
                <option value="80mm">{t('receiptSettings.paper80')}</option>
              </Select>
            </label>
            <label className="block">
              <FieldLabel>{t('receiptSettings.taxDisplay')}</FieldLabel>
              <Select
                value={draft.taxDisplay}
                onChange={(event) => update('taxDisplay', event.target.value as ReceiptSettings['taxDisplay'])}
                disabled={disabled}
                className="h-11"
                data-testid="receipt-tax-display"
              >
                <option value="show">{t('receiptSettings.taxShow')}</option>
                <option value="hide">{t('receiptSettings.taxHide')}</option>
                <option value="included">{t('receiptSettings.taxIncludedOption')}</option>
              </Select>
            </label>
            <label className="block">
              <FieldLabel>{t('receiptSettings.copies')}</FieldLabel>
              <Select
                value={String(draft.copies)}
                onChange={(event) => update('copies', Number(event.target.value))}
                disabled={disabled}
                className="h-11"
                data-testid="receipt-copies"
              >
                {[1, 2, 3].map((count) => (
                  <option key={count} value={count}>
                    {t('receiptSettings.copiesOption', { count })}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              {t('receiptSettings.showOnReceipt')}
            </p>
            <div className="border-t border-border/60" data-testid="receipt-toggles">
              {TOGGLE_ROWS.map(([leftKey, leftLabel, rightKey, rightLabel]) => (
                <div
                  key={leftKey}
                  className="grid border-b border-border/60 tablet-portrait:grid-cols-2"
                  data-testid={`receipt-toggle-row-${leftKey}`}
                >
                  <ToggleCell
                    label={t(leftLabel)}
                    checked={draft[leftKey]}
                    disabled={disabled}
                    onCheckedChange={(checked) => update(leftKey, checked)}
                    className="py-4 tablet-portrait:pr-4"
                  />
                  <ToggleCell
                    label={t(rightLabel)}
                    checked={draft[rightKey]}
                    disabled={disabled}
                    onCheckedChange={(checked) => update(rightKey, checked)}
                    className="border-t border-border/60 py-4 tablet-portrait:border-l tablet-portrait:border-t-0 tablet-portrait:pl-5 tablet-portrait:pr-4"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('receiptSettings.businessDetails')}
            </p>
            <div className="grid gap-4 tablet-portrait:grid-cols-2">
              <label className="block">
                <FieldLabel>{t('receiptSettings.businessName')}</FieldLabel>
                <Input
                  value={draft.businessName}
                  onChange={(event) => update('businessName', event.target.value)}
                  placeholder={t('receiptSettings.businessNamePlaceholder')}
                  maxLength={60}
                  disabled={disabled}
                  data-testid="receipt-business-name"
                />
              </label>
              <label className="block">
                <FieldLabel>{t('receiptSettings.businessEmail')}</FieldLabel>
                <Input
                  type="email"
                  value={draft.businessEmail}
                  onChange={(event) => update('businessEmail', event.target.value)}
                  placeholder={t('receiptSettings.businessEmailPlaceholder')}
                  maxLength={80}
                  disabled={disabled}
                  data-testid="receipt-business-email"
                />
              </label>
              <label className="block">
                <FieldLabel>{t('receiptSettings.businessPhone')}</FieldLabel>
                <Input
                  value={draft.businessPhone}
                  onChange={(event) => update('businessPhone', event.target.value)}
                  placeholder={t('receiptSettings.businessPhonePlaceholder')}
                  maxLength={30}
                  disabled={disabled}
                  data-testid="receipt-business-phone"
                />
              </label>
              <label className="block">
                <FieldLabel>{t('receiptSettings.businessAddress')}</FieldLabel>
                <Input
                  value={draft.businessAddress}
                  onChange={(event) => update('businessAddress', event.target.value)}
                  placeholder={t('receiptSettings.businessAddressPlaceholder')}
                  maxLength={120}
                  disabled={disabled}
                  data-testid="receipt-business-address"
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      <aside className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-foreground">
          {t('receiptSettings.preview')}
        </h3>
        <ReceiptPreview settings={draft} />
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {t('receiptSettings.previewHint')}
        </p>
      </aside>
    </div>
  );
};

export default ReceiptPrintingSection;

/** Re-exported so tests can build a known-good default without importing JSON. */
export { DEFAULT_RECEIPT_SETTINGS };
