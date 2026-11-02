import { Router } from 'express';
import { Role } from '@prisma/client';
import * as CustomersController from './customers.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCustomerSchema, updateCustomerSchema } from '../schemas';

const router = Router();
router.use(requireAuth);
router.get('/', CustomersController.listCustomers);
router.get('/:id', CustomersController.getCustomer);
router.post('/', requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]), validate(createCustomerSchema), CustomersController.createCustomer);
router.patch('/:id', requireRole([Role.OWNER, Role.MANAGER, Role.CASHIER]), validate(updateCustomerSchema), CustomersController.updateCustomer);
router.delete('/:id', requireRole([Role.OWNER, Role.MANAGER]), CustomersController.deleteCustomer);

export default router;
