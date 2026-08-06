import React, { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSocketStore } from '../../store/socketStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, Plus, Pencil, Trash2, Zap, Wifi, WifiOff, X, AlertCircle } from 'lucide-react';
import { usePrintersQuery } from '../../hooks/useCachedQueries';

interface PrinterStation {
  id?: string;
  station: string;
  ip: string;
  port: number;
}

interface PrinterStatus {
  [key: string]: 'online' | 'offline' | 'unknown';
}

const STATION_OPTIONS = ['kitchen', 'bar', 'cashier'];

const EMPTY_FORM = { station: 'kitchen', ip: '', port: '9100' };

export const OwnerPrinters: React.FC = () => {
  const { addToast } = useToastStore();
  const { socket } = useSocketStore();
  const queryClient = useQueryClient();

  const printersQuery = usePrintersQuery();
  const printers: PrinterStation[] = printersQuery.data ?? [];
  const isLoading = printersQuery.isLoading;
  const error = printersQuery.error
    ? ((printersQuery.error as { response?: { data?: { error?: string } } }).response?.data?.error ||
        'Failed to load printers.')
    : null;

  const [statuses, setStatuses] = useState<PrinterStatus>({});
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterStation | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrinterStation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const invalidatePrinters = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['printers'] });
  }, [queryClient]);

  useEffect(() => {
    const initStatus: PrinterStatus = {};
    printers.forEach((p) => {
      initStatus[p.station] = 'unknown';
    });
    setStatuses((prev) => ({ ...initStatus, ...prev }));
  }, [printers]);

  // Subscribe to printer:failed and printer:recovered socket events
  useEffect(() => {
    if (!socket) return;

    const handleFailed = (data: { ip: string; port: number }) => {
      const p = printers.find((pr) => pr.ip === data.ip && pr.port === data.port);
      if (p) setStatuses((st) => ({ ...st, [p.station]: 'offline' }));
    };

    const handleRecovered = (data: { ip: string; port: number }) => {
      const p = printers.find((pr) => pr.ip === data.ip && pr.port === data.port);
      if (p) setStatuses((st) => ({ ...st, [p.station]: 'online' }));
    };

    socket.on('printer:failed', handleFailed);
    socket.on('printer:recovered', handleRecovered);
    return () => {
      socket.off('printer:failed', handleFailed);
      socket.off('printer:recovered', handleRecovered);
    };
  }, [socket, printers]);

  const openAdd = () => {
    setEditingPrinter(null);
    setForm(EMPTY_FORM);
    setSlideOverOpen(true);
  };

  const openEdit = (printer: PrinterStation) => {
    setEditingPrinter(printer);
    setForm({ station: printer.station, ip: printer.ip, port: String(printer.port) });
    setSlideOverOpen(true);
  };

  const handleSave = async () => {
    if (!form.ip.trim() || !form.station) {
      addToast({ type: 'error', title: 'Station and IP are required.' });
      return;
    }
    // Basic IP format check
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(form.ip.trim())) {
      addToast({ type: 'error', title: 'Invalid IP address format.' });
      return;
    }
    setIsSaving(true);
    try {
      const payload = { station: form.station, ip: form.ip.trim(), port: parseInt(form.port) || 9100 };
      if (editingPrinter) {
        const stationId = editingPrinter.id || editingPrinter.station;
        await axiosClient.patch(`/settings/printers/${stationId}`, payload);
        addToast({ type: 'success', title: 'Printer updated' });
      } else {
        const all = printers.map((p) => ({ station: p.station, ip: p.ip, port: p.port }));
        await axiosClient.post('/settings/printers', { stations: [...all, payload] });
        addToast({ type: 'success', title: 'Printer added' });
      }
      invalidatePrinters();
      setSlideOverOpen(false);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save failed', message: err.response?.data?.error });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const stationId = deleteTarget.id || deleteTarget.station;
      await axiosClient.delete(`/settings/printers/${stationId}`);
      invalidatePrinters();
      addToast({ type: 'success', title: 'Printer removed' });
      setDeleteTarget(null);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Delete failed', message: err.response?.data?.error });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTestPrint = async (printer: PrinterStation) => {
    const stationId = printer.id || printer.station;
    setTestingId(stationId);
    try {
      await axiosClient.post(`/settings/printers/${stationId}/test-print`);
      addToast({ type: 'success', title: `Test print sent to ${printer.station}` });
      setStatuses(prev => ({ ...prev, [printer.station]: 'online' }));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: `Test print failed: ${printer.station}`,
        message: err.response?.data?.error || 'TCP connection failed',
      });
      setStatuses(prev => ({ ...prev, [printer.station]: 'offline' }));
    } finally {
      setTestingId(null);
    }
  };

  const getStatusIcon = (station: string) => {
    const st = statuses[station];
    if (st === 'online') return <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)] animate-pulse" />;
    if (st === 'offline') return <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />;
    return <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />;
  };

  const getStatusLabel = (station: string) => {
    const st = statuses[station];
    if (st === 'online') return <Badge variant="success" className="text-[10px]">Online</Badge>;
    if (st === 'offline') return <Badge variant="error" className="text-[10px]">Offline</Badge>;
    return <Badge variant="neutral" className="text-[10px]">Unknown</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">LAN Printers</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Configure and test your thermal printer stations.</p>
        </div>
        <Button id="add-printer-btn" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-2" />Add Printer
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-secondary/40 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="py-12 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void printersQuery.refetch()}>Retry</Button>
        </div>
      ) : printers.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-border rounded-xl">
          <Printer className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="font-semibold text-foreground">No printers configured yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Add your kitchen printer to start printing tickets automatically.</p>
          <Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" />Add Printer</Button>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          initial="hidden" animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        >
          {printers.map(printer => {
            const stationId = printer.id || printer.station;
            const isTesting = testingId === stationId;
            return (
              <motion.div
                key={stationId}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 28 } } }}
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(printer.station)}
                        <div>
                          <p className="font-bold capitalize">{printer.station} Printer</p>
                          <p className="text-xs font-mono text-muted-foreground mt-0.5">
                            {printer.ip}:{printer.port}
                          </p>
                        </div>
                      </div>
                      {getStatusLabel(printer.station)}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        id={`test-print-${stationId}`}
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestPrint(printer)}
                        disabled={isTesting}
                        className="flex-1"
                      >
                        <Zap className={`w-3.5 h-3.5 mr-1.5 ${isTesting ? 'animate-bounce' : ''}`} />
                        {isTesting ? 'Sending...' : 'Test Print'}
                      </Button>
                      <button
                        onClick={() => openEdit(printer)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(printer)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Add/Edit Slide-over */}
      <AnimatePresence>
        {slideOverOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setSlideOverOpen(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-card border-l border-border z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-border">
                <h2 className="text-lg font-bold">{editingPrinter ? 'Edit Printer' : 'Add Printer'}</h2>
                <button onClick={() => setSlideOverOpen(false)} className="p-2 rounded-lg hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 p-6 space-y-5">
                <div>
                  <label htmlFor="pr-station" className="text-sm font-medium block mb-1.5">Station <span className="text-destructive">*</span></label>
                  <Select id="pr-station" value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))}>
                    {STATION_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="pr-ip" className="text-sm font-medium block mb-1.5">IP Address <span className="text-destructive">*</span></label>
                  <Input id="pr-ip" value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
                    placeholder="192.168.1.100" className="font-mono" />
                </div>
                <div>
                  <label htmlFor="pr-port" className="text-sm font-medium block mb-1.5">Port</label>
                  <Input id="pr-port" type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                    placeholder="9100" className="font-mono" />
                  <p className="text-xs text-muted-foreground mt-1">Default ESC/POS port is 9100.</p>
                </div>
              </div>
              <div className="p-6 border-t border-border flex gap-3">
                <Button variant="outline" onClick={() => setSlideOverOpen(false)} className="flex-1">Cancel</Button>
                <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                  {isSaving ? 'Saving...' : (editingPrinter ? 'Update' : 'Add Printer')}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full pointer-events-auto">
                <h3 className="font-bold mb-2 capitalize">Remove {deleteTarget.station} printer?</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  The printer at {deleteTarget.ip}:{deleteTarget.port} will be removed from all stations.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setDeleteTarget(null)} className="flex-1">Cancel</Button>
                  <Button onClick={handleDelete} disabled={isDeleting}
                    className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {isDeleting ? 'Removing...' : 'Remove'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
