/**
 * Menu price drift audit — run by hand.
 *
 *   npm run audit:menu-price-drift                       # readable report
 *   npm run audit:menu-price-drift -- --json               # machine-readable
 *   npm run audit:menu-price-drift -- --item "Beef Steak"  # one dish, ticket by ticket
 *
 * Two questions the item-sales pages cannot answer on their own:
 *
 *  1. Which dishes were sold at a price that is not their current menu price,
 *     and by how much that changes what the paid history says they are worth.
 *  2. Why a single dish's revenue figure reads the way it does — each paid
 *     ticket line, its price and quantity, what the ticket was billed, and
 *     whether the ticket's own lines even add up to that.
 *
 * Read-only — it never writes.
 */

// The script runs outside the server, so it loads .env itself (the same file
// `npm run dev` reads) instead of relying on the shell to export DATABASE_URL.
import 'dotenv/config';
import { prisma } from '../src/services/prisma.service';
import {
  auditMenuPriceDrift,
  formatPriceDriftReport,
  formatItemPriceTrace,
  traceItemPrice,
} from '../src/modules/analytics/menuPriceAudit.service';

/**
 * `--item "Beef Steak"` and `--item=Beef Steak` both work; a bare position after
 * `--item` is taken as the name.
 */
function itemArgument(argv: string[]): string | null {
  const flagIndex = argv.findIndex((arg) => arg === '--item');
  if (flagIndex !== -1) {
    const value = argv.slice(flagIndex + 1).join(' ').trim();
    return value || null;
  }
  const inline = argv.find((arg) => arg.startsWith('--item='));
  return inline ? inline.slice('--item='.length).trim() || null : null;
}

async function main() {
  const asJson = process.argv.includes('--json');
  const item = itemArgument(process.argv);

  if (item) {
    const trace = await traceItemPrice(item);
    process.stdout.write(
      asJson ? `${JSON.stringify(trace, null, 2)}\n` : `${formatItemPriceTrace(trace)}\n`,
    );
    return;
  }

  const report = await auditMenuPriceDrift();

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`Menu price drift audit\n${'='.repeat(23)}\n\n`);
    process.stdout.write(`${formatPriceDriftReport(report)}\n`);
  }
}

main()
  .catch((error) => {
    console.error('[audit-menu-price-drift] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
