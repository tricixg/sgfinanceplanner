export type CardStatementRow = {
  id: string;
  creditCardId: string;
  creditCardKey: string;
  cardName: string;
  statementCloseDate: string;
  cycleStartDate: string;
  cycleEndDate: string;
  paymentDueDate: string;
  carriedForwardIn: number;
  actualAmount: number | null;
  minimumDue: number | null;
  trackedAmount: number;
  amountPaid: number;
  interestAccrued: number;
  paidAt: string | null;
  paymentFinancialAccountId: string | null;
  paymentSavingsTransactionId: string | null;
};

export type CardStatementComputed = CardStatementRow & {
  untrackedAmount: number | null;
  outstandingBalance: number;
  isOverdue: boolean;
  isClosed: boolean;
};

export type OpenCycleEstimate = {
  creditCardId: string;
  creditCardKey: string;
  cardName: string;
  statementCloseDate: string;
  cycleStartDate: string;
  cycleEndDate: string;
  carriedForward: number;
  newSpend: number;
  interestEstimate: number;
  estimatedTotal: number;
  daysLeftInCycle: number;
};

export type CardStatementsBundle = {
  configured: boolean;
  statements: CardStatementComputed[];
  openCycles: OpenCycleEstimate[];
};
