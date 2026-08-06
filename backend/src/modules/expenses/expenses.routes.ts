import { Router } from 'express';
import * as ExpensesController from './expenses.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);
router.use(requireRole([Role.OWNER, Role.MANAGER]));

router.get('/categories', ExpensesController.listExpenseCategories);
router.get('/', ExpensesController.listExpenses);
router.post('/', ExpensesController.createExpense);
router.patch('/:id', ExpensesController.updateExpense);
router.delete('/:id', ExpensesController.deleteExpense);

export default router;
