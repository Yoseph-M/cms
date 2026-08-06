import { Router } from 'express';
import * as NotificationsController from './notifications.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);
router.use(requireRole([Role.OWNER, Role.MANAGER]));

router.get('/', NotificationsController.listNotifications);
router.patch('/read-all', NotificationsController.markAllRead);
router.patch('/:id/read', NotificationsController.markRead);

export default router;
