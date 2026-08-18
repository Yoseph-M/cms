import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/security';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  agentId?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token header.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Access token expired or invalid.' });
  }
}

import { prisma } from '../services/prisma.service';
import crypto from 'crypto';

export async function requireAgentAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const agentToken = req.headers['x-agent-token'] as string;
  
  if (!agentToken) {
    return res.status(401).json({ error: 'Unauthorized: Missing agent token.' });
  }

  const tokenHash = crypto.createHash('sha256').update(agentToken).digest('hex');
  
  const agent = await prisma.printAgent.findUnique({
    where: { tokenHash },
  });

  if (!agent || agent.isRevoked) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or revoked agent token.' });
  }

  // Update heartbeat in background
  prisma.printAgent.update({
    where: { id: agent.id },
    data: { lastHeartbeat: new Date() },
  }).catch(() => {});

  req.agentId = agent.id;
  next();
}
