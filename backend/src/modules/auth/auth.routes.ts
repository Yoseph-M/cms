import { Router } from 'express';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import * as AuthController from './auth.controller';
import { validate } from '../../middleware/validate.middleware';
import { loginSchema, refreshTokenSchema } from '../schemas';

/** Shared store so tests can reset between cases */
export const authRateLimitStore = new MemoryStore();

/**
 * IP-based throttle on login endpoints — no account lockout UX.
 * Generous enough that mistyped passwords never trip it; blocks scripted brute force.
 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: authRateLimitStore,
  message: { error: 'Too many login attempts — please wait a moment and try again.' },
});

const router = Router();

router.get('/roles', AuthController.getRoles);
router.get('/users-by-role/:role', AuthController.getUsersByRole);

router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/refresh', validate(refreshTokenSchema), AuthController.refreshToken);
router.post('/logout', AuthController.logout);

export default router;
