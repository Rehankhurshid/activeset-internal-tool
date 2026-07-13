/**
 * Formats an amount as a localized currency string. Falls back to a plain
 * `CODE 0.00` rendering if the currency code isn't recognized by Intl, and to
 * an em dash when the amount is missing. Shared by the tasks and invoices UIs.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  const code = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}
