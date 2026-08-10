import React, { useEffect, useState } from 'react';
import { Image, ReceiptText } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { useToastStore } from '../../store/toastStore';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';

export const ReceiptCustomizationSection: React.FC = () => {
  const footerQuery = useSystemSettingQuery('receiptFooter');
  const logoQuery = useSystemSettingQuery('receiptLogo');
  const { addToast } = useToastStore();
  const [footer, setFooter] = useState('Thank you for dining with us!');
  const [logo, setLogo] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (footerQuery.data) setFooter(footerQuery.data.value); if (logoQuery.data) setLogo(logoQuery.data.value); }, [footerQuery.data, logoQuery.data]);
  const upload = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => setLogo(String(reader.result)); reader.readAsDataURL(file); };
  const save = async () => { setSaving(true); try { await Promise.all([axiosClient.patch('/settings/system/receiptFooter', { value: footer || ' ' }), axiosClient.patch('/settings/system/receiptLogo', { value: logo || ' ' })]); addToast({ type: 'success', title: 'Receipt design saved' }); } catch { addToast({ type: 'error', title: 'Could not save receipt design' }); } finally { setSaving(false); } };
  return <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><ReceiptText className="w-4 h-4 text-primary" />Receipt customization</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><div className="space-y-3"><label className="text-xs text-muted-foreground block">Business logo</label><Input type="file" accept="image/*" onChange={e => upload(e.target.files?.[0])} /><label className="text-xs text-muted-foreground block">Footer message</label><Input value={footer} onChange={e => setFooter(e.target.value)} maxLength={120} /><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save receipt design'}</Button></div><div className="rounded-lg border border-dashed border-border p-5 text-center font-mono text-xs"><p className="font-bold text-sm">Receipt preview</p>{logo ? <img src={logo} alt="Business logo preview" className="mx-auto my-3 max-h-16 max-w-32 object-contain" /> : <Image className="mx-auto my-3 h-8 w-8 text-muted-foreground" />}<p className="border-y border-dashed border-border py-3">Order #00000000<br />Table 1<br />────────────<br />TOTAL&nbsp;&nbsp;ETB 0.00</p><p className="mt-3">{footer}</p></div></CardContent></Card>;
};
