import { Router } from 'express';
import * as PrintersController from './printers.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';
import { testPrintLimiter } from '../../middleware/rate-limit.middleware';

const router = Router();

router.use(requireAuth);

// Printers are per-terminal devices: whoever works the till has to be able to
// set one up, because the cashier standing at the counter is the one who knows
// which printer is plugged into that terminal. Owner, Manager and Cashier share
// the same full access.
router.get('/', requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]), PrintersController.getPrinters);
router.post('/', requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]), PrintersController.updatePrinters);
router.patch('/:id', requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]), PrintersController.updatePrinter);
router.delete('/:id', requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]), PrintersController.deletePrinter);
router.post(
  '/:id/test-print',
  requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]),
  testPrintLimiter,
  PrintersController.testPrint,
);

export default router;
