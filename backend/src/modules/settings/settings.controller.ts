import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { emitToLiveOrders } from '../../services/socket.service';

export async function getSystemSetting(req: AuthenticatedRequest, res: Response) {
  const { key } = req.params;

  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (!setting) {
    return res.status(404).json({ error: `Setting "${key}" not found.` });
  }

  return res.json({ key: setting.key, value: setting.value, updatedAt: setting.updatedAt });
}

export async function patchSystemSetting(req: AuthenticatedRequest, res: Response) {
  const { key } = req.params;
  const { value } = req.body;

  const setting = await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  if (key === 'cashierOrderingEnabled') {
    emitToLiveOrders('settings:cashierOrderingChanged', { value: setting.value });
  }

  return res.json({ key: setting.key, value: setting.value, updatedAt: setting.updatedAt });
}
