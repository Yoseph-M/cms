import { Router } from 'express';
import * as MenuController from './menu.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createMenuItemSchema, updateMenuItemSchema, availabilitySchema, bulkAvailabilitySchema } from '../schemas';

import { requireMenuEditAccess } from '../../middleware/feature.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', MenuController.getMenuItems);

// Menu editing is opt-in everywhere, per role: an Owner must enable
// `ownerMenuEditEnabled` for themselves and a Manager `managerMenuEditEnabled`
// for the manager role; Cashiers may edit unless a Manager turns on the
// "restrict menu editing" setting.
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
