import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Database,
  Download,
  FileDown,
  FileJson,
  Loader2,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { extractErrorMessage } from '../../utils/errorHandler';
import { datedFilename, downloadBlob, timestampedFilename } from '../../utils/download';
import { readFileAsText } from '../../utils/readFile';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
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

/**
 * Mirrors the app-wide `express.json({ limit: '10mb' })`. A larger file is
 * rejected by the body parser before it reaches the route, so the UI refuses it
 * up front instead of failing halfway through a restore.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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

export const OwnerBackup: React.FC = () => {
  const { addToast } = useToastStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ snapshot: SnapshotPayload; name: string; size: number } | null>(
    null,
  );

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

  const error = queryError ? extractErrorMessage(queryError, 'Failed to load export options.') : null;

  const totalRows = useMemo(() => datasets.reduce((sum, item) => sum + item.rows, 0), [datasets]);

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
          title: 'Backup downloaded',
          message: `It is ${formatBytes(blob.size)}, larger than the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit for restore. Keep it as an archive and use the database restore procedure in Runbook.md if you need to load it back.`,
        });
      } else {
        addToast({
          type: 'success',
          title: 'Backup downloaded',
          message: `${formatBytes(blob.size)} of system data. Check your downloads folder.`,
        });
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Backup failed',
        message: extractErrorMessage(err, 'Could not generate the backup. Try again.'),
      });
    } finally {
      setIsGenerating(false);
    }
  }, [addToast]);

  const exportCsv = useCallback(
    async (dataset: DatasetSummary) => {
      setExportingKey(dataset.key);
      try {
        const res = await axiosClient.get(`/backup/datasets/${dataset.key}/csv`, { responseType: 'blob' });
        downloadBlob(res.data as Blob, datedFilename(`pos-${dataset.key}`, 'csv'));
        addToast({ type: 'success', title: `${dataset.label} exported`, message: 'Saved as a CSV file.' });
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Export failed',
          message: extractErrorMessage(err, `Could not export ${dataset.label}.`),
        });
      } finally {
        setExportingKey(null);
      }
    },
    [addToast],
  );

  /** Validate locally so the operator sees the problem before any upload. */
  const handleFilePicked = useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        addToast({
          type: 'error',
          title: 'File too large',
          message: `${formatBytes(file.size)} exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit. Restore this file with the database procedure in Runbook.md instead.`,
        });
        return;
      }

      let text: string;
      try {
        text = await readFileAsText(file);
      } catch {
        addToast({
          type: 'error',
          title: 'Could not read that file',
          message: 'The file could not be opened. Try copying it to this device again.',
        });
        return;
      }

      let parsed: SnapshotPayload;
      try {
        parsed = JSON.parse(text);
      } catch {
        addToast({ type: 'error', title: 'Not a backup file', message: 'That file is not valid JSON.' });
        return;
      }

      if (!parsed?.data || typeof parsed.data !== 'object') {
        addToast({
          type: 'error',
          title: 'Not a POS backup',
          message: 'The file has no "data" section. Pick a backup generated from this screen.',
        });
        return;
      }

      setPendingRestore({ snapshot: parsed, name: file.name, size: file.size });
    },
    [addToast],
  );

  const confirmRestore = useCallback(async () => {
    if (!pendingRestore) return;
    setIsRestoring(true);
    try {
      const res = await axiosClient.post('/backup/restore', pendingRestore.snapshot);
      const result = res.data as { inserted: number; skipped: number; failed: number };
      addToast({
        type: result.failed ? 'warning' : 'success',
        title: 'Restore complete',
        message: `${result.inserted} records added · ${result.skipped} already present${
          result.failed ? ` · ${result.failed} could not be added` : ''
        }.`,
      });
      setPendingRestore(null);
      void refetch();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Restore failed',
        message: extractErrorMessage(err, 'The backup could not be applied. Nothing was changed.'),
      });
    } finally {
      setIsRestoring(false);
    }
  }, [pendingRestore, addToast, refetch]);

  const pendingSummary = pendingRestore ? describeSnapshot(pendingRestore.snapshot) : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Backup &amp; Restore</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage data exports, system snapshots, and database restoration.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Create System Backup */}
        <Card className="overflow-hidden border-primary/30 bg-primary/[0.03] hover:-translate-y-0">
          <div className="border-b border-primary/20 bg-primary/[0.07] px-5 py-4">
            <h4 className="flex items-center gap-2 text-xl font-bold text-primary">
              <Database className="h-5 w-5" />
              Create System Backup
            </h4>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Generates a full JSON snapshot of system data excluding passwords, authentication tokens, and files.
            </p>
          </div>
          <CardContent className="p-5">
            <Button onClick={generateBackup} disabled={isGenerating} className="w-full">
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileJson className="h-4 w-4" />
              )}
              {isGenerating ? 'Preparing backup…' : 'Generate & Download JSON Backup'}
            </Button>
            {totalRows > 0 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {totalRows.toLocaleString()} records currently stored
              </p>
            )}
          </CardContent>
        </Card>

        {/* Restore System */}
        <Card className="overflow-hidden border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10 hover:-translate-y-0">
          <div className="border-b border-amber-200 bg-amber-100/60 px-5 py-4 dark:border-amber-500/30 dark:bg-amber-500/15">
            <h4 className="flex items-center gap-2 text-xl font-bold text-amber-700 dark:text-amber-300">
              <Upload className="h-5 w-5" />
              Restore System
            </h4>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Upload a previously generated JSON backup to restore system data safely.
            </p>
          </div>
          <CardContent className="p-5">
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
            <Button
              variant="outline"
              className="w-full border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-500/50 dark:text-amber-200 dark:hover:bg-amber-500/20"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRestoring}
            >
              <Upload className="h-4 w-4" />
              Upload Backup File
            </Button>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Records already in this database are left untouched — a restore only adds what is missing, and never
              deletes anything.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* CSV Data Exports */}
      <section className="space-y-3">
        <div>
          <h4 className="flex items-center gap-2 text-lg font-bold">
            <Download className="h-5 w-5" />
            CSV Data Exports
          </h4>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Download individual datasets as CSV files for reporting or external analysis.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {datasets.map((dataset) => (
              <Card key={dataset.key} className="flex flex-col hover:-translate-y-0.5">
                <CardContent className="flex flex-1 flex-col p-4">
                  <h5 className="flex items-center gap-2 text-sm font-semibold">
                    <FileDown className="h-4 w-4 text-primary" />
                    {dataset.label}
                  </h5>
                  <p className="mt-1.5 flex-1 text-xs text-muted-foreground">{dataset.description}</p>
                  <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                    {dataset.rows.toLocaleString()} {dataset.rows === 1 ? 'record' : 'records'}
                  </p>
                  <Button
                    variant="outline"
                    className={cn('mt-3 w-full', exportingKey === dataset.key && 'opacity-70')}
                    onClick={() => void exportCsv(dataset)}
                    disabled={exportingKey === dataset.key}
                  >
                    {exportingKey === dataset.key ? 'Exporting…' : 'Export CSV'}
                  </Button>
                </CardContent>
              </Card>
            ))}
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
        title="Restore this backup?"
        confirmText="Restore data"
        description={
          pendingSummary ? (
            <div className="space-y-2">
              <p className="break-all font-mono text-xs text-foreground">{pendingRestore?.name}</p>
              <p>
                {pendingSummary.records.toLocaleString()} records across {pendingSummary.collections} collections,
                generated {pendingSummary.generatedAt}.
              </p>
              <p>
                Existing records are kept as they are; only records missing from this database are added. Newly
                added staff accounts arrive without passwords and will need a password reset before they can sign in.
              </p>
            </div>
          ) : null
        }
      />
    </div>
  );
};
