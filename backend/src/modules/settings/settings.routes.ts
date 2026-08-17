import { Router } from 'express';
import * as SettingsController from './settings.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { updateSystemSettingSchema } from '../schemas';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

router.get(
  '/system',
  SettingsController.getAllSystemSettings
);

router.get(
  '/system/:key',
  requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]),
  SettingsController.getSystemSetting
);

router.patch(
  '/system/:key',
  requireRole([Role.OWNER, Role.MANAGER]),
  validate(updateSystemSettingSchema),
  SettingsController.patchSystemSetting
);

export default router;
