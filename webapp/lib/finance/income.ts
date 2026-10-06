import type { DashboardState } from "@/lib/types";
import { cpfEmp } from "./cpf";

/** Comms is tracked as an irregular benefit claim now, not guaranteed baseline pay. */
export function stableTakeHome(S: DashboardState): number {
  return S.monthlySal - cpfEmp(S.monthlySal);
}
