import { Router } from 'express';
import { Role } from '@prisma/client';
import * as InventoryController from './inventory.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { stockAdjustmentSchema } from '../schemas';

const router = Router();
router.use(requireAuth);
router.get('/', InventoryController.getInventory);
router.get('/movements', InventoryController.getStockMovements);
router.post(
  '/:id/adjustments',
  requireRole([Role.OWNER, Role.MANAGER]),
  validate(stockAdjustmentSchema),
  InventoryController.adjustStock,
);

export default router;
