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

export type TravelExpenseRow = {
  id: string;
  amount: number;
  spentAt: string;
  spentTime: string | null;
  note: string;
  /** User-visible note after the trip subcategory prefix. */
  extraNote: string;
  subCategory: string;
  financialAccountId: string | null;
};
