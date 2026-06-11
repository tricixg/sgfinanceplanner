import type {
  CompanionBalanceRow,
  TravelCompanion,
  TravelExpenseRow,
  TravelSettlement,
} from "@/lib/travel/types";

export type BalanceExpenseInput = Pick<
  TravelExpenseRow,
  "id" | "amount" | "split"
>;

export function buildCompanionBalances(
  companions: TravelCompanion[],
  expenses: BalanceExpenseInput[],
  settlements: TravelSettlement[]
): CompanionBalanceRow[] {
  const byId = new Map(companions.map((c) => [c.id, c.name]));

  const paid = new Map<string, number>();
  const owesYou = new Map<string, number>();
  const youOwe = new Map<string, number>();
  const received = new Map<string, number>();
  const youPaidThem = new Map<string, number>();

  for (const c of companions) {
    paid.set(c.id, 0);
    owesYou.set(c.id, 0);
    youOwe.set(c.id, 0);
    received.set(c.id, 0);
    youPaidThem.set(c.id, 0);
  }

  for (const exp of expenses) {
    const split = exp.split;
    if (!split) continue;

    const payerId = split.paidByCompanionId;
    const myShare = split.shares.find((s) => s.companionId == null)?.shareAmount ?? 0;

    if (payerId) {
      paid.set(payerId, (paid.get(payerId) ?? 0) + exp.amount);
      youOwe.set(payerId, (youOwe.get(payerId) ?? 0) + myShare);
    } else {
      for (const share of split.shares) {
        if (!share.companionId) continue;
        owesYou.set(
          share.companionId,
          (owesYou.get(share.companionId) ?? 0) + share.shareAmount
        );
      }
    }
  }

  for (const s of settlements) {
    if (s.direction === "received") {
      received.set(s.companionId, (received.get(s.companionId) ?? 0) + s.amount);
    } else {
      youPaidThem.set(s.companionId, (youPaidThem.get(s.companionId) ?? 0) + s.amount);
    }
  }

  return companions.map((c) => {
    const p = paid.get(c.id) ?? 0;
    const oy = owesYou.get(c.id) ?? 0;
    const yo = youOwe.get(c.id) ?? 0;
    const r = received.get(c.id) ?? 0;
    const ypt = youPaidThem.get(c.id) ?? 0;
    const pendingReimbursement = oy - r - (yo - ypt);

    return {
      companionId: c.id,
      name: byId.get(c.id) ?? c.name,
      paid: p,
      owesYou: oy,
      youOwe: yo,
      received: r,
      youPaidThem: ypt,
      pendingReimbursement,
    };
  });
}

export function totalPendingReimbursement(rows: CompanionBalanceRow[]): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.pendingReimbursement), 0);
}
