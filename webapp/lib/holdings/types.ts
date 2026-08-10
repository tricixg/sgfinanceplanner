/** Dividend payout recorded against a stock holding — realized P&L, shown on the Investment tab. */
export type HoldingDividend = {
  id: string;
  userId: string;
  holdingId: string;
  /** Dividend per share as entered by the user (SGD). */
  perShare: number;
  /** Qty held at the time the dividend was recorded — used to compute `amount`. */
  qty: number;
  /** perShare * qty, computed and stored at record time. */
  amount: number;
  occurredAt: string;
  note: string;
  createdAt: string;
};
