export type TravelTripStatus = "planned" | "ongoing" | "completed";

export type TravelTrip = {
  id: string;
  userId: string;
  name: string;
  country: string;
  startDate: string;
  endDate: string;
  status: TravelTripStatus;
  sortOrder: number;
};

export type TravelTripBudget = {
  id: string;
  userId: string;
  tripId: string;
  subCategory: string;
  budgetAmount: number;
  sortOrder: number;
};

export type TravelTripSummary = TravelTrip & {
  budgeted: number;
  spent: number;
};

export type TravelCompanion = {
  id: string;
  userId: string;
  tripId: string;
  name: string;
  sortOrder: number;
};

export type TravelExpenseSplitShare = {
  companionId: string | null;
  shareAmount: number;
};

export type TravelExpenseSplit = {
  paidByCompanionId: string | null;
  shares: TravelExpenseSplitShare[];
};

export type TravelSettlementDirection = "received" | "paid";

export type TravelSettlement = {
  id: string;
  userId: string;
  tripId: string;
  companionId: string;
  direction: TravelSettlementDirection;
  amount: number;
  settledAt: string;
  note: string;
  financialAccountId: string | null;
  savingsTransactionId: string | null;
};

export type CompanionBalanceRow = {
  companionId: string;
  name: string;
  paid: number;
  owesYou: number;
  youOwe: number;
  received: number;
  youPaidThem: number;
  pendingReimbursement: number;
};

export type TravelExpenseRow = {
  id: string;
  amount: number;
  /** Amount counting toward trip budget (your share). */
  budgetAmount: number;
  spentAt: string;
  spentTime: string | null;
  note: string;
  /** User-visible note after the trip subcategory prefix. */
  extraNote: string;
  subCategory: string;
  financialAccountId: string | null;
  split: TravelExpenseSplit | null;
};

export type TravelSplitInput = {
  paidByCompanionId: string | null;
  shares: TravelExpenseSplitShare[];
};
