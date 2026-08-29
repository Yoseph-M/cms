import { extractErrorMessage } from '../../utils/errorHandler';
import React, { useEffect, useState } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoadingState } from '../common/LoadingState';
import { Building2, MapPin, Phone, Banknote, Save } from 'lucide-react';
import { formatEthiopianPhone, ETHIOPIAN_COUNTRY_CODE } from '../../utils/phone';
import { cn } from '../../lib/utils';

const BUSINESS_KEYS = ['businessName', 'businessAddress', 'businessPhone', 'currency'] as const;

interface FormFieldProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

const FormField: React.FC<FormFieldProps> = ({ icon: Icon, label, hint, children, className }) => (
  <div className={cn('space-y-1.5', className)}>
    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
  </div>
);

export const BusinessProfileSection: React.FC = () => {
  const { addToast } = useToastStore();
  const [form, setForm] = useState({
    businessName: '',
    businessAddress: '',
    businessPhone: '',
    currency: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const queries = BUSINESS_KEYS.map((key) => useSystemSettingQuery(key));

  useEffect(() => {
    if (queries.every((q) => !q.isLoading)) {
      setForm({
        businessName: queries[0].data?.value || '',
        businessAddress: queries[1].data?.value || '',
        businessPhone: queries[2].data?.value || '',
        currency: queries[3].data?.value || '',
      });
      setLoaded(true);
    }
  }, [queries.map((q) => q.data?.value).join('|'), queries.every((q) => !q.isLoading)]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await Promise.all(
        BUSINESS_KEYS.map((key) =>
          axiosClient.patch(`/settings/system/${key}`, { value: form[key] }),
        ),
      );
      addToast({ type: 'success', title: 'Saved', message: 'Business profile updated.' });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: extractErrorMessage(err) || 'Could not save business profile.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!loaded || queries.some((q) => q.isLoading)) {
    return <LoadingState message="Loading business profile..." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField icon={Building2} label="Business name">
          <Input
            value={form.businessName}
            onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
            placeholder="Café Flow"
          />
        </FormField>
        <FormField icon={Banknote} label="Currency code" hint="3-letter ISO code shown on receipts.">
          <Input
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
            placeholder="ETB"
            maxLength={3}
          />
        </FormField>
        <FormField icon={MapPin} label="Address" className="sm:col-span-2">
          <Input
            value={form.businessAddress}
            onChange={(e) => setForm((f) => ({ ...f, businessAddress: e.target.value }))}
            placeholder="123 Bole Road, Addis Ababa"
          />
        </FormField>
        <FormField icon={Phone} label="Phone" hint="Used on receipts and customer-facing comms.">
          <Input
            type="tel"
            value={form.businessPhone}
            maxLength={ETHIOPIAN_COUNTRY_CODE.length + 9}
            placeholder="+251 9XX XXX XXX"
            onChange={(e) => setForm((f) => ({ ...f, businessPhone: formatEthiopianPhone(e.target.value) }))}
          />
        </FormField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <p className="text-xs text-muted-foreground">
          Changes apply to every device immediately after saving.
        </p>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          leftIcon={isSaving ? undefined : <Save className="h-4 w-4" />}
        >
          {isSaving ? 'Saving…' : 'Save business profile'}
        </Button>
      </div>
    </div>
  );
};
