import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiter for agent registration to prevent abuse
 */
export const agentRegistrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 agent registrations per window
  message: { error: 'Too many agent registrations. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit by authenticated user ID
    return (req as any).user?.userId || req.ip || 'anonymous';
  },
});

/**
 * Rate limiter for test print requests
 */
export const testPrintLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Max 10 test prints per minute
  message: { error: 'Too many test print requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return (req as any).user?.userId || req.ip || 'anonymous';
  },
});

/**
 * Rate limiter for reprint requests
 */
export const reprintLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Max 20 reprints per 5 minutes per user
  message: { error: 'Too many reprint requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return (req as any).user?.userId || req.ip || 'anonymous';
  },
});

/**
 * Rate limiter for print job retry requests
 */
export const retryPrintLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Max 30 retries per 5 minutes
  message: { error: 'Too many retry requests. Please wait before retrying.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return (req as any).user?.userId || req.ip || 'anonymous';
  },
});

/**
 * Rate limiter for agent heartbeat (prevent DoS from compromised agents)
 */
export const agentHeartbeatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Max 100 heartbeats per minute per agent (more than enough for 30s interval)
  message: { error: 'Heartbeat rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit by agent ID
    return (req as any).agentId || req.ip || 'anonymous';
  },
});
