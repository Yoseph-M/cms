/**
 * Money-scale repair — tickets left in the old cents scale.
 *
 *   npm run repair:money-scale              # dry run: what it WOULD change
 *   npm run repair:money-scale -- --apply    # rewrite those tickets
 *
 * The dry run is the default and it is the point: it prints every ticket it
 * would rewrite, line by line, with the menu price beside each old price, and
 * every payment recorded against the ticket. Read it before `--apply`.
 *
 * What it changes (and only for tickets the evidence flags — a line at least
 * ten times above today's menu price): order line prices and the ticket's
 * billed total are divided by 100, and any payment on that ticket that is still
 * a large value too. Approved End of Day snapshots are deliberately left as
 * they are: they are immutable by design, and the closed-day reconciliation
 * flags a day whose snapshot no longer matches the ledger.
 *
 * Back up the database before running with --apply.
 */

// The script runs outside the server, so it loads .env itself.
import 'dotenv/config';
import { prisma } from '../src/services/prisma.service';
import {
  findMoneyScaleOrders,
  formatMoneyScaleCandidates,
  repairMoneyScaleOrders,
} from '../src/services/moneyScaleRepair.service';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const apply = hasFlag('--apply');
  const asJson = hasFlag('--json');

  if (asJson && !apply) {
    const candidates = await findMoneyScaleOrders();
    process.stdout.write(`${JSON.stringify(candidates, null, 2)}\n`);
    return;
  }

  if (!apply) {
    const candidates = await findMoneyScaleOrders();
    process.stdout.write(`Money-scale repair — DRY RUN, nothing written\n`);
    process.stdout.write(`${'='.repeat(44)}\n\n`);
    if (candidates.length === 0) {
      process.stdout.write('No ticket reads in the old cents scale. Nothing to repair.\n');
      return;
    }
    process.stdout.write(`${formatMoneyScaleCandidates(candidates)}\n`);
    process.stdout.write(
      `Nothing was written. Re-run with --apply to repair these ${candidates.length} ticket(s).\n`,
    );
    return;
  }

  process.stdout.write('Money-scale repair — APPLYING\n');
  const result = await repairMoneyScaleOrders();

  for (const order of result.orders) {
    process.stdout.write(
      `  repaired #${(order.clientOrderId || order.orderId).slice(-6)} → ${order.totalAmount} ETB\n`,
    );
  }
  process.stdout.write(
    `\nRewrote ${result.repaired} of ${result.inspected} candidate ticket(s) and ` +
      `${result.settlementsRepaired} payment(s). Re-run the dry run to confirm nothing is left.\n`,
  );
}

main()
  .catch((error) => {
    console.error('[repair-money-scale] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
