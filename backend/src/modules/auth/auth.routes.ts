import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as AuthController from './auth.controller';
import { validate } from '../../middleware/validate.middleware';
import { loginSchema, pinLoginSchema, refreshTokenSchema } from '../schemas';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const identifier = req.body.email || 'anonymous';
    return `${ip}-${identifier}`;
  },
  message: { error: 'Too many authentication attempts, please try again later.' }
});

const pinAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const identifier = req.body.userId || 'anonymous';
    return `${ip}-${identifier}`;
  },
  message: { error: 'Too many authentication attempts, please try again later.' }
});

const router = Router();

// Public endpoints — no auth required, but rate-limited
router.get('/roles', AuthController.getRoles);
router.get('/users-by-role/:role', AuthController.getUsersByRole);

// Rate-limited auth endpoints
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/pin-login', pinAuthLimiter, validate(pinLoginSchema), AuthController.pinLogin);
router.post('/refresh', validate(refreshTokenSchema), AuthController.refreshToken);
router.post('/logout', AuthController.logout);

export default router;
