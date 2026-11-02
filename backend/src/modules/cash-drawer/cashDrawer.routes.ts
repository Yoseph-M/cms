import { Router } from 'express';
import { Role } from '@prisma/client';
import * as CashDrawerController from './cashDrawer.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCashDrawerEntrySchema } from '../schemas';

const router = Router();
router.use(requireAuth);
router.get('/', requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]), CashDrawerController.getCashDrawer);
router.post('/', requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]), validate(createCashDrawerEntrySchema), CashDrawerController.createCashDrawerEntry);

export default router;
