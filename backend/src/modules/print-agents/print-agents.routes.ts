import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';
import { listAgents, registerAgent, revokeAgent, heartbeat } from './print-agents.controller';
import { agentRegistrationLimiter, agentHeartbeatLimiter } from '../../middleware/rate-limit.middleware';
import { requireAgentAuth } from '../../middleware/auth.middleware';

const router = Router();

// Agent endpoints (agent authentication)
router.post('/heartbeat', requireAgentAuth, agentHeartbeatLimiter, heartbeat);

// Owner-only endpoints (user authentication)
router.use(requireAuth);
router.use(requireRole([Role.OWNER]));

router.get('/', listAgents);
router.post('/register', agentRegistrationLimiter, registerAgent);
router.post('/:id/revoke', revokeAgent);

export default router;
