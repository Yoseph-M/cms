import { Router } from 'express';
import * as MenuController from './menu.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createMenuItemSchema, updateMenuItemSchema, availabilitySchema } from '../schemas';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

router.get('/', MenuController.getMenuItems);
router.post('/', requireRole([Role.OWNER, Role.MANAGER]), validate(createMenuItemSchema), MenuController.createMenuItem);
router.patch('/:id', requireRole([Role.OWNER, Role.MANAGER]), validate(updateMenuItemSchema), MenuController.updateMenuItem);
router.patch('/:id/availability', requireRole([Role.OWNER, Role.MANAGER]), validate(availabilitySchema), MenuController.toggleAvailability);
router.delete('/:id', requireRole([Role.OWNER, Role.MANAGER]), MenuController.deleteMenuItem);

export default router;
