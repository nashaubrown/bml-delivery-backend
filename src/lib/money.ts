// Currency helpers. We always store integer cents to avoid float drift.

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(fromCents(cents));
  } catch {
    return `${currency} ${fromCents(cents).toFixed(2)}`;
  }
}
