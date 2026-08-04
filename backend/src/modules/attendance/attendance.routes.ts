import { Router } from 'express';
import * as AttendanceController from './attendance.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createAttendanceSchema } from '../schemas';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);
router.use(requireRole([Role.OWNER, Role.MANAGER]));

router.get('/', AttendanceController.getAttendance);
router.post('/', validate(createAttendanceSchema), AttendanceController.createOrUpdateAttendance);
router.patch('/:id', AttendanceController.updateAttendance);

export default router;
