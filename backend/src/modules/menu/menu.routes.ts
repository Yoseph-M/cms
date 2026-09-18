import { Router } from 'express';
import * as MenuController from './menu.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createMenuItemSchema, updateMenuItemSchema, availabilitySchema, bulkAvailabilitySchema } from '../schemas';

import { requireMenuEditAccess } from '../../middleware/feature.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', MenuController.getMenuItems);

// Menu editing: Owners and Managers always; Cashiers unless a Manager has
// turned on the "restrict menu editing" setting.
router.post(
  '/',
  requireMenuEditAccess,
  validate(createMenuItemSchema),
  MenuController.createMenuItem
);
router.patch(
  '/:id',
  requireMenuEditAccess,
  validate(updateMenuItemSchema),
  MenuController.updateMenuItem
);
router.patch(
  '/:id/availability',
  requireMenuEditAccess,
  validate(availabilitySchema),
  MenuController.toggleAvailability
);
router.patch(
  '/availability/bulk',
  requireMenuEditAccess,
  validate(bulkAvailabilitySchema),
  MenuController.bulkToggleAvailability
);
router.delete(
  '/:id',
  requireMenuEditAccess,
  MenuController.deleteMenuItem
);

export default router;
