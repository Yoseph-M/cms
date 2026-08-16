import React, { useEffect, useState } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoadingState } from '../common/LoadingState';
import { Building2 } from 'lucide-react';
import { formatEthiopianPhone, ETHIOPIAN_COUNTRY_CODE } from '../../utils/phone';

const BUSINESS_KEYS = ['businessName', 'businessAddress', 'businessPhone', 'currency'] as const;

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
          axiosClient.patch(`/settings/system/${key}`, { value: form[key] })
        )
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          Business Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Business name</label>
            <Input
              value={form.businessName}
              onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Currency code</label>
            <Input
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              placeholder="ETB"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Address</label>
            <Input
              value={form.businessAddress}
              onChange={(e) => setForm((f) => ({ ...f, businessAddress: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
            <Input
              type="tel"
              value={form.businessPhone}
              maxLength={ETHIOPIAN_COUNTRY_CODE.length + 9}
              placeholder="+251 9XX XXX XXX"
              onChange={(e) => setForm((f) => ({ ...f, businessPhone: formatEthiopianPhone(e.target.value) }))}
            />
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save Business Profile'}
        </Button>
      </CardContent>
    </Card>
  );
};
