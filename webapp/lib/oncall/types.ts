export type OncallSettings = {
  dailyRate: number;
  /** Key into CPF_AGE_BANDS, or "custom" when the rates were typed in. */
  cpfAgeBand: string;
  employeeCpfRate: number;
  employerCpfRate: number;
  /** False when salary is already above the CPF Ordinary Wage ceiling. */
  cpfApplies: boolean;
  /** Pre-selected deposit account when recording a payment. */
  defaultAccountId: string | null;
};

/** One on-call stretch; both dates count. */
export type OncallEntry = {
  id: string;
  startDate: string;
  endDate: string;
  /** Rate at the time the stretch was logged — later rate changes don't touch it. */
  dailyRate: number;
  note: string;
};

export type OncallPaymentItem = {
  id: string;
  entryId: string;
  days: number;
};

export type OncallPayment = {
  id: string;
  receivedOn: string;
  /** YYYY-MM of the payslip this payment was on. */
  salaryMonth: string;
  /** Amount credited per the payslip — what counts as income. */
  amount: number;
  /** False for pay already recorded in income before the tracker: no deposit was created. */
  deposited: boolean;
  accountId: string | null;
  incomeCategoryId: string | null;
  /** Null when not deposited, or when the deposit was deleted from transaction history. */
  savingsTransactionId: string | null;
  note: string;
  items: OncallPaymentItem[];
};

export type OncallBundle = {
  settings: OncallSettings;
  entries: OncallEntry[];
  payments: OncallPayment[];
};

export type OncallEntryInput = {
  startDate: string;
  endDate: string;
  dailyRate: number;
  note?: string;
};

export type OncallPaymentInput = {
  receivedOn: string;
  salaryMonth: string;
  amount: number;
  deposited: boolean;
  accountId?: string | null;
  incomeCategoryId?: string | null;
  note?: string;
  items: { entryId: string; days: number }[];
};
