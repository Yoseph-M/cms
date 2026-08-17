import { Router } from 'express';
import * as MenuController from './menu.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createMenuItemSchema, updateMenuItemSchema, availabilitySchema } from '../schemas';
import { Role } from '@prisma/client';

import { requireFeatureFlag } from '../../middleware/feature.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', MenuController.getMenuItems);
router.post(
  '/',
  requireRole([Role.CASHIER]),
  requireFeatureFlag('cashierMenuManagementEnabled'),
  validate(createMenuItemSchema),
  MenuController.createMenuItem
);
router.patch(
  '/:id',
  requireRole([Role.CASHIER]),
  requireFeatureFlag('cashierMenuManagementEnabled'),
  validate(updateMenuItemSchema),
  MenuController.updateMenuItem
);
router.patch(
  '/:id/availability',
  requireRole([Role.CASHIER]),
  requireFeatureFlag('cashierMenuManagementEnabled'),
  validate(availabilitySchema),
  MenuController.toggleAvailability
);
router.delete(
  '/:id',
  requireRole([Role.CASHIER]),
  requireFeatureFlag('cashierMenuManagementEnabled'),
  MenuController.deleteMenuItem
);

export default router;
