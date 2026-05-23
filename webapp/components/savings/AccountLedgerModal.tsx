"use client";

import type { UserSavingsAccount } from "@/lib/savings/types";
import {
  SavingsLedgerModal,
  type LedgerKind,
  type GoalOption,
} from "@/components/savings/SavingsLedgerModal";

type Props = {
  account: UserSavingsAccount;
  onClose: () => void;
  goalOptions?: GoalOption[];
  onRecord: (payload: {
    amount: number;
    occurredAt?: string;
    kind: LedgerKind;
    note?: string;
    goalId?: string;
    incomeCategoryId?: string;
  }) => Promise<void>;
  txRefresh: number;
};

/** @deprecated Prefer SavingsLedgerModal — kept for TabMe import stability. */
export function AccountLedgerModal({
  account,
  onClose,
  onRecord,
  txRefresh,
  goalOptions,
}: Props) {
  return (
    <SavingsLedgerModal
      target={{ variant: "account", account }}
      onClose={onClose}
      onRecord={onRecord}
      txRefresh={txRefresh}
      goalOptions={goalOptions}
    />
  );
}
