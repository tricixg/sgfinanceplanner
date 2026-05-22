import type { DashboardState } from "@/lib/types";
import { cpfEmp } from "./cpf";

export function stableTakeHome(S: DashboardState): number {
  return S.monthlySal - cpfEmp(S.monthlySal) + S.comms;
}
