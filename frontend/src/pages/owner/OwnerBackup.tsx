import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Database,
  Download,
  FileDown,
  FileJson,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { extractErrorMessage } from '../../utils/errorHandler';
import { datedFilename, downloadBlob, timestampedFilename } from '../../utils/download';
import { readFileAsText } from '../../utils/readFile';
import { useToastStore } from '../../store/toastStore';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AlertDialog } from '../../components/ui/AlertDialog';
import { cn } from '../../lib/utils';

/**
 * Backup & restore.
 *
 * Two jobs, two shapes: a JSON snapshot for "put this box back the way it was",
 * and per-dataset CSV files for accountants. Both are produced by the API so
 * the operator never has to shell into the server for a routine export.
 */

interface DatasetSummary {
  key: string;
  label: string;
  description: string;
  rows: number;
}

interface SnapshotPayload {
  format?: string;
  version?: number;
  generatedAt?: string;
  counts?: Record<string, number>;
  data?: Record<string, unknown>;
}

interface ResetPreview {
  collections: Array<{ key: string; label: string; rows: number }>;
  rows: number;
  keeps: string[];
}

/**
 * Mirrors the app-wide `express.json({ limit: '10mb' })`. A larger file is
 * rejected by the body parser before it reaches the route, so the UI refuses it
 * up front instead of failing halfway through a restore.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const BUSINESS_KEYS = ['orders', 'payments', 'expenses', 'payroll'];
const SYSTEM_KEYS = ['attendance', 'menu', 'staff', 'audit'];

/** i18n key for a backend dataset key ('orders' → backup.ds.orders). */
const datasetKey = (key: string): string => {
  const KNOWN: Record<string, string> = {
    orders: 'orders',
    payments: 'payments',
    expenses: 'expenses',
    payroll: 'payroll',
    attendance: 'attendance',
    menu: 'menuItems',
    staff: 'staff',
    audit: 'auditLogs',
  };
  return `ds.${KNOWN[key] ?? 'other'}`;
};

export function describeSnapshot(snapshot: SnapshotPayload): { records: number; collections: number; generatedAt: string } {
  const counts = Object.values(snapshot.counts ?? {});
  const records = counts.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const generatedAt = snapshot.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleString()
    : 'an unknown date';
  return { records, collections: Object.keys(snapshot.data ?? {}).length, generatedAt };
}

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const DatasetCard: React.FC<{
  dataset: DatasetSummary;
  exporting: boolean;
  onExport: (dataset: DatasetSummary) => void;
}> = ({ dataset, exporting, onExport }) => {
  const { t } = useTranslation('owner');
  const known = datasetKey(dataset.key).startsWith('ds.') && datasetKey(dataset.key) !== 'ds.other';
  return (
  <Card className="flex flex-col hover:-translate-y-0.5">
    <CardContent className="flex flex-1 flex-col p-4">
      <h5 className="flex items-center gap-2 text-sm font-semibold">
        <FileDown className="h-4 w-4 text-primary" />
        {known ? t(`backup.${datasetKey(dataset.key)}`) : dataset.label}
      </h5>
      <p className="mt-1.5 flex-1 text-xs text-muted-foreground">{dataset.description}</p>
      <p className="mt-2 text-[11px] font-medium text-muted-foreground">
        {t(
          dataset.rows === 1 ? 'backup.recordsWithCount_one' : 'backup.recordsWithCount_other',
          { count: dataset.rows },
        )}
      </p>
      <Button
        variant="outline"
        className={cn('mt-3 w-full', exporting && 'opacity-70')}
        onClick={() => void onExport(dataset)}
        disabled={exporting}
      >
        {exporting ? t('backup.exporting') : t('backup.exportCsv')}
      </Button>
    </CardContent>
  </Card>
  );
};

export const OwnerBackup: React.FC = () => {
  const { addToast } = useToastStore();
  const { t } = useTranslation('owner');
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ snapshot: SnapshotPayload; name: string; size: number } | null>(
    null,
  );

  // Reset (format) — destructive, so the preview and the typed confirmation
  // both come before anything is sent.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const {
    data: datasets = [],
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<DatasetSummary[]>({
    queryKey: ['backupDatasets'],
    queryFn: async () => {
      const res = await axiosClient.get('/backup/datasets');
      return (res.data.datasets ?? []) as DatasetSummary[];
    },
    staleTime: 5 * 60_000,
  });

  const error = queryError ? extractErrorMessage(queryError, t('backup.loadError')) : null;

  const { data: resetPreview, isLoading: isResetPreviewLoading } = useQuery<ResetPreview>({
    queryKey: ['backupResetPreview'],
    queryFn: async () => {
      const res = await axiosClient.get('/backup/reset/preview');
      return res.data as ResetPreview;
    },
    // Only needed once the operator opens the destructive confirmation.
    enabled: resetOpen,
    staleTime: 30_000,
  });

  const totalRows = useMemo(() => datasets.reduce((sum, item) => sum + item.rows, 0), [datasets]);

  const businessDatasets = useMemo(() => datasets.filter((item) => BUSINESS_KEYS.includes(item.key)), [datasets]);
  const systemDatasets = useMemo(() => datasets.filter((item) => SYSTEM_KEYS.includes(item.key)), [datasets]);

  const generateBackup = useCallback(async () => {
    setIsGenerating(true);
    try {
      const res = await axiosClient.get('/backup/snapshot', { responseType: 'blob' });
      const blob = res.data as Blob;
      downloadBlob(blob, timestampedFilename('pos-backup', 'json'));

      // Not a failure — but the operator must know this file cannot come back
      // through the browser, before they rely on it as their only copy.
      if (blob.size > MAX_UPLOAD_BYTES) {
        addToast({
          type: 'warning',
          title: t('backup.toast_download_title'),
          message: t('backup.toast_download_tooBig', {
            size: formatBytes(blob.size),
            limit: formatBytes(MAX_UPLOAD_BYTES),
          }),
        });
      } else {
        addToast({
          type: 'success',
          title: t('backup.toast_download_title'),
          message: t('backup.toast_download_ok', { size: formatBytes(blob.size) }),
        });
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: t('backup.toast_failed_title'),
        message: extractErrorMessage(err, t('backup.toast_failed_msg')),
      });
    } finally {
      setIsGenerating(false);
    }
  }, [addToast, t]);

  const exportCsv = useCallback(
    async (dataset: DatasetSummary) => {
      setExportingKey(dataset.key);
      try {
        const res = await axiosClient.get(`/backup/datasets/${dataset.key}/csv`, { responseType: 'blob' });
        downloadBlob(res.data as Blob, datedFilename(`pos-${dataset.key}`, 'csv'));
        addToast({
          type: 'success',
          title: t('backup.toast_export_title', { label: dataset.label }),
          message: t('backup.toast_export_ok'),
        });
      } catch (err) {
        addToast({
          type: 'error',
          title: t('backup.toast_export_failed_title'),
          message: extractErrorMessage(err, t('backup.toast_export_failed_msg', { label: dataset.label })),
        });
      } finally {
        setExportingKey(null);
      }
    },
    [addToast, t],
  );

  /** Validate locally so the operator sees the problem before any upload. */
  const handleFilePicked = useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        addToast({
          type: 'error',
          title: t('backup.toast_tooLarge_title'),
          message: t('backup.toast_tooLarge_msg', {
            size: formatBytes(file.size),
            limit: formatBytes(MAX_UPLOAD_BYTES),
          }),
        });
        return;
      }

      let text: string;
      try {
        text = await readFileAsText(file);
      } catch {
        addToast({
          type: 'error',
          title: t('backup.toast_read_title'),
          message: t('backup.toast_read_msg'),
        });
        return;
      }

      let parsed: SnapshotPayload;
      try {
        parsed = JSON.parse(text);
      } catch {
        addToast({ type: 'error', title: t('backup.toast_json_title'), message: t('backup.toast_json_msg') });
        return;
      }

      if (!parsed?.data || typeof parsed.data !== 'object') {
        addToast({
          type: 'error',
          title: t('backup.toast_shape_title'),
          message: t('backup.toast_shape_msg'),
        });
        return;
      }

      setPendingRestore({ snapshot: parsed, name: file.name, size: file.size });
    },
    [addToast, t],
  );

  const confirmRestore = useCallback(async () => {
    if (!pendingRestore) return;
    setIsRestoring(true);
    try {
      const res = await axiosClient.post('/backup/restore', pendingRestore.snapshot);
      const result = res.data as { inserted: number; skipped: number; failed: number };
      addToast({
        type: result.failed ? 'warning' : 'success',
        title: t('backup.toast_restore_ok_title'),
        message: `${t('backup.toast_restore_ok', {
          inserted: result.inserted,
          skipped: result.skipped,
        })}${result.failed ? ` · ${t('backup.toast_restore_partial', { count: result.failed })}` : ''}`,
      });
      setPendingRestore(null);
      void refetch();
    } catch (err) {
      addToast({
        type: 'error',
        title: t('backup.toast_restore_failed_title'),
        message: extractErrorMessage(err, t('backup.toast_restore_failed_msg')),
      });
    } finally {
      setIsRestoring(false);
    }
  }, [pendingRestore, addToast, refetch, t]);

  const performReset = useCallback(async () => {
    if (resetConfirm.trim().toUpperCase() !== 'RESET') return;
    setIsResetting(true);
    try {
      const res = await axiosClient.post('/backup/reset', { confirm: 'RESET' });
      const result = res.data as { deleted: number };
      addToast({
        type: 'success',
        title: t('backup.toast_reset_ok_title'),
        message: t('backup.toast_reset_ok', { total: result.deleted.toLocaleString() }),
      });
      setResetOpen(false);
      setResetConfirm('');
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['backupResetPreview'] });
    } catch (err) {
      addToast({
        type: 'error',
        title: t('backup.toast_reset_failed_title'),
        message: extractErrorMessage(err, t('backup.toast_reset_failed_msg')),
      });
    } finally {
      setIsResetting(false);
    }
  }, [resetConfirm, addToast, refetch, queryClient, t]);

  const pendingSummary = pendingRestore ? describeSnapshot(pendingRestore.snapshot) : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">{t('backup.title')}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('backup.subtitle')}</p>
      </div>

      {/*
       * The three whole-system actions sit side by side as one row of equally
       * weighted choices.
       *
       * The track count is driven by the space actually available rather than a
       * viewport breakpoint: `lg:grid-cols-3` only fired above a 1024px *window*,
       * so on a smaller laptop (or inside this admin panel) the cards stayed
       * stacked. `auto-fit` with a 15rem minimum fits all three as soon as there
       * is room for them and degrades to two or one only when there genuinely
       * isn't — the row is never cramped.
       */}
      <div className="grid gap-4 sm:gap-5 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
        {/* Create System Backup */}
        <Card className="flex flex-col overflow-hidden border-primary/30 bg-primary/[0.03] hover:-translate-y-0">
          <div className="min-h-[7.5rem] border-b border-primary/20 bg-primary/[0.07] px-4 py-4">
            <h4 className="flex items-center gap-2 text-base font-bold text-primary">
              <Database className="h-5 w-5 shrink-0" />
              {t('backup.createTitle')}
            </h4>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              {t('backup.createDesc')}
            </p>
          </div>
          <CardContent className="flex flex-1 flex-col p-4">
            <p className="text-xs text-muted-foreground">
              {totalRows > 0
                ? t('backup.recordsStored', { count: totalRows })
                : t('backup.createFallback')}
            </p>
            <Button onClick={generateBackup} disabled={isGenerating} className="mt-auto w-full">
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileJson className="h-4 w-4" />
              )}
              {isGenerating ? t('backup.preparing') : t('backup.generateBtn')}
            </Button>
          </CardContent>
        </Card>

        {/* Restore System */}
        <Card className="flex flex-col overflow-hidden border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10 hover:-translate-y-0">
          <div className="min-h-[7.5rem] border-b border-amber-200 bg-amber-100/60 px-4 py-4 dark:border-amber-500/30 dark:bg-amber-500/15">
            <h4 className="flex items-center gap-2 text-base font-bold text-amber-700 dark:text-amber-300">
              <Upload className="h-5 w-5 shrink-0" />
              {t('backup.restoreTitle')}
            </h4>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              {t('backup.restoreDesc')}
            </p>
          </div>
          <CardContent className="flex flex-1 flex-col p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset so picking the same file twice still fires onChange.
                e.target.value = '';
                if (file) void handleFilePicked(file);
              }}
            />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('backup.restoreNote')}
            </p>
            <Button
              variant="outline"
              className="mt-auto w-full border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-500/50 dark:text-amber-200 dark:hover:bg-amber-500/20"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRestoring}
            >
              <Upload className="h-4 w-4" />
              {t('backup.uploadBtn')}
            </Button>
          </CardContent>
        </Card>

        {/* Reset System Data — destructive format of the operational books */}
        <Card className="flex flex-col overflow-hidden border-destructive/30 bg-destructive/[0.03] hover:-translate-y-0">
          <div className="min-h-[7.5rem] border-b border-destructive/20 bg-destructive/[0.06] px-4 py-4">
            <h4 className="flex items-center gap-2 text-base font-bold text-destructive">
              <Trash2 className="h-5 w-5 shrink-0" />
              {t('backup.resetTitle')}
            </h4>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              {t('backup.resetDesc')}
            </p>
          </div>
          <CardContent className="flex flex-1 flex-col p-4">
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('backup.resetNote')}
            </p>
            <Button
              variant="outline"
              className="mt-auto w-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setResetConfirm('');
                setResetOpen(true);
              }}
            >
              <RotateCcw className="h-4 w-4" />
              {t('backup.resetBtn')}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* CSV Data Exports */}
      <section className="space-y-3">
        <div>
          <h4 className="flex items-center gap-2 text-lg font-bold">
            <Download className="h-5 w-5" />
            {t('backup.csvTitle')}
          </h4>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('backup.csvDesc')}
          </p>
        </div>

        {/*
         * Fixed four-across rows rather than a viewport breakpoint: this panel
         * lives inside the admin shell, so `lg:` refused to fire on smaller
         * laptops and the four cards stacked. Business records and system
         * records each stay on one row, dropping to two-up only under 768px.
         */}

        {isLoading ? (
          <div className="grid grid-cols-4 max-[767px]:grid-cols-2 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-secondary/40" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                {t('backup.retry')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <h5 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('backup.businessRecords')}
              </h5>
              <div className="grid grid-cols-4 max-[767px]:grid-cols-2 gap-4">
                {businessDatasets.map((dataset) => (
                  <DatasetCard
                    key={dataset.key}
                    dataset={dataset}
                    exporting={exportingKey === dataset.key}
                    onExport={exportCsv}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2.5">
              <h5 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('backup.systemRecords')}
              </h5>
              <div className="grid grid-cols-4 max-[767px]:grid-cols-2 gap-4">
                {systemDatasets.map((dataset) => (
                  <DatasetCard
                    key={dataset.key}
                    dataset={dataset}
                    exporting={exportingKey === dataset.key}
                    onExport={exportCsv}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <AlertDialog
        open={pendingRestore !== null}
        onClose={() => {
          if (!isRestoring) setPendingRestore(null);
        }}
        onConfirm={confirmRestore}
        loading={isRestoring}
        title={t('backup.restoreConfirmTitle')}
        confirmText={t('backup.restoreConfirmBtn')}
        description={
          pendingSummary ? (
            <div className="space-y-2">
              <p className="break-all font-mono text-xs text-foreground">{pendingRestore?.name}</p>
              <p>
                {t('backup.restoreSummary', {
                  records: pendingSummary.records.toLocaleString(),
                  collections: pendingSummary.collections,
                  generatedAt: pendingSummary.generatedAt,
                })}
              </p>
              <p>{t('backup.restoreKeepExisting')}</p>
            </div>
          ) : null
        }
      />

      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !isResetting && setResetOpen(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Reset system data"
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground">{t('backup.resetConfirmTitle')}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {t('backup.resetConfirmDesc')}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/[0.04] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-destructive">{t('backup.willBeDeleted')}</p>
              {isResetPreviewLoading ? (
                <div className="mt-2 space-y-1.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-destructive/10" />
                  ))}
                </div>
              ) : (
                <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-foreground sm:grid-cols-2">
                  {(resetPreview?.collections ?? []).map((item) => (
                    <li key={item.key} className="flex items-center justify-between gap-2">
                      <span className="truncate">{item.label}</span>
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {item.rows.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                {resetPreview
                  ? t('backup.totalRecords', { count: resetPreview.rows })
                  : t('backup.calculating')}
              </p>
            </div>

            {resetPreview?.keeps?.length ? (
              <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('backup.kept')}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {resetPreview.keeps.map((item) => (
                    <li
                      key={item}
                      className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-inset ring-border"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-5">
              <label htmlFor="reset-confirm" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('backup.typeReset', { reset: 'RESET' })}
              </label>
              <Input
                id="reset-confirm"
                value={resetConfirm}
                autoComplete="off"
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="RESET"
                className="font-mono"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setResetOpen(false)} disabled={isResetting}>
                {t('backup.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void performReset()}
                disabled={isResetting || resetConfirm.trim().toUpperCase() !== 'RESET'}
              >
                {isResetting ? t('backup.resetting') : t('backup.resetBtn')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
