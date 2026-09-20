import { Router } from 'express';
import * as BackupController from './backup.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Backups contain the whole ledger, so they are OWNER-only. There is no
// manager-restricted mode to negotiate here.
router.use(requireAuth);
router.use(requireRole([Role.OWNER]));

router.get('/datasets', BackupController.listDatasets);
router.get('/datasets/:key/csv', BackupController.exportDatasetCsv);
router.get('/snapshot', BackupController.downloadSnapshot);

// Destructive format — what it removes, and the reset itself. OWNER-only via
// the router-level guard above; the POST also needs an explicit confirm token.
router.get('/reset/preview', BackupController.getResetPreview);
router.post('/reset', BackupController.resetSystem);

// NOTE: uploads are bounded by the app-wide `express.json({ limit: '10mb' })`.
// The UI reads the downloaded file's size and refuses to upload anything
// larger, pointing at the database-level procedure in Runbook.md instead — a
// silent 413 halfway through a restore is exactly the failure we want to avoid.
router.post('/restore', BackupController.restore);

export default router;
