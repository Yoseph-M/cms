import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';
import { listAgents, registerAgent, revokeAgent } from './print-agents.controller';
import { agentRegistrationLimiter } from '../../middleware/rate-limit.middleware';

const router = Router();

router.use(requireAuth);
// Only Owners can manage print agents
router.use(requireRole([Role.OWNER]));

router.get('/', listAgents);
router.post('/register', agentRegistrationLimiter, registerAgent);
router.post('/:id/revoke', revokeAgent);

export default router;
