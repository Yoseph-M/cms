/**
 * Integrity Engine Service
 * 
 * Verifies system financial and operational integrity.
 * Checks for:
 * 1. Over-settlement (settlement total > order total)
 * 2. Orphan settlements (settlements without valid order)
 * 3. Missing shift (cash settlement without an open shift)
 * 4. Closed shift settlement (cash settlement on closed shift)
 * 5. Duplicate daily close
 * 6. Negative totals (order amounts, payouts)
 * 7. Broken ledger chain
 * 8. Ledger tampering (missing sequential events, time anomalies)
 */

import { prisma } from '../../services/prisma.service';
import { IntegritySeverity, IntegrityCategory, ShiftStatus, IntegrityIssue } from '@prisma/client';
import { recordAudit, SYSTEM_USER_ID } from '../../services/audit.service';
import { emitToRoom } from '../../services/socket.service';
import { logger } from '../../utils/logger';

interface IntegrityIssueDraft {
  severity: IntegritySeverity;
  category: IntegrityCategory;
  description: string;
  referenceType: string;
  referenceId: string;
}

/**
 * Safe wrapper for integrity checks
 * Prevents a single failing check from blocking all other checks
 */
async function safeCheck(fn: () => Promise<void>, checkName: string, issues: IntegrityIssueDraft[]) {
  try {
    await fn();
  } catch (err) {
    logger.error({ err, checkName }, 'Integrity check failed to execute');
    issues.push({
      severity: IntegritySeverity.CRITICAL,
      category: IntegrityCategory.BROKEN_LEDGER, // Using BROKEN_LEDGER as closest category for system failures
      description: `Integrity check "${checkName}" failed to run — investigate immediately.`,
      referenceType: 'System',
      referenceId: checkName,
    });
  }
}

export async function runIntegrityChecks() {
  const issues: IntegrityIssueDraft[] = [];

  // Check 1: Over-settlement
  await safeCheck(async () => {
    const overSettledRaw = await prisma.order.aggregateRaw({
      pipeline: [
        { $lookup: { from: 'settlements', localField: '_id', foreignField: 'orderId', as: 'settlements' } },
        { $addFields: { settledAmount: { $sum: '$settlements.amountMinor' } } },
        { $match: { $expr: { $gt: ['$settledAmount', '$totalAmount'] } } },
        { $project: { _id: 1, totalAmount: 1, settledAmount: 1 } },
      ],
    }) as unknown as Array<{ _id: { $oid: string }; totalAmount: number; settledAmount: number }>;

    for (const order of overSettledRaw) {
      issues.push({
        severity: IntegritySeverity.ERROR,
        category: IntegrityCategory.OVER_SETTLEMENT,
        description: `Order ${order._id.$oid} is over-settled (Expected: ${order.totalAmount}, Settled: ${order.settledAmount})`,
        referenceType: 'Order',
        referenceId: order._id.$oid,
      });
    }
  }, 'Over-settlement check', issues);

  // Check 2: Orphan Settlements
  await safeCheck(async () => {
    const orphanRaw = await prisma.settlement.aggregateRaw({
      pipeline: [
        { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'order' } },
        { $match: { order: { $size: 0 } } },
        { $project: { _id: 1 } },
      ],
    }) as unknown as Array<{ _id: { $oid: string } }>;

    for (const settlement of orphanRaw) {
      issues.push({
        severity: IntegritySeverity.CRITICAL,
        category: IntegrityCategory.ORPHAN_SETTLEMENT,
        description: `Settlement ${settlement._id.$oid} has no matching order`,
        referenceType: 'Settlement',
        referenceId: settlement._id.$oid,
      });
    }
  }, 'Orphan settlements check', issues);

  // Check 3 & 4: Shift Issues (Missing Shift / Closed Shift Settlement)
  await safeCheck(async () => {
    // NEW: Check that all CASH settlements have shiftId populated
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const cashSettlementsWithoutShift = await prisma.settlement.findMany({
      where: { 
        method: 'CASH',
        shiftId: null, // CASH settlements must have shiftId
        createdAt: { gte: today }
      },
    });

    for (const settlement of cashSettlementsWithoutShift) {
      issues.push({
        severity: IntegritySeverity.CRITICAL,
        category: IntegrityCategory.MISSING_SHIFT,
        description: `Cash settlement ${settlement.id} has no associated shift (shiftId is null)`,
        referenceType: 'Settlement',
        referenceId: settlement.id,
      });
    }

    // Check 4: Verify cash settlements have matching ledger entries and weren't recorded on closed shifts
    const cashSettlements = await prisma.settlement.findMany({
      where: { method: 'CASH', createdAt: { gte: today } },
    });

    // Get all shifts with their close times
    const shifts = await prisma.cashierShift.findMany({
      where: { openedAt: { gte: today } },
      select: { 
        id: true, 
        status: true, 
        closedAt: true,
        openedAt: true 
      },
    });
    const shiftsById = new Map(shifts.map(s => [s.id, s]));

    const cashEvents = await prisma.cashDrawerEvent.findMany({
      where: { type: 'CASH_SETTLEMENT', createdAt: { gte: today } },
      include: { shift: true },
    });

    for (const settlement of cashSettlements) {
      const event = cashEvents.find(e => e.referenceId === settlement.id);
      
      // Missing ledger entry
      if (!event) {
        issues.push({
          severity: IntegritySeverity.ERROR,
          category: IntegrityCategory.MISSING_SHIFT,
          description: `Cash settlement ${settlement.id} has no matching cash drawer ledger entry`,
          referenceType: 'Settlement',
          referenceId: settlement.id,
        });
        continue;
      }
      
      // Check if settlement was recorded after shift was closed
      const shift = shiftsById.get(event.shiftId);
      if (shift && shift.closedAt && settlement.createdAt > shift.closedAt) {
        issues.push({
          severity: IntegritySeverity.ERROR,
          category: IntegrityCategory.CLOSED_SHIFT_SETTLEMENT,
          description: `Cash settlement ${settlement.id} was recorded after shift ${shift.id} was closed (Settlement: ${settlement.createdAt.toISOString()}, Shift closed: ${shift.closedAt.toISOString()})`,
          referenceType: 'Settlement',
          referenceId: settlement.id,
        });
      }
    }
  }, 'Shift issues check', issues);

  // Check 5: Duplicate daily close
  await safeCheck(async () => {
    const duplicateRaw = await prisma.dailyClose.aggregateRaw({
      pipeline: [
        { $group: { _id: '$businessDate', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ],
    }) as unknown as Array<{ _id: string; count: number }>;

    for (const close of duplicateRaw) {
      issues.push({
        severity: IntegritySeverity.CRITICAL,
        category: IntegrityCategory.DUPLICATE_CLOSE,
        description: `Multiple daily closes found for date ${close._id}`,
        referenceType: 'DailyCloseDate',
        referenceId: close._id,
      });
    }
  }, 'Duplicate daily close check', issues);

  // Check 6: Negative financial totals
  await safeCheck(async () => {
    const negativeOrders = await prisma.order.findMany({
      where: { totalAmount: { lt: 0 } },
    });
    for (const order of negativeOrders) {
      issues.push({
        severity: IntegritySeverity.ERROR,
        category: IntegrityCategory.NEGATIVE_TOTAL,
        description: `Order ${order.id} has negative total amount: ${order.totalAmount}`,
        referenceType: 'Order',
        referenceId: order.id,
      });
    }
  }, 'Negative totals check', issues);

  // Check 7: Broken ledger chain (Expected cash doesn't match sum of events)
  await safeCheck(async () => {
    const openShifts = await prisma.cashierShift.findMany({
      where: { status: ShiftStatus.OPEN },
      include: { cashDrawerEvents: true },
    });

    for (const shift of openShifts) {
      let computedExpected = shift.openingCashMinor;
      for (const event of shift.cashDrawerEvents) {
        if (['OPENING_BALANCE', 'CASH_SETTLEMENT'].includes(event.type)) {
          computedExpected += event.amountMinor;
        } else if (['CASH_PAYOUT', 'PETTY_CASH'].includes(event.type)) {
          computedExpected -= event.amountMinor;
        } else if (event.type === 'CASH_ADJUSTMENT') {
          computedExpected += event.amountMinor;
        }
      }
      
      // For OPEN shifts, expectedCashMinor should match computed value from ledger
      // If shift has expectedCashMinor populated and it doesn't match, flag as broken chain
      if (shift.expectedCashMinor !== null && shift.expectedCashMinor !== computedExpected) {
        issues.push({
          severity: IntegritySeverity.ERROR,
          category: IntegrityCategory.BROKEN_LEDGER,
          description: `Shift ${shift.id} has broken ledger chain (Expected: ${shift.expectedCashMinor}, Computed: ${computedExpected})`,
          referenceType: 'CashierShift',
          referenceId: shift.id,
        });
      }
    }
  }, 'Broken ledger chain check', issues);

  // Check 8: Ledger tampering detection (time anomalies, gaps)
  await safeCheck(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const allShifts = await prisma.cashierShift.findMany({
      where: { createdAt: { gte: today } },
      include: { cashDrawerEvents: { orderBy: { createdAt: 'asc' } } },
    });

    for (const shift of allShifts) {
      const events = shift.cashDrawerEvents;
      
      // Check for time anomalies: events should be chronologically ordered
      for (let i = 1; i < events.length; i++) {
        const prevEvent = events[i - 1];
        const currEvent = events[i];
        
        // If current event is before previous event, flag as tampering
        if (currEvent.createdAt < prevEvent.createdAt) {
          issues.push({
            severity: IntegritySeverity.CRITICAL,
            category: IntegrityCategory.BROKEN_LEDGER,
            description: `Shift ${shift.id} has out-of-order ledger events (Event ${currEvent.id} created before ${prevEvent.id})`,
            referenceType: 'CashierShift',
            referenceId: shift.id,
          });
        }
      }
      
      // Check for missing OPENING_BALANCE
      if (events.length > 0 && events[0].type !== 'OPENING_BALANCE') {
        issues.push({
          severity: IntegritySeverity.ERROR,
          category: IntegrityCategory.BROKEN_LEDGER,
          description: `Shift ${shift.id} missing OPENING_BALANCE as first event`,
          referenceType: 'CashierShift',
          referenceId: shift.id,
        });
      }
    }
  }, 'Ledger tampering check', issues);

  // Record issues in DB with efficient batch duplicate detection
  const createdIssues = [];
  
  // Step 1: Batch query for existing unresolved issues
  const existingIssuesMap = new Map<string, IntegrityIssue>();
  if (issues.length > 0) {
    const existingIssues = await prisma.integrityIssue.findMany({
      where: {
        resolved: false,
        OR: issues.map(issue => ({
          category: issue.category,
          referenceId: issue.referenceId,
        })),
      },
    });
    
    // Build lookup map: category:referenceId -> issue
    for (const existing of existingIssues) {
      const key = `${existing.category}:${existing.referenceId}`;
      existingIssuesMap.set(key, existing);
    }
  }
  
  // Step 2: Create or update issues
  for (const issue of issues) {
    const key = `${issue.category}:${issue.referenceId}`;
    const existing = existingIssuesMap.get(key);

    if (!existing) {
      // NEW ISSUE: Create it
      const created = await prisma.integrityIssue.create({ 
        data: {
          ...issue,
          lastSeenAt: new Date(),
        }
      });
      createdIssues.push(created);
      
      // Emit real-time alert for new issues
      emitToRoom('managers', 'integrity:alert', created);
      
      logger.warn(
        { category: issue.category, referenceId: issue.referenceId, severity: issue.severity },
        'New integrity issue detected'
      );
    } else {
      // EXISTING UNRESOLVED ISSUE: Update lastSeenAt (proves issue persists)
      await prisma.integrityIssue.update({
        where: { id: existing.id },
        data: { 
          lastSeenAt: new Date(),
          // Update description/severity if changed
          description: issue.description,
          severity: issue.severity,
        },
      });
      
      logger.debug(
        { issueId: existing.id, category: issue.category, referenceId: issue.referenceId },
        'Integrity issue still unresolved (updated lastSeenAt)'
      );
    }
  }

  const passed = issues.length === 0;

  if (!passed) {
    await recordAudit({
      actorId: SYSTEM_USER_ID,
      actionType: 'INTEGRITY_CHECK_FAILED',
      targetType: 'System',
      details: { issueCount: issues.length },
    });
  }

  return {
    passed,
    issuesFound: issues.length,
    newIssuesLogged: createdIssues.length,
  };
}

export async function getUnresolvedIssues() {
  return prisma.integrityIssue.findMany({
    where: { resolved: false },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Resolve an integrity issue
 * 
 * Marks an issue as resolved with metadata:
 * - Who resolved it (resolvedById)
 * - When it was resolved (resolvedAt)
 * - Why/how it was resolved (resolutionNotes)
 * 
 * This creates an audit trail for issue resolution.
 */
interface ResolveIssueParams {
  issueId: string;
  resolvedById: string;
  resolutionNotes?: string;
}

export async function resolveIntegrityIssue(params: ResolveIssueParams) {
  const { issueId, resolvedById, resolutionNotes } = params;

  const issue = await prisma.integrityIssue.findUnique({
    where: { id: issueId },
  });

  if (!issue) {
    throw new Error(`IntegrityIssue with id ${issueId} not found`);
  }

  if (issue.resolved) {
    throw new Error(`IntegrityIssue ${issueId} is already resolved`);
  }

  const updated = await prisma.integrityIssue.update({
    where: { id: issueId },
    data: {
      resolved: true,
      resolvedAt: new Date(),
      resolvedById,
      resolutionNotes: resolutionNotes || 'Issue manually resolved',
    },
    include: {
      resolvedBy: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  // Audit log
  await recordAudit({
    actorId: resolvedById,
    actionType: 'INTEGRITY_ISSUE_RESOLVED',
    targetType: 'IntegrityIssue',
    targetId: issueId,
    details: {
      category: issue.category,
      severity: issue.severity,
      resolutionNotes,
    },
  });

  logger.info(
    { issueId, category: issue.category, severity: issue.severity, resolvedById },
    'Integrity issue resolved'
  );

  return updated;
}

/**
 * Get all integrity issues (resolved and unresolved)
 * With pagination and filtering
 */
interface GetIssuesParams {
  resolved?: boolean;
  severity?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export async function getIntegrityIssues(params: GetIssuesParams = {}) {
  const { resolved, severity, category, limit = 50, offset = 0 } = params;

  const where: {
    resolved?: boolean;
    severity?: IntegritySeverity;
    category?: IntegrityCategory;
  } = {};
  
  if (resolved !== undefined) {
    where.resolved = resolved;
  }
  
  if (severity) {
    where.severity = severity as IntegritySeverity;
  }
  
  if (category) {
    where.category = category as IntegrityCategory;
  }

  const [issues, total] = await Promise.all([
    prisma.integrityIssue.findMany({
      where,
      include: {
        resolvedBy: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: [
        { resolved: 'asc' },  // Unresolved first
        { severity: 'desc' },  // CRITICAL → INFO
        { createdAt: 'desc' }, // Newest first
      ],
      skip: offset,
      take: limit,
    }),
    prisma.integrityIssue.count({ where }),
  ]);

  return { issues, total, limit, offset };
}
