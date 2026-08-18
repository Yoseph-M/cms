import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../services/prisma.service';
import { PrintJobStatus, Role } from '@prisma/client';
import { emitToLiveOrders } from '../../services/socket.service';
import { recordAudit } from '../../services/audit.service';
import { logger } from '../../utils/logger';

// Claim a print job (Agent -> Backend)
export async function claimPrintJob(req: AuthenticatedRequest, res: Response) {
  const { jobId } = req.params;
  const printAgentId = (req as any).agentId;

  if (!printAgentId) {
    return res.status(401).json({ error: 'Agent authentication required' });
  }

  // Optimistic locking: Update where status is QUEUED
  const updateResult = await prisma.printJob.updateMany({
    where: {
      id: jobId,
      status: PrintJobStatus.QUEUED,
    },
    data: {
      status: PrintJobStatus.PRINTING,
      claimedById: printAgentId,
      attempts: { increment: 1 },
    },
  });

  if (updateResult.count === 0) {
    return res.status(409).json({ error: 'Job already claimed or not queued' });
  }

  const job = await prisma.printJob.findUnique({ where: { id: jobId } });
  return res.status(200).json(job);
}

export async function ackPrintJob(req: AuthenticatedRequest, res: Response) {
  const { jobId } = req.params;
  const { status, error } = req.body;
  const printAgentId = (req as any).agentId;

  if (!printAgentId) {
    return res.status(401).json({ error: 'Agent authentication required' });
  }

  const job = await prisma.printJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.claimedById !== printAgentId) {
    return res.status(403).json({ error: 'Job claimed by another agent' });
  }

  const updatedStatus = status === 'PRINTED' ? PrintJobStatus.PRINTED : PrintJobStatus.FAILED;
  
  await prisma.printJob.update({
    where: { id: jobId },
    data: {
      status: updatedStatus,
      lastError: error || null,
      printedAt: updatedStatus === PrintJobStatus.PRINTED ? new Date() : null,
    },
  });

  emitToLiveOrders('printJob:updated', { jobId, status: updatedStatus, error });

  return res.status(200).json({ success: true });
}

// Fetch pending jobs for an agent's station
export async function getPendingJobs(req: AuthenticatedRequest, res: Response) {
  const printAgentId = (req as any).agentId;
  const agent = await prisma.printAgent.findUnique({ where: { id: printAgentId } });
  
  if (!agent) {
    return res.status(401).json({ error: 'Agent not found' });
  }

  const { station } = req.query;

  const jobs = await prisma.printJob.findMany({
    where: {
      status: PrintJobStatus.QUEUED,
      transport: 'WINDOWS',
      ...(station ? { station: String(station) } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });

  return res.status(200).json(jobs);
}

// Retry a failed print job (Owner/Manager only)
export async function retryPrintJob(req: AuthenticatedRequest, res: Response) {
  const { jobId } = req.params;
  const userId = req.user!.userId;

  const job = await prisma.printJob.findUnique({ where: { id: jobId } });
  
  if (!job) {
    return res.status(404).json({ error: 'Print job not found' });
  }

  if (job.status !== PrintJobStatus.FAILED) {
    return res.status(400).json({ error: 'Only FAILED jobs can be retried' });
  }

  if (job.attempts >= job.maxAttempts) {
    return res.status(400).json({ error: 'Maximum retry attempts exceeded' });
  }

  // Reset job to QUEUED
  const updated = await prisma.printJob.update({
    where: { id: jobId },
    data: {
      status: PrintJobStatus.QUEUED,
      lastError: null,
      claimedById: null,
    },
  });

  // Audit the retry
  await recordAudit({
    actorId: userId,
    actionType: 'PRINT_JOB_RETRY',
    targetType: 'PrintJob',
    targetId: jobId,
    details: { orderId: job.orderId, station: job.station },
  });

  logger.info({ userId, jobId, station: job.station }, 'Print job retry requested');

  emitToLiveOrders('printJob:retry', { jobId, station: job.station });

  return res.status(200).json(updated);
}

// Reprint an order (creates new print job)
export async function reprintOrder(req: AuthenticatedRequest, res: Response) {
  const { orderId } = req.params;
  const userId = req.user!.userId;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { waiter: true },
  });

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Find printer configuration for kitchen
  const { getPrinterRegistry, buildEscPosKitchenTicket } = await import('../../services/printer.service');
  const printers = await getPrinterRegistry();
  const kitchenPrinter = printers.find((p: any) => p.station === 'kitchen');

  if (!kitchenPrinter) {
    return res.status(400).json({ error: 'Kitchen printer not configured' });
  }

  // Build ticket
  const ticketBuffer = buildEscPosKitchenTicket({
    clientOrderId: order.clientOrderId,
    tableNumber: order.tableNumber,
    waiterName: order.waiter?.name,
    createdAt: order.createdAt,
    items: order.items as any,
  });

  const payloadBase64 = ticketBuffer.toString('base64');

  // Create new print job
  const newJob = await prisma.printJob.create({
    data: {
      orderId: order.id,
      station: kitchenPrinter.station,
      transport: kitchenPrinter.transport as any,
      printerName: kitchenPrinter.printerName,
      printerIp: kitchenPrinter.ip,
      printerPort: kitchenPrinter.port,
      payloadBase64,
      status: PrintJobStatus.QUEUED,
    },
  });

  // Audit the reprint
  await recordAudit({
    actorId: userId,
    actionType: 'ORDER_REPRINT',
    targetType: 'Order',
    targetId: orderId,
    details: { printJobId: newJob.id, station: kitchenPrinter.station },
  });

  logger.info({ userId, orderId, printJobId: newJob.id }, 'Order reprint requested');

  emitToLiveOrders('printJob:queued', { printJobId: newJob.id, station: kitchenPrinter.station });

  // For TCP, trigger processing
  if (kitchenPrinter.transport === 'TCP') {
    const { processTCPPrintJob } = await import('../../services/printer.service');
    processTCPPrintJob(newJob.id).catch(e => console.error(e));
  }

  return res.status(201).json(newJob);
}
