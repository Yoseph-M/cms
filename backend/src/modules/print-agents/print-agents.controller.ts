import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import crypto from 'crypto';
import { recordAudit } from '../../services/audit.service';
import { logger } from '../../utils/logger';

export async function listAgents(req: AuthenticatedRequest, res: Response) {
  const agents = await prisma.printAgent.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      station: true,
      isRevoked: true,
      lastHeartbeat: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      // Never expose tokenHash
    },
  });
  return res.status(200).json(agents);
}

export async function registerAgent(req: AuthenticatedRequest, res: Response) {
  const { name, station } = req.body;
  const userId = req.user!.userId;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Agent name is required' });
  }

  if (!station || typeof station !== 'string' || station.trim().length === 0) {
    return res.status(400).json({ error: 'Station assignment is required' });
  }

  // Sanitize inputs
  const sanitizedName = name.trim().slice(0, 100);
  const sanitizedStation = station.trim().toLowerCase().slice(0, 50);

  // Validate station is one of the known types
  const validStations = ['kitchen', 'bar', 'cashier'];
  if (!validStations.includes(sanitizedStation)) {
    return res.status(400).json({ 
      error: `Invalid station. Must be one of: ${validStations.join(', ')}` 
    });
  }

  // Generate a random 64-character token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const agent = await prisma.printAgent.create({
      data: {
        name: sanitizedName,
        station: sanitizedStation,
        tokenHash,
      },
    });

    // Audit agent registration
    await recordAudit({
      actorId: userId,
      actionType: 'PRINT_AGENT_REGISTER',
      targetType: 'PrintAgent',
      targetId: agent.id,
      details: { agentName: agent.name, station: agent.station },
    });

    logger.info({ 
      userId, 
      agentId: agent.id, 
      agentName: agent.name, 
      station: agent.station 
    }, 'Print agent registered');

    // Return the raw token exactly ONCE. It cannot be retrieved again.
    return res.status(201).json({
      agent: {
        id: agent.id,
        name: agent.name,
        station: agent.station,
        isRevoked: agent.isRevoked,
        createdAt: agent.createdAt,
      },
      token, // Important: only returned once!
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Agent with this name already exists' });
    }
    throw error;
  }
}

export async function revokeAgent(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const userId = req.user!.userId;

  const existing = await prisma.printAgent.findUnique({ where: { id } });
  
  if (!existing) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  if (existing.isRevoked) {
    return res.status(400).json({ error: 'Agent already revoked' });
  }

  const agent = await prisma.printAgent.update({
    where: { id },
    data: { isRevoked: true },
  });

  // Audit agent revocation
  await recordAudit({
    actorId: userId,
    actionType: 'PRINT_AGENT_REVOKE',
    targetType: 'PrintAgent',
    targetId: agent.id,
    details: { agentName: agent.name },
  });

  logger.warn({ userId, agentId: agent.id, agentName: agent.name }, 'Print agent revoked');

  return res.status(200).json({
    id: agent.id,
    name: agent.name,
    isRevoked: agent.isRevoked,
    createdAt: agent.createdAt,
  });
}

// Explicit heartbeat endpoint for agent status updates
export async function heartbeat(req: AuthenticatedRequest, res: Response) {
  const printAgentId = (req as any).agentId;
  const { version, printerStatus } = req.body;

  if (!printAgentId) {
    return res.status(401).json({ error: 'Agent authentication required' });
  }

  const agent = await prisma.printAgent.findUnique({ where: { id: printAgentId } });

  if (!agent) {
    return res.status(401).json({ error: 'Agent not found' });
  }

  if (agent.isRevoked) {
    return res.status(401).json({ error: 'Agent has been revoked' });
  }

  // Update heartbeat and version
  await prisma.printAgent.update({
    where: { id: printAgentId },
    data: {
      lastHeartbeat: new Date(),
      version: version || agent.version,
    },
  });

  logger.debug({ 
    agentId: agent.id, 
    agentName: agent.name, 
    station: agent.station,
    version: version || agent.version 
  }, 'Agent heartbeat received');

  return res.status(200).json({
    success: true,
    agent: {
      id: agent.id,
      name: agent.name,
      station: agent.station,
      isRevoked: false,
    },
  });
}
