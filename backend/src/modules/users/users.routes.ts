import { Router } from 'express';
import * as UsersController from './users.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  changeOwnPasswordSchema,
} from '../schemas';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

// Self-service routes — all authenticated roles
router.get('/me', UsersController.getMe);
router.patch(
  '/me/password',
  validate(changeOwnPasswordSchema),
  UsersController.changeOwnPassword
);
router.patch('/me/language', UsersController.changeLanguage);

// Admin staff management — Owner and Manager only
router.use(requireRole([Role.OWNER, Role.MANAGER]));

router.get('/', UsersController.getUsers);
router.post('/', validate(createUserSchema), UsersController.createUser);
router.patch('/:id', validate(updateUserSchema), UsersController.updateUser);
router.patch('/:id/deactivate', UsersController.deactivateUser);
router.patch('/:id/reset-password', validate(resetPasswordSchema), UsersController.resetPassword);
router.post('/:id/unlock', UsersController.unlockUser);

export default router;
