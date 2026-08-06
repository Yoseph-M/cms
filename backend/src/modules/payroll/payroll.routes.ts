import { Router } from 'express';
import * as PayrollController from './payroll.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { payrollEntrySchema } from '../schemas';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);
router.use(requireRole([Role.OWNER, Role.MANAGER]));

router.get('/', PayrollController.getPayrollHistory);
router.get('/staff-ref/:userId', PayrollController.getStaffPayrollRef);
router.post('/entries', validate(payrollEntrySchema), PayrollController.recordPayrollEntry);
router.post('/adjustments', PayrollController.createAdjustment);

export default router;
