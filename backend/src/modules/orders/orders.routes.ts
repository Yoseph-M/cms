import { Router } from 'express';
import * as OrdersController from './orders.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createOrderSchema, payOrderSchema, cancelRequestSchema } from '../schemas';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

router.post('/', requireRole([Role.WAITER, Role.CASHIER]), validate(createOrderSchema), OrdersController.createOrder);
router.get('/', OrdersController.getOrders);
router.get('/:id', OrdersController.getOrderById);

router.patch('/:id/status', requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]), OrdersController.updateOrderStatus);
router.patch('/:id/pay', requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]), validate(payOrderSchema), OrdersController.payOrder);

router.post('/:id/cancel-request', requireRole([Role.WAITER, Role.CASHIER, Role.MANAGER, Role.OWNER]), validate(cancelRequestSchema), OrdersController.requestCancelOrder);
router.patch('/:id/cancel-confirm', requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]), OrdersController.confirmCancelOrder);

router.get('/:id/receipt', requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]), OrdersController.getReceipt);
router.post('/:id/reprint', requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]), OrdersController.reprintOrder);

export default router;
