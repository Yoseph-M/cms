import React, { useState, useEffect } from 'react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { X, Building2, Store, Printer, Coffee, Users, Bell, ArrowRight, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const NOTIFICATION_TYPES = [
  { key: 'MISSING_ATTENDANCE', label: 'Missing attendance alerts' },
  { key: 'PRINTER_FAILURE', label: 'Printer failure alerts' },
  { key: 'PAYROLL_PERIOD_DUE', label: 'Payroll period reminders' },
  { key: 'MENU_ITEM_UNAVAILABLE', label: 'Menu availability changes' },
  { key: 'SYSTEM_OVERRIDE', label: 'System override notices' },
  { key: 'QUIET_HOURS', label: 'Quiet hours (no non-critical alerts 10PM-6AM)' },
];

export const OnboardingWizard: React.FC = () => {
  const { isOpen, stepIndex, closeWizard, setStep } = useOnboardingStore();
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  
  const completedQuery = useSystemSettingQuery('onboardingCompleted');
  const stepQuery = useSystemSettingQuery('onboardingStep');
  
  const [isSaving, setIsSaving] = useState(false);

  // Sync internal step with global store on open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen]);

  const saveProgress = async (nextStep: number) => {
    try {
      await axiosClient.patch('/settings/system/onboardingStep', { value: nextStep.toString() });
      queryClient.setQueryData(['systemSetting', 'onboardingStep'], (old: any) => 
        old ? { ...old, value: nextStep.toString() } : old
      );
      setStep(nextStep);
    } catch (e) {
      console.error('Failed to save progress', e);
      setStep(nextStep); // optimistically advance anyway
    }
  };

  const handleFinish = async () => {
    try {
      await axiosClient.patch('/settings/system/onboardingCompleted', { value: 'true' });
      queryClient.setQueryData(['systemSetting', 'onboardingCompleted'], (old: any) => 
        old ? { ...old, value: 'true' } : old
      );
      
      closeWizard();
    } catch (e) {
      addToast({ type: 'error', title: 'Error finishing setup' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Setup Guide • Step {stepIndex + 1} of 7
          </h2>
          <Button variant="ghost" size="icon" onClick={closeWizard} className="-mr-2 rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          {stepIndex === 0 && <Step1Profile onNext={() => saveProgress(1)} />}
          {stepIndex === 1 && <Step2Service onNext={() => saveProgress(2)} />}
          {stepIndex === 2 && <Step3Printer onNext={() => saveProgress(3)} onSkip={() => saveProgress(3)} />}
          {stepIndex === 3 && <Step4Menu onNext={() => saveProgress(4)} onSkip={() => saveProgress(4)} />}
          {stepIndex === 4 && <Step5Team onNext={() => saveProgress(5)} onSkip={() => saveProgress(5)} />}
          {stepIndex === 5 && <Step6Notifications onNext={() => saveProgress(6)} />}
          {stepIndex === 6 && <Step7Complete onFinish={handleFinish} />}
        </div>
      </div>
    </div>
  );
};

// --- Step 1: Profile ---
const Step1Profile: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const { addToast } = useToastStore();
  const [form, setForm] = useState({ businessName: '', currency: 'ETB' });
  const [logo, setLogo] = useState('');
  const [saving, setSaving] = useState(false);
  
  const bNameQuery = useSystemSettingQuery('businessName');
  const currQuery = useSystemSettingQuery('currency');
  const logoQuery = useSystemSettingQuery('receiptLogo');

  useEffect(() => {
    if (bNameQuery.data) setForm(f => ({ ...f, businessName: bNameQuery.data.value || '' }));
    if (currQuery.data) setForm(f => ({ ...f, currency: currQuery.data.value || 'ETB' }));
    if (logoQuery.data) setLogo(logoQuery.data.value || '');
  }, [bNameQuery.data, currQuery.data, logoQuery.data]);

  const upload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        axiosClient.patch('/settings/system/businessName', { value: form.businessName || ' ' }),
        axiosClient.patch('/settings/system/currency', { value: form.currency || ' ' }),
        axiosClient.patch('/settings/system/receiptLogo', { value: logo || ' ' })
      ]);
      onNext();
    } catch (e) {
      addToast({ type: 'error', title: 'Could not save profile' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 text-primary mb-2">
        <div className="p-3 rounded-full bg-primary/10"><Building2 className="w-6 h-6" /></div>
        <h1 className="text-2xl font-display font-bold text-foreground">Business Profile</h1>
      </div>
      <p className="text-muted-foreground">Let's start with the basics. These details will appear on receipts and reports.</p>
      
      <div className="space-y-4 pt-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Business Name</label>
          <Input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} placeholder="CafeFlow Coffee" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Currency</label>
            <Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} placeholder="ETB" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Business Logo</label>
          <div className="flex items-center gap-4">
            {logo ? <img src={logo} className="w-16 h-16 object-contain rounded-lg border bg-white" alt="Logo" /> : <div className="w-16 h-16 rounded-lg border border-dashed bg-muted flex items-center justify-center text-xs text-muted-foreground">No logo</div>}
            <Input type="file" accept="image/*" onChange={e => upload(e.target.files?.[0])} className="flex-1" />
          </div>
        </div>
      </div>
      <div className="pt-6 flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">Continue <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
};

// --- Step 2: Service Type ---
const Step2Service: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const { addToast } = useToastStore();
  const [type, setType] = useState<'TABLE'|'COUNTER'|null>(null);
  const [tableCount, setTableCount] = useState('12');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!type) return;
    setSaving(true);
    try {
      if (type === 'COUNTER') {
        await axiosClient.patch('/settings/system/cashierOrderingEnabled', { value: 'true' });
        await axiosClient.patch('/settings/system/tableCount', { value: tableCount || '12' });
      } else {
        await axiosClient.patch('/settings/system/cashierOrderingEnabled', { value: 'false' });
      }
      onNext();
    } catch (e) {
      addToast({ type: 'error', title: 'Could not save preferences' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 text-primary mb-2">
        <div className="p-3 rounded-full bg-primary/10"><Store className="w-6 h-6" /></div>
        <h1 className="text-2xl font-display font-bold text-foreground">How do you take orders?</h1>
      </div>
      
      <div className="grid sm:grid-cols-2 gap-4 pt-4">
        <button 
          onClick={() => setType('TABLE')}
          className={`text-left p-5 rounded-xl border-2 transition-all ${type === 'TABLE' ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-border hover:border-primary/40'}`}
        >
          <h3 className="font-bold text-foreground text-lg mb-2">Table Service</h3>
          <p className="text-sm text-muted-foreground">Staff take orders at the table using a companion app. The cashier only settles the bill.</p>
        </button>
        <button 
          onClick={() => setType('COUNTER')}
          className={`text-left p-5 rounded-xl border-2 transition-all ${type === 'COUNTER' ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-border hover:border-primary/40'}`}
        >
          <h3 className="font-bold text-foreground text-lg mb-2">Counter Service</h3>
          <p className="text-sm text-muted-foreground">Customers order and pay at the till. Cashiers create orders directly.</p>
        </button>
      </div>

      {type === 'COUNTER' && (
        <div className="mt-6 p-5 rounded-xl bg-muted/50 border border-border animate-fade-in">
          <label className="text-sm font-medium mb-1 block text-foreground">How many tables or pickup zones do you have?</label>
          <p className="text-xs text-muted-foreground mb-3">This configures the grid shown to cashiers when assigning an order.</p>
          <Input type="number" min="1" max="100" value={tableCount} onChange={e => setTableCount(e.target.value)} className="max-w-[120px]" />
        </div>
      )}

      {type === 'TABLE' && (
        <div className="mt-6 p-5 rounded-xl bg-primary/10 text-primary-foreground border border-primary/20 animate-fade-in">
          <h4 className="font-bold text-primary mb-2">Setting up the ordering app</h4>
          <p className="text-sm text-foreground/90">
            Waiters can use any mobile device to take orders. They just need to log in to this same URL. 
            The system automatically provides a mobile-optimized interface for them.
          </p>
        </div>
      )}

      <div className="pt-6 flex justify-end">
        <Button onClick={handleSave} disabled={saving || !type} className="gap-2">Continue <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
};

// --- Step 3: First Printer ---
const Step3Printer: React.FC<{ onNext: () => void, onSkip: () => void }> = ({ onNext, onSkip }) => {
  const { addToast } = useToastStore();
  const [form, setForm] = useState({ station: 'kitchen', ip: '', port: '9100' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [createdId, setCreatedId] = useState<string|null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axiosClient.post('/settings/printers', form);
      setCreatedId(res.data.id);
      addToast({ type: 'success', title: 'Printer added' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to add printer', message: e.response?.data?.error });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!createdId) return;
    setTesting(true);
    try {
      await axiosClient.post(`/settings/printers/${createdId}/test-print`);
      addToast({ type: 'success', title: 'Nailed it — check your printer 🖨️' });
      setTimeout(onNext, 1500); // Auto advance after success
    } catch (e) {
      addToast({ type: 'error', title: 'Test failed', message: 'Check printer IP and power.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 text-primary mb-2">
        <div className="p-3 rounded-full bg-primary/10"><Printer className="w-6 h-6" /></div>
        <h1 className="text-2xl font-display font-bold text-foreground">Your First Printer</h1>
      </div>
      <p className="text-muted-foreground">Let's connect a receipt or kitchen printer. Make sure it's connected to your network.</p>

      {!createdId ? (
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="text-sm font-medium mb-1 block">Station</label>
              <Select value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))}>
                <option value="kitchen">Kitchen</option>
                <option value="bar">Bar</option>
                <option value="cashier">Cashier</option>
              </Select>
            </div>
            <div className="col-span-1">
              <label className="text-sm font-medium mb-1 block">IP Address</label>
              <Input value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} placeholder="192.168.1.100" />
            </div>
            <div className="col-span-1">
              <label className="text-sm font-medium mb-1 block">Port</label>
              <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} placeholder="9100" />
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-xl border border-border bg-muted/30 text-center animate-fade-in">
          <CheckCircle2 className="w-12 h-12 text-[hsl(var(--success))] mx-auto mb-3" />
          <h3 className="font-bold text-foreground text-lg">Printer Registered</h3>
          <p className="text-sm text-muted-foreground mb-4">Let's make sure it's working properly.</p>
          <Button onClick={handleTest} disabled={testing} className="w-full max-w-xs mx-auto">
            {testing ? 'Sending...' : 'Send test ticket'}
          </Button>
        </div>
      )}

      <div className="pt-6 flex justify-between items-center">
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">Skip for now</Button>
        {!createdId ? (
          <Button onClick={handleSave} disabled={saving || !form.ip}>Save Printer</Button>
        ) : (
          <Button variant="secondary" onClick={onNext} className="gap-2">Continue <ArrowRight className="w-4 h-4" /></Button>
        )}
      </div>
    </div>
  );
};

// --- Step 4: Menu ---
const Step4Menu: React.FC<{ onNext: () => void, onSkip: () => void }> = ({ onNext, onSkip }) => {
  const { addToast } = useToastStore();
  const [items, setItems] = useState([{ name: '', category: 'FOOD', price: '' }]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const validItems = items.filter(i => i.name && i.price);
    if (validItems.length === 0) return onSkip();
    
    setSaving(true);
    try {
      await Promise.all(validItems.map(item => 
        axiosClient.post('/menu', {
          name: item.name,
          category: item.category,
          price: parseFloat(item.price)
        })
      ));
      addToast({ type: 'success', title: `Added ${validItems.length} items` });
      onNext();
    } catch (e) {
      addToast({ type: 'error', title: 'Failed to add items' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 text-primary mb-2">
        <div className="p-3 rounded-full bg-primary/10"><Coffee className="w-6 h-6" /></div>
        <h1 className="text-2xl font-display font-bold text-foreground">Your Menu</h1>
      </div>
      <p className="text-muted-foreground">Quickly add a few bestsellers, or skip to import your full catalog via CSV later.</p>

      <div className="space-y-3 pt-4">
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-3 items-start">
            <div className="flex-1">
              <Input placeholder="Item name (e.g. Latte)" value={item.name} onChange={e => {
                const newItems = [...items];
                newItems[idx].name = e.target.value;
                setItems(newItems);
              }} />
            </div>
            <div className="w-32">
              <Select value={item.category} onChange={e => {
                const newItems = [...items];
                newItems[idx].category = e.target.value;
                setItems(newItems);
              }}>
                <option value="FOOD">Food</option>
                <option value="BEVERAGE">Beverage</option>
                <option value="DESSERT">Dessert</option>
              </Select>
            </div>
            <div className="w-24">
              <Input type="number" placeholder="Price" value={item.price} onChange={e => {
                const newItems = [...items];
                newItems[idx].price = e.target.value;
                setItems(newItems);
              }} />
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setItems([...items, { name: '', category: 'FOOD', price: '' }])}>
          + Add another
        </Button>
      </div>

      <div className="pt-6 flex justify-between items-center">
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">Skip for now</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">Save & Continue <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
};

// --- Step 5: Team ---
const Step5Team: React.FC<{ onNext: () => void, onSkip: () => void }> = ({ onNext, onSkip }) => {
  const { addToast } = useToastStore();
  const [form, setForm] = useState({ name: '', email: '', role: 'MANAGER', password: '' });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axiosClient.post('/users', form);
      setCreated({ email: form.email, password: form.password });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to add user', message: e.response?.data?.error });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 text-primary mb-2">
        <div className="p-3 rounded-full bg-primary/10"><Users className="w-6 h-6" /></div>
        <h1 className="text-2xl font-display font-bold text-foreground">Your Team</h1>
      </div>
      <p className="text-muted-foreground">Create an account for your first manager or cashier.</p>

      {!created ? (
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Alex" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Role</label>
              <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="MANAGER">Manager</option>
                <option value="CASHIER">Cashier</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="alex@example.com" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Temporary Password</label>
              <Input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="secret123" />
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-xl border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-center animate-fade-in">
          <h3 className="font-bold text-[hsl(var(--success))] text-lg mb-2">Account Created!</h3>
          <p className="text-sm text-foreground mb-4">Share these credentials securely. They will not be shown again.</p>
          <div className="inline-block text-left bg-background p-4 rounded-lg border border-border">
            <p className="text-sm"><span className="text-muted-foreground w-20 inline-block">Email:</span> <strong>{created.email}</strong></p>
            <p className="text-sm mt-1"><span className="text-muted-foreground w-20 inline-block">Password:</span> <strong>{created.password}</strong></p>
          </div>
        </div>
      )}

      <div className="pt-6 flex justify-between items-center">
        {!created ? (
          <>
            <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">Skip for now</Button>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.email || !form.password}>Add User</Button>
          </>
        ) : (
          <div className="w-full flex justify-end">
            <Button onClick={onNext} className="gap-2">Continue <ArrowRight className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Step 6: Notifications ---
const PREFS_KEY = 'cafeflow:notificationPrefs';

const Step6Notifications: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    // Default: all true except quiet hours
    return Object.fromEntries(NOTIFICATION_TYPES.map(t => [t.key, t.key !== 'QUIET_HOURS']));
  });

  const handleToggle = (key: string, val: boolean) => {
    const next = { ...prefs, [key]: val };
    setPrefs(next);
  };

  const handleSave = () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    onNext();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 text-primary mb-2">
        <div className="p-3 rounded-full bg-primary/10"><Bell className="w-6 h-6" /></div>
        <h1 className="text-2xl font-display font-bold text-foreground">Stay Informed</h1>
      </div>
      <p className="text-muted-foreground">Choose what you want to be notified about. You can change this later in Settings.</p>

      <div className="space-y-2 pt-2">
        {NOTIFICATION_TYPES.map(t => (
          <div key={t.key} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <span className="text-sm font-medium text-foreground">{t.label}</span>
            <Switch checked={prefs[t.key]} onCheckedChange={(c) => handleToggle(t.key, c)} />
          </div>
        ))}
      </div>

      <div className="pt-6 flex justify-end">
        <Button onClick={handleSave} className="gap-2">Finish Setup <CheckCircle2 className="w-4 h-4" /></Button>
      </div>
    </div>
  );
};

// --- Step 7: Completion ---
const Step7Complete: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  return (
    <div className="py-12 text-center animate-fade-in flex flex-col items-center">
      <motion.div 
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
        className="w-20 h-20 bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] rounded-full flex items-center justify-center mb-6"
      >
        <motion.div
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <CheckCircle2 className="w-10 h-10" />
        </motion.div>
      </motion.div>
      <h1 className="text-4xl font-display font-bold text-foreground mb-4">You're all set!</h1>
      <p className="text-lg text-muted-foreground mb-10 max-w-md">
        Welcome to CafeFlow ☕. Your system is ready.
      </p>
      <Button size="lg" onClick={onFinish} className="px-8 text-md rounded-full shadow-xl shadow-primary/20 hover:shadow-primary/40">
        Go to your dashboard
      </Button>
    </div>
  );
};
