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
          Date of birth not set, so the “under 35” CPF rates are assumed.{" "}
          <Link href="/me">Set it in Me</Link> for age-based rates.{" "}
        </>
      ) : (
        <>
          CPF rates for age {age} ({band.label}): you pay {pct(band.employee)}, employer{" "}
          {pct(band.employer)}; credited OA {pct(a.oa)} / {band.maxAge > 55 ? "RA" : "SA"}{" "}
          {pct(a.sa)} / MA {pct(a.ma)}. Rates step up the month after each birthday band.{" "}
        </>
      )}
      Interest: OA 2.5% and SA/MA/RA 4% a year, worked out monthly on the lowest balance and
      credited once a year in December (no compounding inside the year), plus 1% extra on the
      first $60,000 of combined balances (OA counts up to $20,000) paid into SA/RA, and a further
      1% on the first $30,000 from age 55. A contribution earns from the month after it is made,
      and interest already earned earlier this year is not included in today’s balance. Based on
      CPF Board’s 2026 rates; age {CPF_MAX_MODELLED_AGE} and over uses the 60–64 row, the
      1 Jan 2027 increase for ages 55–65 is not modelled, and the $8,000 monthly wage ceiling
      applies. Bonuses (additional wages) and income tax are not modelled.
    </div>
  );
}
