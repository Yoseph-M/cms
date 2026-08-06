/**
 * Centralized currency formatting for CafeFlow.
 * Renders as: "1,234.50 ETB"
 */
export function formatCurrency(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${formatted} ETB`;
}
