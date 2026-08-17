import { Router } from 'express';
import * as IntegrityController from './integrity.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { resolveIssueSchema } from './integrity.schema';
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

// Resolve an integrity issue — MANAGER, OWNER
router.post(
  '/:id/resolve',
  requireRole([Role.MANAGER, Role.OWNER]),
  validate(resolveIssueSchema),
  IntegrityController.resolveIssue
);

export default router;
