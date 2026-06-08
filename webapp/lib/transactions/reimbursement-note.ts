import { fmt2 } from "@/lib/finance/helpers";
import { formatTransactionWhen } from "@/lib/savings/format-transaction-when";

export type ReimbursementSourceMeta = {
  id: string;
  amount: number;
  note: string;
  /** Parseable ISO instant for SGT display */
  whenIso: string;
};

const NOTE_MAX = 80;

function idTail(id: string): string {
  const compact = id.replace(/-/g, "");
  return compact.slice(-4).toLowerCase() || id.slice(-4);
}

function clipNote(note: string): string {
  const trimmed = note.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= NOTE_MAX) return trimmed;
  return `${trimmed.slice(0, NOTE_MAX - 1)}…`;
}

/** Human-readable reimbursement note for transaction history. */
export function formatReimbursementNote(source: ReimbursementSourceMeta): string {
  const tail = idTail(source.id);
  const amount = fmt2(Math.abs(source.amount));
  const note = clipNote(source.note);
  const when = formatTransactionWhen(source.whenIso);
  return `Reimb · ${tail} · $${amount} · ${note} · ${when}`;
}
