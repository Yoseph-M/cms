import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { emitToLiveOrders } from '../../services/socket.service';

export async function getAllSystemSettings(req: AuthenticatedRequest, res: Response) {
  const settings = await prisma.systemSetting.findMany();
  
  const settingsMap = settings.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {} as Record<string, string>);

  return res.json(settingsMap);
}

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

  const ownerOnlySettings = [
    'managerDashboardEnabled',
    'systemAdministrationEnabled',
    'cashierMenuManagementEnabled',
  ];

  if (ownerOnlySettings.includes(key) && req.user?.role !== 'OWNER') {
    return res.status(403).json({ error: 'Only the OWNER can modify this setting.' });
  }

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
