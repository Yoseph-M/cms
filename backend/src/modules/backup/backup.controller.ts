import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { recordAudit } from '../../services/audit.service';
import { logger } from '../../utils/logger';
import {
  DATASETS,
  InvalidBackupError,
  buildSnapshot,
  datasetSummaries,
  findDataset,
  resetBusinessData,
  resetPreview,
  restoreSnapshot,
  toCsv,
} from './backup.service';

const MAX_CSV_ROWS = 20000;
const DEFAULT_CSV_ROWS = 5000;

const stamp = (date = new Date()) => date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/backup/datasets
 * What can be exported, with a row count so the UI can show the size of each set.
 */
export async function listDatasets(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    return res.json({ datasets: await datasetSummaries() });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/backup/datasets/:key/csv?limit=5000
 * One dataset as a CSV download.
 */
export async function exportDatasetCsv(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const dataset = findDataset(req.params.key);
    if (!dataset) {
      return res.status(404).json({
        error: `Unknown dataset. Available: ${DATASETS.map((item) => item.key).join(', ')}`,
      });
    }

    const requested = Number(req.query.limit) || DEFAULT_CSV_ROWS;
    const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_CSV_ROWS);
    const rows = await dataset.list(limit);
    // Excel on Windows needs the BOM to read UTF-8 (Amharic item names).
    const csv = `\uFEFF${toCsv(dataset.columns, rows)}`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pos-${dataset.key}-${today()}.csv"`);
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/backup/snapshot
 * The whole business data set as one JSON file (no secrets).
 */
export async function downloadSnapshot(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const snapshot = await buildSnapshot();
    const body = JSON.stringify(snapshot, null, 2);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pos-backup-${stamp()}.json"`);
    res.send(body);

    void recordAudit({
      actorId: req.user!.userId,
      actionType: 'BACKUP_DOWNLOADED',
      targetType: 'System',
      details: {
        bytes: Buffer.byteLength(body, 'utf8'),
        counts: snapshot.counts,
      },
    });
    return undefined;
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/backup/restore
 * Additive restore: inserts records the database does not have yet, never
 * deletes or overwrites.
 */
/**
 * GET /api/backup/reset/preview
 * Exactly what a reset would delete, and what it would keep.
 */
export async function getResetPreview(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    return res.json(await resetPreview());
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/backup/reset
 * Destructive format of the operational books. The body must carry
 * `{ confirm: 'RESET' }` so a stray request can never trigger it.
 */
export async function resetSystem(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (req.body?.confirm !== 'RESET') {
      return res.status(400).json({ error: 'Confirmation failed. Send { "confirm": "RESET" } to proceed.' });
    }

    const result = await resetBusinessData();

    // Awaited: unlike the read-only exports, a destructive reset must have its
    // audit entry written before the request can be reported as successful.
    await recordAudit({
      actorId: req.user!.userId,
      actionType: 'SYSTEM_DATA_RESET',
      targetType: 'System',
      details: {
        deleted: result.deleted,
        collections: result.collections
          .filter((item) => item.deleted > 0)
          .map((item) => `${item.key}:${item.deleted}`),
      },
    });

    logger.warn({ actor: req.user!.userId, deleted: result.deleted }, 'System data reset requested.');
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function restore(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await restoreSnapshot(req.body);

    const summary = {
      ...result,
      target: req.body?.generatedAt ?? null,
      actor: req.user!.userId,
    };

    void recordAudit({
      actorId: req.user!.userId,
      actionType: 'BACKUP_RESTORED',
      targetType: 'System',
      details: {
        inserted: result.inserted,
        skipped: result.skipped,
        failed: result.failed,
        collections: result.collections
          .filter((item) => item.inserted || item.failed)
          .map((item) => `${item.key}:+${item.inserted}${item.failed ? `/${item.failed} failed` : ''}`),
      },
    });

    logger.info({ summary: summary.inserted }, 'Backup restore completed.');
    return res.json(result);
  } catch (error) {
    if (error instanceof InvalidBackupError) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
}
