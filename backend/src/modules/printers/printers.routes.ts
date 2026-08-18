import { Router } from 'express';
import * as PrintersController from './printers.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';
import { testPrintLimiter } from '../../middleware/rate-limit.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole([Role.OWNER, Role.MANAGER]), PrintersController.getPrinters);
router.post('/', requireRole([Role.OWNER]), PrintersController.updatePrinters);
router.patch('/:id', requireRole([Role.OWNER]), PrintersController.updatePrinter);
router.delete('/:id', requireRole([Role.OWNER]), PrintersController.deletePrinter);
router.post('/:id/test-print', requireRole([Role.OWNER]), testPrintLimiter, PrintersController.testPrint);

export default router;
