import { Router } from 'express';
import { Role } from '@prisma/client';
import * as PurchasesController from './purchases.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createPurchaseOrderSchema, createSupplierSchema, receivePurchaseOrderSchema, updateSupplierSchema } from '../schemas';

const router = Router();
router.use(requireAuth, requireRole([Role.OWNER, Role.MANAGER]));
router.get('/suppliers', PurchasesController.listSuppliers);
router.post('/suppliers', validate(createSupplierSchema), PurchasesController.createSupplier);
router.patch('/suppliers/:supplierId', validate(updateSupplierSchema), PurchasesController.updateSupplier);
router.get('/orders', PurchasesController.listPurchaseOrders);
router.post('/orders', validate(createPurchaseOrderSchema), PurchasesController.createPurchaseOrder);
router.post('/orders/:purchaseOrderId/receive', validate(receivePurchaseOrderSchema), PurchasesController.receivePurchaseOrder);
router.post('/orders/:purchaseOrderId/cancel', PurchasesController.cancelPurchaseOrder);

export default router;
