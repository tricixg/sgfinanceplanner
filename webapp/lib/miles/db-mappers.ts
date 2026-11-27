import { monthFromYmd } from "@/lib/miles/months";
import { isCardProgram, isMilesProgram } from "@/lib/miles/programs";
import type { MilesActivity, MilesLot, MilesLotSource } from "@/lib/miles/types";

const SOURCES: MilesLotSource[] = ["earned", "balance_update", "conversion"];

export function mapMilesLot(row: Record<string, unknown>): MilesLot {
  const program = isMilesProgram(row.program) ? row.program : "krisflyer";
  const source = SOURCES.includes(row.source as MilesLotSource) ? (row.source as MilesLotSource) : "earned";
  return {
    id: String(row.id),
    program,
    earnedMonth: monthFromYmd(row.earned_month as string | null),
    expiryMonth: monthFromYmd(row.expiry_month as string | null),
    amount: Number(row.amount ?? 0),
    used: Number(row.used ?? 0),
    source,
    convertedFrom: isCardProgram(row.converted_from) ? row.converted_from : null,
    note: String(row.note ?? ""),
    loggedOn: row.logged_on ? String(row.logged_on).slice(0, 10) : null,
  };
}

export function mapMilesActivity(row: Record<string, unknown>): MilesActivity {
  return {
    id: String(row.id),
    kind: row.kind === "redeem" ? "redeem" : "convert",
    program: isMilesProgram(row.program) ? row.program : "krisflyer",
    month: monthFromYmd(row.activity_month as string) ?? 0,
    amount: Number(row.amount ?? 0),
    miles: Number(row.miles ?? 0),
    fee: Number(row.fee ?? 0),
    description: String(row.description ?? ""),
    createdLotId: row.created_lot_id ? String(row.created_lot_id) : null,
    createdAt: String(row.created_at ?? ""),
  };
}
