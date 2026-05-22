import { describe, expect, it } from "vitest";
import { cpfEmp, cpfTotal } from "./cpf";

describe("cpf", () => {
  it("computes employee CPF at $6,500 salary", () => {
    expect(cpfEmp(6500)).toBeCloseTo(1300, 0);
  });

  it("computes total CPF at $6,500 (37%)", () => {
    expect(cpfTotal(6500)).toBeCloseTo(2405, 0);
  });

  it("caps ordinary wages at $8,000 ceiling", () => {
    expect(cpfTotal(10000)).toBe(cpfTotal(8000));
  });
});
