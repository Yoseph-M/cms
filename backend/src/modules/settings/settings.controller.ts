import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { clearFeatureFlagCache } from '../../middleware/feature.middleware';
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
    return res.json({ key, value: null, updatedAt: new Date() });
  }

  return res.json({ key: setting.key, value: setting.value, updatedAt: setting.updatedAt });
}

export async function patchSystemSetting(req: AuthenticatedRequest, res: Response) {
  const { key } = req.params;
  const { value } = req.body;

  const ownerOnlySettings = [
    'managerDashboardEnabled',
    'systemAdministrationEnabled',
  ];

  if (ownerOnlySettings.includes(key) && req.user?.role !== 'OWNER') {
    return res.status(403).json({ error: 'Only the OWNER can modify this setting.' });
  }

  const setting = await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  // Feature flags are cached in memory for 30s — refresh immediately so the
  // new value is enforced on the very next request.
  clearFeatureFlagCache();

  if (key === 'cashierMenuEditRestricted') {
    emitToLiveOrders('settings:menuEditChanged', { value: setting.value });
  }

  return res.json({ key: setting.key, value: setting.value, updatedAt: setting.updatedAt });
}
