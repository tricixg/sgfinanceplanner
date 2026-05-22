export const CPF_EMP = 0.2;
export const CPF_ER = 0.17;
export const OW_CEIL = 8000;
export const ALLOC_OA = 0.6217;
export const ALLOC_SA = 0.1621;
export const ALLOC_MA = 0.2162;

export function cpfTotal(w: number): number {
  const ow = Math.min(w, OW_CEIL);
  return ow * (CPF_EMP + CPF_ER);
}

export function cpfEmp(w: number): number {
  return Math.min(w, OW_CEIL) * CPF_EMP;
}

export function cpfOAmonthly(sal: number): number {
  return cpfTotal(sal) * ALLOC_OA;
}
