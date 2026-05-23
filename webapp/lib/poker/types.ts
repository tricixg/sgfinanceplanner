export type PokerSession = {
  id: string;
  userId: string;
  playedAt: string;
  buyIn: number;
  cashOut: number;
  venue: string;
  hours: number | null;
  note: string;
  financialAccountId: string | null;
  savingsTransactionId: string | null;
  createdAt: string;
};

export function pokerProfit(session: Pick<PokerSession, "buyIn" | "cashOut">): number {
  return session.cashOut - session.buyIn;
}
