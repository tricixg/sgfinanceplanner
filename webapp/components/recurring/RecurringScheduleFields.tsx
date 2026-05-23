"use client";

import { formatDeductionDayLabel } from "@/lib/recurring/prefill";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";

type Props = {
  deductionDay?: number;
  defaultFinancialAccountId?: string;
  onDeductionDayChange: (day: number | undefined) => void;
  onAccountChange: (accountId: string | undefined) => void;
  /** Inline layout for editrow grids */
  inline?: boolean;
};

export function RecurringScheduleFields({
  deductionDay,
  defaultFinancialAccountId,
  onDeductionDayChange,
  onAccountChange,
  inline = false,
}: Props) {
  const { accounts } = useFinancialAccounts();

  const dueSelect = (
    <select
      value={deductionDay ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onDeductionDayChange(v ? Number(v) : undefined);
      }}
      aria-label="Due day of month"
      title="Day of month this charge typically hits"
    >
      <option value="">Due day</option>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
        <option key={d} value={d}>
          {formatDeductionDayLabel(d)}
        </option>
      ))}
    </select>
  );

  const accountSelect = (
    <select
      value={defaultFinancialAccountId ?? ""}
      onChange={(e) => onAccountChange(e.target.value || undefined)}
      aria-label="Default pay-from account"
    >
      <option value="">Pay from…</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );

  if (inline) {
    return (
      <>
        {dueSelect}
        {accountSelect}
      </>
    );
  }

  return (
    <div className="recurring-schedule-fields">
      <label>
        Due day
        {dueSelect}
      </label>
      <label>
        Pay from
        {accountSelect}
      </label>
    </div>
  );
}
