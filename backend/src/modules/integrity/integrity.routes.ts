import { Router } from 'express';
import * as IntegrityController from './integrity.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

// Get unresolved integrity issues — MANAGER, OWNER
router.get(
  '/',
  requireRole([Role.MANAGER, Role.OWNER]),
  IntegrityController.getIssues
);

// Manually trigger integrity check — OWNER
router.post(
  '/run',
  requireRole([Role.OWNER]),
  IntegrityController.runCheck
);

export default router;
