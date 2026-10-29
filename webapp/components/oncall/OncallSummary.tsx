"use client";

import { fmt2 } from "@/lib/finance/helpers";
import type { OncallScope, OncallSummary as Summary } from "@/lib/oncall/calc";
import { plural } from "@/lib/oncall/format";

type Props = {
  summary: Summary;
  scope: OncallScope;
  year: number;
  onScope: (scope: OncallScope) => void;
};

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

export function OncallSummary({ summary, scope, year, onScope }: Props) {
  const { earned, owed } = summary;
  const ytd = scope === "ytd";
  // Employer CPF is paid on top of gross, so the bar is out of gross + employer CPF.
  const whole = earned.gross + earned.employerCpf;

  return (
    <section className="oncall-section">
      <div className="oncall-sec-head">
        <h2>Summary</h2>
        <div className="oncall-seg" role="group" aria-label="Summary period">
          <button type="button" aria-pressed={ytd} onClick={() => onScope("ytd")}>
            YTD {year}
          </button>
          <button type="button" aria-pressed={!ytd} onClick={() => onScope("lifetime")}>
            Lifetime
          </button>
        </div>
      </div>
      <div className="grid g3">
        <div className="stat accent">
          <div className="lbl">Additional take-home earned</div>
          <div className="val">{fmt2(earned.takeHome)}</div>
          <div className="note">
            {fmt2(earned.gross)} gross · {ytd ? `on call in ${year}` : "all entries"}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Received into income</div>
          <div className="val">{fmt2(summary.received)}</div>
          <div className="note">
            {plural(summary.receivedCount, "payment")}
            {ytd ? ` for ${year} salary months` : " in total"}
            {summary.receivedWithoutDeposit > 0
              ? ` · ${fmt2(summary.receivedWithoutDeposit)} was already deposited`
              : ""}
          </div>
        </div>
        <div className="stat oncall-owed">
          <div className="lbl">Awaiting payment</div>
          <div className="val">{fmt2(owed.takeHome)}</div>
          <div className="note">
            {owed.days
              ? `${plural(owed.days, "day")} across ${plural(summary.owedStretches, "stretch", "stretches")}, all time`
              : "Everything logged has been paid"}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Days on call</div>
          <div className="val">{earned.days}</div>
          <div className="note">
            {plural(summary.stretches, "stretch", "stretches")}
            {earned.days ? ` · ${(earned.days / 7).toFixed(1)} weeks` : ""}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Employee CPF</div>
          <div className="val">{fmt2(earned.employeeCpf)}</div>
          <div className="note">Deducted from gross</div>
        </div>
        <div className="stat">
          <div className="lbl">Employer CPF</div>
          <div className="val">{fmt2(earned.employerCpf)}</div>
          <div className="note">{fmt2(earned.employeeCpf + earned.employerCpf)} total into CPF</div>
        </div>
      </div>
      <div className="oncall-split">
        <div className="oncall-bar" aria-hidden="true">
          <i className="k-take" style={{ width: whole ? `${(earned.takeHome / whole) * 100}%` : 0 }} />
          <i className="k-ee" style={{ width: whole ? `${(earned.employeeCpf / whole) * 100}%` : 0 }} />
          <i className="k-er" style={{ width: whole ? `${(earned.employerCpf / whole) * 100}%` : 0 }} />
        </div>
        <div className="oncall-legend">
          <span><i className="k-take" />Take-home <b>{pct(earned.takeHome, whole)}</b></span>
          <span><i className="k-ee" />Employee CPF <b>{pct(earned.employeeCpf, whole)}</b></span>
          <span><i className="k-er" />Employer CPF <b>{pct(earned.employerCpf, whole)}</b></span>
        </div>
      </div>
    </section>
  );
}
