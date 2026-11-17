import Link from "next/link";
import type { DashboardState } from "@/lib/types";
import { cpfAgeForMonth, cpfBandForAge, CPF_MAX_MODELLED_AGE } from "@/lib/finance/cpf";
import { currentYm } from "@/lib/finance/helpers";

const pct = (n: number, dp = 1) => `${(n * 100).toFixed(dp).replace(/\.0$/, "")}%`;

/** What the CPF figures on this page assume. Shown on the CPF and Year pages. */
export function CpfAssumptions({ state: S }: { state: Pick<DashboardState, "dateOfBirth"> }) {
  const age = cpfAgeForMonth(S.dateOfBirth, currentYm());
  const band = cpfBandForAge(age);
  const a = band.allocation;
  return (
    <div className="callout tip">
      <span className="ico">Assumptions</span>
      {age == null ? (
        <>
          Date of birth not set, so the “35 and below” CPF rates are assumed.{" "}
          <Link href="/me">Set it in Me</Link> for age-based rates.{" "}
        </>
      ) : (
        <>
          CPF rates for age {age} ({band.label}): you pay {pct(band.employee)}, employer{" "}
          {pct(band.employer)}; credited OA {pct(a.oa)} / {band.maxAge > 55 ? "RA" : "SA"}{" "}
          {pct(a.sa)} / MA {pct(a.ma)}. Rates step up the month after each birthday band.{" "}
        </>
      )}
      Based on CPF Board’s 2026 rates; ages above {CPF_MAX_MODELLED_AGE} use the 60–65 row, the
      1 Jan 2027 increase for ages 55–65 is not modelled, and the $8,000 monthly wage ceiling
      applies. Bonuses (additional wages) and income tax are not modelled.
    </div>
  );
}
