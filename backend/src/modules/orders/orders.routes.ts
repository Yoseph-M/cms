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

// Legacy endpoints - DEPRECATED, use /api/orders/:orderId/settlements instead
router.patch('/:id/pay', requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]), validate(payOrderSchema), OrdersController.payOrder);

// Cancel an unsettled order immediately. A reason is retained in the audit trail.
router.post('/:id/cancel', requireRole([Role.WAITER, Role.CASHIER, Role.MANAGER, Role.OWNER]), validate(cancelRequestSchema), OrdersController.cancelOrder);

router.post('/:id/reprint', requireRole([Role.CASHIER, Role.MANAGER, Role.OWNER]), OrdersController.reprintOrder);

export default router;
