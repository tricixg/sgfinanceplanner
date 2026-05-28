import type { CreditCard, DashboardState, Loan } from "@/lib/types";
import type { OtherLoan } from "@/lib/other-loans/types";
import { sgtTodayYmd } from "@/lib/time/sgt";
import { currentYm, monIdx } from "./helpers";

export type CardStatementBreakdown = {
  cardId: string;
  cardName: string;
  statementAmount: number;
  /** Instalment/plan slice attributed on this statement. */
  instalmentOnStatement: number;
  revolvingSpend: number;
  /** Whether outstanding was included for this card's calculation. */
  includesOutstanding: boolean;
  loans: { name: string; out: number; monthly: number }[];
};

function loanChargeOnStatement(
  loan: Loan,
  includeOutstanding: boolean
): number {
  if (includeOutstanding) {
    return loan.monthly + loan.out;
  }
  return loan.monthly;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** Assign stable ids to credit cards (catalog id preferred). */
export function ensureCreditCardIds(cards: CreditCard[]): CreditCard[] {
  const used = new Set<string>();
  return cards.map((card, index) => {
    if (card.id && !used.has(card.id)) {
      used.add(card.id);
      return card;
    }
    const base = card.catalogId ?? `card-${slugify(card.name || "card")}-${index}`;
    let id = base;
    let n = 2;
    while (used.has(id)) {
      id = `${base}-${n++}`;
    }
    used.add(id);
    if (card.id === id) return card;
    console.log("[card-linking] assigned card id", { name: card.name, id });
    return { ...card, id };
  });
}

function cardMatchesLegacyLabel(card: CreditCard, label: string): boolean {
  const norm = label.trim().toLowerCase();
  if (!norm || norm === "—") return false;

  const name = card.name.toLowerCase();
  const bank = (card.bank ?? "").toLowerCase();

  if (name.includes(norm) || norm.includes(name)) return true;
  if (bank && (bank === norm || norm.includes(bank) || bank.includes(norm))) {
    return true;
  }

  if (card.catalogId === "dbs-altitude-visa") {
    return norm.includes("altitude");
  }
  if (card.catalogId === "maribank-card") {
    return norm.includes("maribank") || norm === "mari";
  }
  if (card.catalogId === "dbs-ww-mastercard") {
    return (
      norm.includes("ww") ||
      norm.includes("woman") ||
      norm.includes("world mastercard")
    );
  }

  return false;
}

export function resolveCardIdForLabel(
  label: string,
  cards: CreditCard[]
): string | undefined {
  const match = cards.find((c) => cardMatchesLegacyLabel(c, label));
  return match?.id;
}

export function creditCardLabel(
  cards: CreditCard[],
  cardId: string | undefined
): string {
  if (!cardId) return "—";
  return cards.find((c) => c.id === cardId)?.name ?? "—";
}

/** Map legacy free-text loan.card labels to creditCard ids. */
export function migrateLoanCardLinks(
  loans: Loan[],
  cards: CreditCard[]
): Loan[] {
  const withIds = ensureCreditCardIds(cards);
  return loans.map((loan) => {
    if (loan.cardId && withIds.some((c) => c.id === loan.cardId)) {
      const label = creditCardLabel(withIds, loan.cardId);
      if (loan.card === label) return loan;
      return { ...loan, card: label };
    }

    const fromLabel = loan.card
      ? resolveCardIdForLabel(loan.card, withIds)
      : undefined;
    const cardId = fromLabel ?? loan.cardId;
    if (!cardId) return loan;

    const label = creditCardLabel(withIds, cardId);
    if (loan.cardId === cardId && loan.card === label) return loan;
    console.log("[card-linking] mapped loan to card", {
      loan: loan.name,
      cardId,
      label,
    });
    return { ...loan, cardId, card: label };
  });
}

function activeBalanceTransferOnCard(
  otherLoans: OtherLoan[] | undefined,
  cardId: string
): boolean {
  const today = sgtTodayYmd();
  return (otherLoans ?? []).some(
    (l) =>
      l.loanType === "balance_transfer" &&
      l.sourceCreditCardId === cardId &&
      !l.paidAt &&
      l.outstanding > 0 &&
      (!l.dueDate || today <= l.dueDate)
  );
}

function suggestIncludeOutstanding(
  card: CreditCard,
  loans: Loan[],
  otherLoans?: OtherLoan[]
): boolean {
  if (!card.id) return false;
  if (activeBalanceTransferOnCard(otherLoans, card.id)) return true;
  return loansForCard(loans, card.id).some((l) => l.monthly === 0 && l.out > 0);
}

export function migrateCardLoanLinks(
  state: Pick<DashboardState, "creditCards" | "loans" | "otherLoans">
) {
  const loans = migrateLoanCardLinks(state.loans, ensureCreditCardIds(state.creditCards));
  const creditCards = ensureCreditCardIds(state.creditCards).map((card) => {
    if (card.includeOutstandingOnStatement) return card;
    if (!suggestIncludeOutstanding(card, loans, state.otherLoans)) return card;
    console.log("[card-linking] auto-enabled include outstanding", card.name);
    return { ...card, includeOutstandingOnStatement: true };
  });
  return { creditCards, loans };
}

function isActiveLoan(loan: Loan, nowYm: string): boolean {
  return monIdx(loan.end) >= monIdx(nowYm);
}

export function loansForCard(
  loans: Loan[],
  cardId: string,
  nowYm?: string
): Loan[] {
  const ym = nowYm ?? currentYm();
  return loans.filter((l) => l.cardId === cardId && isActiveLoan(l, ym));
}

export function getCardStatementBreakdown(
  card: CreditCard,
  loans: Loan[],
  nowYm?: string
): CardStatementBreakdown | null {
  if (!card.id) return null;
  const ym = nowYm ?? currentYm();
  const linked = loansForCard(loans, card.id, ym);
  const includesOutstanding = Boolean(card.includeOutstandingOnStatement);
  const instalmentOnStatement = linked.reduce(
    (s, l) => s + loanChargeOnStatement(l, includesOutstanding),
    0
  );
  const revolvingSpend = Math.max(0, card.statementAmount - instalmentOnStatement);

  return {
    cardId: card.id,
    cardName: card.name,
    statementAmount: card.statementAmount,
    instalmentOnStatement,
    revolvingSpend,
    includesOutstanding,
    loans: linked.map((l) => ({
      name: l.name,
      out: l.out,
      monthly: l.monthly,
    })),
  };
}

export function getAllCardStatementBreakdowns(
  state: Pick<DashboardState, "creditCards" | "loans">,
  nowYm?: string
): CardStatementBreakdown[] {
  const cards = ensureCreditCardIds(state.creditCards);
  return cards
    .map((card) => getCardStatementBreakdown(card, state.loans, nowYm))
    .filter((b): b is CardStatementBreakdown => b !== null)
    .filter(
      (b) => b.statementAmount > 0 || b.instalmentOnStatement > 0 || b.loans.length > 0
    );
}

export function totalInstalmentOnStatements(
  breakdowns: CardStatementBreakdown[]
): number {
  return breakdowns.reduce((s, b) => s + b.instalmentOnStatement, 0);
}

export function totalRevolvingOnStatements(
  breakdowns: CardStatementBreakdown[]
): number {
  return breakdowns.reduce((s, b) => s + b.revolvingSpend, 0);
}
