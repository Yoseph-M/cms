import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Role } from '@prisma/client';
import * as MarketplaceController from './marketplace.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createMarketplaceBusinessSchema,
  createMarketplaceMemberSchema,
  createMarketplaceOrderSchema,
  createMarketplaceProductSchema,
  createMarketplaceVariantSchema,
  createMarketplaceZoneSchema,
  updateMarketplaceBusinessSchema,
  updateMarketplaceOrderStatusSchema,
  updateMarketplaceProductSchema,
  updateMarketplaceVariantSchema,
  updateMarketplaceZoneSchema,
} from '../schemas';

const router = Router();

// Public storefront. Product and store output is limited to active listings.
router.get('/businesses', MarketplaceController.listBusinesses);
router.get('/businesses/:slug', MarketplaceController.getBusinessBySlug);
router.get('/products', MarketplaceController.listProducts);
router.post(
  '/orders',
  rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
  validate(createMarketplaceOrderSchema),
  MarketplaceController.createPublicOrder,
);

// Merchant workspace. Every handler also checks business membership before
// reading or changing a store's private inventory and customer orders.
router.use('/manage', requireAuth, requireRole([Role.OWNER, Role.MANAGER]));
router.get('/manage/businesses', MarketplaceController.listManagedBusinesses);
router.post('/manage/businesses', validate(createMarketplaceBusinessSchema), MarketplaceController.createBusiness);
router.patch('/manage/businesses/:businessId', validate(updateMarketplaceBusinessSchema), MarketplaceController.updateBusiness);
router.get('/manage/businesses/:businessId/members', MarketplaceController.listBusinessMembers);
router.post('/manage/businesses/:businessId/members', validate(createMarketplaceMemberSchema), MarketplaceController.addBusinessMember);
router.delete('/manage/businesses/:businessId/members/:userId', MarketplaceController.removeBusinessMember);
router.get('/manage/businesses/:businessId/products', MarketplaceController.listManagedProducts);
router.post('/manage/businesses/:businessId/products', validate(createMarketplaceProductSchema), MarketplaceController.createProduct);
router.patch('/manage/businesses/:businessId/products/:productId', validate(updateMarketplaceProductSchema), MarketplaceController.updateProduct);
router.get('/manage/businesses/:businessId/stock-movements', MarketplaceController.listManagedStockMovements);
router.post('/manage/businesses/:businessId/products/:productId/variants', validate(createMarketplaceVariantSchema), MarketplaceController.createProductVariant);
router.patch('/manage/businesses/:businessId/products/:productId/variants/:variantId', validate(updateMarketplaceVariantSchema), MarketplaceController.updateProductVariant);
router.get('/manage/businesses/:businessId/delivery-zones', MarketplaceController.listZones);
router.post('/manage/businesses/:businessId/delivery-zones', validate(createMarketplaceZoneSchema), MarketplaceController.createZone);
router.patch('/manage/businesses/:businessId/delivery-zones/:zoneId', validate(updateMarketplaceZoneSchema), MarketplaceController.updateZone);
router.get('/manage/businesses/:businessId/orders', MarketplaceController.listManagedOrders);
router.patch('/manage/businesses/:businessId/orders/:orderId', validate(updateMarketplaceOrderStatusSchema), MarketplaceController.updateManagedOrder);

export default router;
