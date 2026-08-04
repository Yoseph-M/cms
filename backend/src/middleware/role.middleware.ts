import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { Role } from '@prisma/client';

export function requireRole(allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      return res.status(403).json({
        error: `Forbidden: Access restricted. Role '${req.user.role}' is not authorized for this resource.`,
      });
    }

    next();
  };
}
