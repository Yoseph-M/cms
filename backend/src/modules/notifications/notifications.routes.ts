import { Router } from 'express';
import * as NotificationsController from './notifications.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);
// Cashiers carry a bell of their own: they are told when a manager approves or
// disapproves the End of Day request they sent.
router.use(requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]));

router.get('/', NotificationsController.listNotifications);
router.patch('/read-all', NotificationsController.markAllRead);
router.patch('/:id/read', NotificationsController.markRead);

export default router;
