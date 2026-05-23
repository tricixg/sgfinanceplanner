/** Column header aliases (case-insensitive) → canonical field. */
export const CSV_COLUMN_ALIASES: Record<string, string> = {
  ledger: "ledger",
  category: "category",
  subcategory: "subcategory",
  currency: "currency",
  price: "amount",
  amount: "amount",
  account: "account",
  recorder: "recorder",
  date: "spentAt",
  time: "spentTime",
  tag: "tag",
  note: "note",
  transaction: "transactionType",
  type: "transactionType",
};

export type ParsedBudgetRow = {
  ledger: string;
  category: string;
  subcategory: string;
  currency: string;
  amount: number;
  account: string;
  recorder: string;
  spentAt: string;
  spentTime: string | null;
  tag: string;
  note: string;
  transactionType: "expense" | "subscription" | "income";
};

/** Minimal RFC-style CSV row parser (handles quoted fields). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field.trim());
      field = "";
      continue;
    }
    if (c === "\n" || (c === "\r" && next === "\n")) {
      row.push(field.trim());
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      if (c === "\r") i++;
      continue;
    }
    if (c === "\r") continue;
    field += c;
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

function mapHeaders(headers: string[]): Map<number, string> {
  const map = new Map<number, string>();
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    const canonical = CSV_COLUMN_ALIASES[key];
    if (canonical) map.set(i, canonical);
  });
  return map;
}

function parseAmount(raw: string): number {
  const n = parseFloat(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function normalizeTransactionType(raw: string): ParsedBudgetRow["transactionType"] {
  const t = raw.trim().toLowerCase();
  if (t === "income") return "income";
  if (t === "subscription") return "subscription";
  return "expense";
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeTime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${h.padStart(2, "0")}:${m}:00`;
  }
  return null;
}

export type ParseCsvResult = {
  rows: ParsedBudgetRow[];
  skipped: number;
  errors: string[];
};

export function parseBudgetCsv(text: string): ParseCsvResult {
  const table = parseCsvRows(text);
  const errors: string[] = [];
  if (table.length < 2) {
    return { rows: [], skipped: 0, errors: ["CSV must include a header row and at least one data row"] };
  }

  const colMap = mapHeaders(table[0]);
  if (!colMap.size) {
    return {
      rows: [],
      skipped: table.length - 1,
      errors: ["No recognized columns. Expected headers like Date, Account, Price, Category, Transaction."],
    };
  }

  const rows: ParsedBudgetRow[] = [];
  let skipped = 0;

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const get = (field: string) => {
      for (const [idx, name] of colMap.entries()) {
        if (name === field) return cells[idx] ?? "";
      }
      return "";
    };

    const spentAt = normalizeDate(get("spentAt"));
    const amount = parseAmount(get("amount"));
    if (!spentAt || !Number.isFinite(amount)) {
      skipped++;
      continue;
    }

    rows.push({
      ledger: get("ledger"),
      category: get("category"),
      subcategory: get("subcategory"),
      currency: get("currency") || "SGD",
      amount: Math.abs(amount),
      account: get("account"),
      recorder: get("recorder"),
      spentAt,
      spentTime: normalizeTime(get("spentTime")),
      tag: get("tag"),
      note: get("note"),
      transactionType: normalizeTransactionType(get("transactionType")),
    });
  }

  console.info("[parse-csv] parsed", { rows: rows.length, skipped, errors: errors.length });
  return { rows, skipped, errors };
}
