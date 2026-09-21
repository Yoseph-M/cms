import React, { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSocketStore } from '../../store/socketStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import { Badge } from '../../components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, Plus, Pencil, Trash2, Zap, X, AlertCircle, Bluetooth, Usb, ScanLine, Loader2, CheckCircle2, Wifi, type LucideIcon } from 'lucide-react';
import { Tooltip } from '../../components/ui/Tooltip';
import { Sheet } from '../../components/ui/Sheet';
import { AlertDialog } from '../../components/ui/AlertDialog';
import { usePrintersQuery } from '../../hooks/useCachedQueries';
import { EmptyState } from '../../components/common/EmptyState';
import { extractErrorMessage } from '../../utils/errorHandler';

type PrinterTransport = 'BLUETOOTH' | 'USB' | 'NETWORK';

interface PrinterStation {
  id?: string;
  station: string;
  transport: PrinterTransport;
  macAddress: string | null;
  vendorId: string | null;
  productId: string | null;
  ip: string | null;
  port: number | null;
}

interface PrinterStatus {
  [key: string]: 'online' | 'offline' | 'unknown';
}

const DEFAULT_NETWORK_PORT = 9100;

const EMPTY_FORM = {
  transport: 'BLUETOOTH' as PrinterTransport,
  macAddress: '',
  vendorId: '',
  productId: '',
  ip: '',
  port: String(DEFAULT_NETWORK_PORT),
};
const EMPTY_PRINTERS: PrinterStation[] = [];

/**
 * Transports an operator can pick, in the order they are offered. Network is
 * not offered for new terminals — a browser cannot scan a LAN, and the manual
 * address form only invited typos — but a legacy station that already points at
 * a network printer keeps it (see the dropdown below).
 */
const TRANSPORT_META: Record<PrinterTransport, { label: string; icon: LucideIcon }> = {
  BLUETOOTH: { label: 'Bluetooth', icon: Bluetooth },
  USB: { label: 'USB', icon: Usb },
  NETWORK: { label: 'Network (Wi-Fi / LAN) — legacy', icon: Wifi },
};

const TRANSPORT_ORDER: PrinterTransport[] = ['BLUETOOTH', 'USB', 'NETWORK'];

/**
 * Chrome reports nearly every Web Bluetooth failure as a `NotFoundError`, so the
 * error name alone carries no information: "globally disabled", "blocked by
 * policy", "no adapter" and a genuine cancel all look identical. Chrome only
 * prints the reason to the dev console, so classify on the message and tell the
 * operator what to do. Returns null for a deliberate cancel (nothing to report).
 */
export function describeScanFailure(err: any): { title: string; message: string } | null {
  const message = String(err?.message ?? '');

  // The chooser was dismissed, or the operator picked nothing.
  if (/no device selected|cancel/i.test(message)) return null;

  if (/user gesture/i.test(message)) {
    return { title: 'Scan needs a click', message: 'Press Scan again from this panel.' };
  }
  if (/globally disabled/i.test(message)) {
    return {
      title: 'Bluetooth is blocked in this browser',
      // Web Bluetooth has no permission prompt of its own: consent is granted by
      // picking a device, and a browser that refuses up front never opens that
      // chooser — so there is nothing here the operator could "allow".
      message:
        'This browser refuses Bluetooth before it can ask, so no permission prompt is coming. Open the app in a normal Chrome or Edge window (not an embedded or automated one) and scan again.',
    };
  }
  if (/enterprise policy|denied the browser permission/i.test(message)) {
    return {
      title: 'Bluetooth permission blocked',
      message:
        'Allow Bluetooth for this site, then scan again. In Chrome: Settings → Privacy and security → Site settings → Bluetooth devices.',
    };
  }
  if (/adapter not available|low energy not available|not supported on this platform/i.test(message)) {
    return {
      title: 'Bluetooth is off on this device',
      message: 'Turn Bluetooth on in this computer or tablet, then scan again.',
    };
  }

  return {
    title: 'Scan failed',
    message:
      message || 'Could not scan for printers. Check the printer is switched on and in range.',
  };
}

/**
 * `Bluetooth.getAvailability()` resolves false when the adapter is missing or
 * Web Bluetooth is blocked for this document — the two states where the chooser
 * opens and then fails with nothing but a console line. Older browsers omit the
 * method, so "unknown" must be treated as available and left to requestDevice.
 */
async function bluetoothUnavailableReason(bt: any): Promise<string | null> {
  if (typeof bt?.getAvailability !== 'function') return null;
  try {
    if ((await bt.getAvailability()) !== false) return null;
  } catch {
    return null;
  }
  return 'Either Bluetooth is switched off on this device, or this browser blocks Web Bluetooth. Check the device settings, then scan again.';
}

/**
 * Printer stations for this terminal.
 *
 * Owners and managers configure stations; cashiers share the same panel but in
 * read-only mode — they can see the devices and send a test slip, but adding,
 * editing, and removing a station (which can silence kitchen tickets) stays with
 * a manager.
 */
export const OwnerPrinters: React.FC<{ canManage?: boolean }> = ({ canManage = true }) => {
  const { addToast } = useToastStore();
  const { socket } = useSocketStore();
  const queryClient = useQueryClient();

  const printersQuery = usePrintersQuery();
  // Keep the fallback reference stable. A new [] on every error/loading render
  // retriggered the status effect below, causing an infinite render loop.
  const printers: PrinterStation[] = printersQuery.data ?? EMPTY_PRINTERS;
  const isLoading = printersQuery.isLoading;
  const error = printersQuery.error
    ? extractErrorMessage(printersQuery.error, 'Failed to load printers.')
    : null;

  const [statuses, setStatuses] = useState<PrinterStatus>({});
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterStation | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrinterStation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Auto-discovery state — the browser finds real Bluetooth/USB devices.
  const [scanning, setScanning] = useState(false);
  const [scannedName, setScannedName] = useState<string | null>(null);

  const invalidatePrinters = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['printers'] });
  }, [queryClient]);

  useEffect(() => {
    const initStatus: PrinterStatus = {};
    printers.forEach((p) => {
      initStatus[p.station] = 'unknown';
    });
    setStatuses((prev) => {
      const next = { ...initStatus, ...prev };
      const unchanged = Object.keys(next).length === Object.keys(prev).length
        && Object.entries(next).every(([key, value]) => prev[key] === value);
      return unchanged ? prev : next;
    });
  }, [printers]);

  // Subscribe to printer:failed and printer:recovered socket events
  useEffect(() => {
    if (!socket) return;

    const handleFailed = (data: { station: string }) => {
      const p = printers.find((pr) => pr.station === data.station);
      if (p) setStatuses((st) => ({ ...st, [p.station]: 'offline' }));
    };

    const handleRecovered = (data: { station: string }) => {
      const p = printers.find((pr) => pr.station === data.station);
      if (p) setStatuses((st) => ({ ...st, [p.station]: 'online' }));
    };

    socket.on('printer:failed', handleFailed);
    socket.on('printer:recovered', handleRecovered);
    return () => {
      socket.off('printer:failed', handleFailed);
      socket.off('printer:recovered', handleRecovered);
    };
  }, [socket, printers]);

  const setTransport = useCallback((transport: PrinterTransport) => {
    // Switching transport invalidates whatever device was scanned for the old
    // one, so every address field is cleared back to its default.
    setForm((f) => ({
      ...f,
      transport,
      macAddress: '',
      vendorId: '',
      productId: '',
      ip: '',
      port: String(DEFAULT_NETWORK_PORT),
    }));
    setScannedName(null);
  }, []);

  const openAdd = () => {
    setEditingPrinter(null);
    setForm(EMPTY_FORM);
    setScannedName(null);
    setSlideOverOpen(true);
  };

  const openEdit = (printer: PrinterStation) => {
    setEditingPrinter(printer);
    setForm({
      transport: printer.transport,
      macAddress: printer.macAddress || '',
      vendorId: printer.vendorId || '',
      productId: printer.productId || '',
      ip: printer.ip || '',
      port: String(printer.port || DEFAULT_NETWORK_PORT),
    });
    setScannedName(
      printer.transport === 'NETWORK'
        ? printer.ip
        : printer.macAddress || (printer.vendorId ? `USB ${printer.vendorId}:${printer.productId}` : null),
    );
    setSlideOverOpen(true);
  };

  /**
   * Scans for real devices through the browser (Web Bluetooth / WebUSB). Nothing
   * is faked: if the browser can't scan, the operator gets told why.
   */
  const handleScan = async () => {
    setScanning(true);
    setScannedName(null);

    try {
      if (form.transport === 'BLUETOOTH') {
        const bt = (navigator as any).bluetooth;
        if (!bt?.requestDevice) {
          addToast({
            type: 'error',
            title: 'Bluetooth scanning unavailable',
            // Embedded/in-app browsers and non-Chrome engines hide the API
            // entirely; there is no prompt to accept, so name the real fix.
            message:
              'This browser has no Web Bluetooth at all, so it cannot ask for permission. Open the app in Chrome or Edge over https:// or http://localhost.',
          });
          return;
        }
        if (!window.isSecureContext) {
          addToast({
            type: 'error',
            title: 'Bluetooth scanning unavailable',
            message: 'Web Bluetooth only works on a secure connection. Open the app over https:// or http://localhost.',
          });
          return;
        }
        // Fail here with a reason instead of opening a chooser that cannot work.
        const unavailable = await bluetoothUnavailableReason(bt);
        if (unavailable) {
          addToast({ type: 'error', title: 'Bluetooth not available', message: unavailable });
          return;
        }
        const device = await bt.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb',
            '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          ],
        });
        if (!device) return;
        // Blink returns an opaque, per-origin device id — never the MAC — and it
        // is case sensitive. Store it exactly as given: printing looks the
        // device up by this value later (useHardwarePrinter).
        const deviceId = String(device.id || '');
        if (!deviceId) {
          addToast({
            type: 'error',
            title: 'Bluetooth printer not identified',
            message: 'The browser did not return an id for that printer. Scan again and pick it once more.',
          });
          return;
        }
        setForm((f) => ({ ...f, macAddress: deviceId }));
        setScannedName(device.name || 'Bluetooth printer');
        addToast({
          type: 'success',
          title: 'Bluetooth printer found',
          message: device.name || deviceId,
        });
      } else if (form.transport === 'USB') {
        const usb = (navigator as any).usb;
        if (!usb?.requestDevice) {
          addToast({
            type: 'error',
            title: 'USB scanning unavailable',
            message: 'This browser cannot scan for USB printers. Use Chrome or Edge over a secure connection.',
          });
          return;
        }
        const device = await usb.requestDevice({ filters: [] });
        if (!device) return;
        const vendorId = Number(device.vendorId).toString(16).padStart(4, '0');
        const productId = Number(device.productId).toString(16).padStart(4, '0');
        setForm((f) => ({ ...f, vendorId, productId }));
        setScannedName(device.productName || `USB ${vendorId}:${productId}`);
        addToast({
          type: 'success',
          title: 'USB printer found',
          message: device.productName || `${vendorId}:${productId}`,
        });
      }
    } catch (err: any) {
      const failure = describeScanFailure(err);
      // A dismissed chooser is not an error worth interrupting the operator for.
      if (!failure) return;
      addToast({ type: 'error', ...failure });
    } finally {
      setScanning(false);
    }
  };

  const transportReady =
    form.transport === 'BLUETOOTH'
      ? Boolean(form.macAddress.trim())
      : form.transport === 'USB'
        ? Boolean(form.vendorId.trim() && form.productId.trim())
        : Boolean(form.ip.trim());

  const handleSave = async () => {
    if (!transportReady) {
      addToast({
        type: 'error',
        title: form.transport === 'NETWORK' ? 'Enter the printer address' : 'Scan for a printer first',
        message:
          form.transport === 'NETWORK'
            ? 'Type the IP address of the network printer (for example 192.168.1.50).'
            : `Use the scan button to detect a ${form.transport === 'BLUETOOTH' ? 'Bluetooth' : 'USB'} printer automatically.`,
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        transport: form.transport,
        macAddress: form.transport === 'BLUETOOTH' ? form.macAddress.trim() : null,
        vendorId: form.transport === 'USB' ? form.vendorId.trim() : null,
        productId: form.transport === 'USB' ? form.productId.trim() : null,
        ip: form.transport === 'NETWORK' ? form.ip.trim() : null,
        port:
          form.transport === 'NETWORK'
            ? parseInt(form.port, 10) || DEFAULT_NETWORK_PORT
            : null,
      };
      if (editingPrinter) {
        const stationId = editingPrinter.id || editingPrinter.station;
        await axiosClient.patch(`/settings/printers/${stationId}`, payload);
        addToast({ type: 'success', title: 'Printer updated' });
      } else {
        const all = printers.map((p) => ({
          transport: p.transport,
          macAddress: p.macAddress,
          vendorId: p.vendorId,
          productId: p.productId,
          ip: p.ip ?? null,
          port: p.port ?? null,
        }));
        await axiosClient.post('/settings/printers', { stations: [...all, payload] });
        addToast({ type: 'success', title: 'Printer added' });
      }
      invalidatePrinters();
      setSlideOverOpen(false);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save failed', message: extractErrorMessage(err) });
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
      addToast({ type: 'error', title: 'Delete failed', message: extractErrorMessage(err) });
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
        message: extractErrorMessage(err) || 'Could not reach the printer. Check that it is switched on.',
      });
      setStatuses(prev => ({ ...prev, [printer.station]: 'offline' }));
    } finally {
      setTestingId(null);
    }
  };

  const deleteTargetId = deleteTarget ? deleteTarget.id || deleteTarget.station : null;

  const getStatusIcon = (station: string) => {
    const st = statuses[station];
    if (st === 'online') return <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--success))] shadow-[0_0_6px_hsl(var(--success)/0.5)] animate-pulse" />;
    if (st === 'offline') return <div className="w-2.5 h-2.5 rounded-full bg-destructive shadow-[0_0_6px_hsl(var(--destructive)/0.5)]" />;
    return <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />;
  };

  const getStatusLabel = (station: string) => {
    const st = statuses[station];
    if (st === 'online') return <Badge variant="success" className="text-[10px]">Online</Badge>;
    if (st === 'offline') return <Badge variant="error" className="text-[10px]">Offline</Badge>;
    return <Badge variant="neutral" className="text-[10px]">Unknown</Badge>;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      {/* The header "Add Printer" button only shows once at least one printer
          exists — with an empty list the EmptyState's own action is the single
          CTA, so the operator never sees two identical buttons. */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">LAN Printers</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {canManage
              ? 'The first printer on this list prints the kitchen tickets. Add more only if you want a spare.'
              : 'The first printer prints the kitchen tickets. Ask a manager to add or change a printer.'}
          </p>
        </div>
        {canManage && printers.length > 0 && (
          <Button id="add-printer-btn" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />Add Printer
          </Button>
        )}
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
        <EmptyState
          title={canManage ? "Let's set up your first printer" : 'No printer set up yet'}
          message={
            canManage
              ? 'Connect a printer here and kitchen tickets will print automatically. The first printer you add becomes your ticket printer.'
              : 'No printer station is configured yet. Ask a manager to add one so tickets start printing.'
          }
          icon={<Printer className="w-7 h-7" />}
          action={
            canManage
              ? {
                  label: 'Add Printer',
                  onClick: openAdd,
                  icon: <Plus className="w-4 h-4 mr-1.5" />,
                }
              : undefined
          }
        />
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          initial="hidden" animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        >
          {printers.map((printer, index) => {
            const stationId = printer.id || printer.station;
            const isTesting = testingId === stationId;
            const isTicketPrinter = index === 0;
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
                          <p className="font-bold">
                            {isTicketPrinter ? 'Ticket printer' : `Printer ${index + 1}`}
                          </p>
                          <p className="text-xs font-mono text-muted-foreground mt-0.5">
                            {printer.transport === 'BLUETOOTH'
                              ? `Bluetooth ID: ${printer.macAddress}`
                              : printer.transport === 'USB'
                                ? `USB: ${printer.vendorId}:${printer.productId}`
                                : `Network: ${printer.ip}${printer.port ? `:${printer.port}` : ''}`}
                          </p>
                        </div>
                      </div>
                      {getStatusLabel(printer.station)}
                    </div>

                    {isTicketPrinter && (
                      <p className="mb-4 text-xs text-muted-foreground">
                        Kitchen tickets are sent here.
                      </p>
                    )}

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
                      {canManage && (
                        <>
                          <Tooltip label="Edit printer">
                            <button
                              onClick={() => openEdit(printer)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                          <Tooltip label="Delete printer">
                            <button
                              onClick={() => setDeleteTarget(printer)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Add/Edit slide-over — the shared Sheet portals to <body>, so it reaches
          the very top of the viewport instead of stopping at the page padding. */}
      <Sheet
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        title={editingPrinter ? 'Edit Printer' : 'Add Printer'}
        className="max-w-sm"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSlideOverOpen(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving ? 'Saving...' : (editingPrinter ? 'Update' : 'Add Printer')}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
                <div>
                  <span className="text-sm font-medium block mb-1.5">Transport Type</span>
                  {/* The house filter dropdown — the same control the menu
                      library uses for its category/view filters — instead of a
                      native select whose OS-drawn popup ignored the app theme. */}
                  <DropdownSelect
                    ariaLabel="Transport Type"
                    className="w-full justify-between"
                    contentClassName="w-72 max-w-[calc(100vw-3rem)]"
                    value={form.transport}
                    onChange={(next) => setTransport(next as PrinterTransport)}
                    options={TRANSPORT_ORDER
                      // Legacy stations only: network printing is no longer
                      // offered for new terminals, but an existing Wi-Fi/LAN
                      // station must keep its transport so an unrelated edit
                      // cannot silently rewrite it.
                      .filter((transport) => transport !== 'NETWORK' || form.transport === 'NETWORK')
                      .map((transport) => ({
                        value: transport,
                        label: TRANSPORT_META[transport].label,
                        icon: TRANSPORT_META[transport].icon,
                      }))}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Bluetooth and USB printers are set up from this terminal — scan once and the
                    station remembers the device.
                  </p>
                </div>

                {/* Network or Bluetooth/USB specific options */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {form.transport === 'NETWORK' && <Wifi className="h-4 w-4 text-primary" />}
                    {form.transport === 'BLUETOOTH' && <Bluetooth className="h-4 w-4 text-primary" />}
                    {form.transport === 'USB' && <Usb className="h-4 w-4 text-primary" />}
                    {form.transport === 'NETWORK' ? 'Network printer' : form.transport === 'BLUETOOTH' ? 'Bluetooth printer' : 'USB printer'}
                  </div>

                  {transportReady ? (
                    <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 p-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {scannedName ?? 'Network printer'}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {form.transport === 'BLUETOOTH'
                            ? form.macAddress
                            : form.transport === 'USB'
                            ? `USB ${form.vendorId}:${form.productId}`
                            : `IP ${form.ip}:${form.port}`}
                        </p>
                      </div>
                    </div>
                  ) : form.transport === 'NETWORK' ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      This station still points at a network printer
                      {form.ip ? ` (${form.ip}${form.port ? `:${form.port}` : ''})` : ''}. Switch it to
                      Bluetooth or USB above to configure it from this terminal instead.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Scan to detect nearby {form.transport === 'BLUETOOTH' ? 'Bluetooth' : 'USB'} printers and pick one automatically.
                      {form.transport === 'BLUETOOTH' &&
                        ' Browsers only see low-energy (BLE) printers — one paired in Windows or Android settings stays hidden.'}
                    </p>
                  )}

                  {form.transport !== 'NETWORK' && (
                    <Button
                      type="button"
                      onClick={handleScan}
                      disabled={scanning}
                      className="mt-3 w-full"
                    >
                      {scanning ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Scanning…
                        </>
                      ) : (
                        <>
                          <ScanLine className="mr-2 h-4 w-4" />
                          Scan for {form.transport === 'BLUETOOTH' ? 'Bluetooth' : 'USB'} printers
                        </>
                      )}
                    </Button>
                  )}
                </div>
        </div>
      </Sheet>

      {/* Delete confirm — shared AlertDialog, which portals to <body> too. */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        title="Remove this printer?"
        description={
          deleteTarget ? (
            <>
              {deleteTargetId === (printers[0]?.id || printers[0]?.station)
                ? 'This is your ticket printer — kitchen tickets will stop printing until you add another one. '
                : ''}
              The printer at{' '}
              {deleteTarget.transport === 'BLUETOOTH'
                ? deleteTarget.macAddress
                : deleteTarget.transport === 'USB'
                  ? `${deleteTarget.vendorId}:${deleteTarget.productId}`
                  : `${deleteTarget.ip}${deleteTarget.port ? `:${deleteTarget.port}` : ''}`}{' '}
              will be removed.
            </>
          ) : null
        }
        confirmText="Remove"
        tone="destructive"
        loading={isDeleting}
      />
    </div>
  );
};
