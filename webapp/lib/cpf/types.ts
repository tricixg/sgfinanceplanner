/** A logged monthly CPF contribution (OA/SA/MA split) — shown on CPF Outlook and used to drive the contribution-based projection. */
export type CpfContribution = {
  id: string;
  month: string;
  oa: number;
  sa: number;
  ma: number;
  note: string;
  createdAt: string;
};
