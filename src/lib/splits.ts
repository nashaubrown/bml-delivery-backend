// Split-resolution and balance-minimization helpers.
// All inputs and outputs are integer cents in the trip's base currency.

export type SplitInput =
  | { type: "EQUAL"; participants: string[] }
  | { type: "UNEQUAL"; entries: { userId: string; amountCents: number }[] }
  | { type: "SHARES"; entries: { userId: string; shares: number }[] }
  | { type: "PERCENT"; entries: { userId: string; percent: number }[] };

export type ResolvedSplit = {
  userId: string;
  baseAmountCents: number;
  shares?: number;
  percent?: number;
};

// Distribute a remainder of cents across resolved splits so the sum matches `total` exactly.
function reconcile(splits: ResolvedSplit[], total: number): ResolvedSplit[] {
  const sum = splits.reduce((s, x) => s + x.baseAmountCents, 0);
  let diff = total - sum;
  if (diff === 0 || splits.length === 0) return splits;
  const step = diff > 0 ? 1 : -1;
  let i = 0;
  while (diff !== 0) {
    splits[i % splits.length].baseAmountCents += step;
    diff -= step;
    i++;
  }
  return splits;
}

export function resolveSplit(
  totalBaseCents: number,
  split: SplitInput
): ResolvedSplit[] {
  switch (split.type) {
    case "EQUAL": {
      const n = split.participants.length;
      if (n === 0) throw new Error("EQUAL split needs at least one participant");
      const each = Math.floor(totalBaseCents / n);
      const splits = split.participants.map((userId) => ({
        userId,
        baseAmountCents: each,
      }));
      return reconcile(splits, totalBaseCents);
    }
    case "UNEQUAL": {
      const sum = split.entries.reduce((s, e) => s + e.amountCents, 0);
      if (sum !== totalBaseCents) {
        throw new Error(
          `UNEQUAL split entries must sum to total (${sum} vs ${totalBaseCents})`
        );
      }
      return split.entries.map((e) => ({
        userId: e.userId,
        baseAmountCents: e.amountCents,
      }));
    }
    case "SHARES": {
      const totalShares = split.entries.reduce((s, e) => s + e.shares, 0);
      if (totalShares <= 0) throw new Error("SHARES split needs positive shares");
      const splits = split.entries.map((e) => ({
        userId: e.userId,
        baseAmountCents: Math.floor(
          (totalBaseCents * e.shares) / totalShares
        ),
        shares: e.shares,
      }));
      return reconcile(splits, totalBaseCents);
    }
    case "PERCENT": {
      const totalPct = split.entries.reduce((s, e) => s + e.percent, 0);
      if (Math.abs(totalPct - 100) > 0.001) {
        throw new Error(`PERCENT split must sum to 100, got ${totalPct}`);
      }
      const splits = split.entries.map((e) => ({
        userId: e.userId,
        baseAmountCents: Math.floor((totalBaseCents * e.percent) / 100),
        percent: e.percent,
      }));
      return reconcile(splits, totalBaseCents);
    }
  }
}

export type Balance = { userId: string; netCents: number };

// Minimize transactions: pair largest creditor with largest debtor until cleared.
export type Transfer = { fromUserId: string; toUserId: string; amountCents: number };

export function minimizeTransfers(balances: Balance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.netCents - a.netCents);
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.netCents - b.netCents);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(-debtor.netCents, creditor.netCents);
    if (amount > 0) {
      transfers.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountCents: amount,
      });
      debtor.netCents += amount;
      creditor.netCents -= amount;
    }
    if (debtor.netCents === 0) i++;
    if (creditor.netCents === 0) j++;
  }
  return transfers;
}
