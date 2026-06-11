import { parseCsvRows } from "@/lib/budget/parse-csv";
import { isSupportedCurrency, normalizeCurrencyCode } from "@/lib/fx/currencies";
import {
  POKER_IMPORT_HEADERS,
  POKER_IMPORT_MAX_ROWS,
  type PokerImportHeader,
} from "@/lib/poker/import-template";
import { parsePokerPlayedAtInput } from "@/lib/poker/played-at";
import type { PokerSessionType, TournamentResult } from "@/lib/poker/types";

export const POKER_IMPORT_MAX_FIELD_LEN = 500;
export const POKER_IMPORT_MAX_NOTE_LEN = 2000;
export const POKER_IMPORT_MAX_AMOUNT = 10_000_000;

const HEADER_ALIASES: Record<string, PokerImportHeader> = Object.fromEntries(
  POKER_IMPORT_HEADERS.map((h) => [h.toLowerCase().replace(/\s+/g, ""), h])
) as Record<string, PokerImportHeader>;

const REQUIRED_HEADERS: PokerImportHeader[] = ["SessionType", "BuyIn", "PlayedAt"];

export type ParsedPokerCsvRow = {
  rowNumber: number;
  sessionType: PokerSessionType;
  playedAt: string;
  location: string;
  buyIn: number;
  cashOut: number;
  currency: string;
  fxRateToSgd: number | null;
  fxRateManual: boolean;
  hours: number | null;
  note: string;
  gameName: string;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  tournamentName: string;
  eventName: string;
  tournamentResult: TournamentResult | null;
  amountWon: number | null;
  rebuyAmount: number;
  bountyAmount: number;
  tournamentPlace: number | null;
  tournamentEntries: number | null;
  account: string;
};

export type ParsePokerCsvResult = {
  rows: ParsedPokerCsvRow[];
  errors: { row: number; message: string }[];
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

function mapHeaders(headers: string[]): Map<number, PokerImportHeader> {
  const map = new Map<number, PokerImportHeader>();
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    const canonical = HEADER_ALIASES[key];
    if (canonical) map.set(i, canonical);
  });
  return map;
}

/** Strip CSV formula-injection prefixes from string cells. */
export function sanitizeCsvCell(raw: string): string {
  let s = raw.trim();
  while (/^[=+\-@]/.test(s)) {
    s = s.slice(1).trimStart();
  }
  return s;
}

function parseAmount(raw: string): number | null {
  const s = sanitizeCsvCell(raw).replace(/,/g, "");
  if (!s) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > POKER_IMPORT_MAX_AMOUNT) return null;
  return n;
}

function parseOptionalInt(raw: string): number | null {
  const s = sanitizeCsvCell(raw);
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function clampText(raw: string, maxLen: number): string {
  const s = sanitizeCsvCell(raw);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function parseBool(raw: string): boolean {
  const s = sanitizeCsvCell(raw).toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function isRowEmpty(cells: string[]): boolean {
  return cells.every((c) => !sanitizeCsvCell(c));
}

export function parsePokerCsv(text: string): ParsePokerCsvResult {
  const table = parseCsvRows(text);
  const errors: { row: number; message: string }[] = [];
  const rows: ParsedPokerCsvRow[] = [];

  if (table.length < 2) {
    return {
      rows: [],
      errors: [{ row: 0, message: "CSV must include a header row and at least one data row" }],
    };
  }

  const colMap = mapHeaders(table[0]);
  const presentHeaders = new Set(colMap.values());
  for (const required of REQUIRED_HEADERS) {
    if (!presentHeaders.has(required)) {
      errors.push({ row: 1, message: `Missing required column: ${required}` });
    }
  }
  if (errors.length > 0) {
    return { rows: [], errors };
  }

  let dataRowCount = 0;
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (isRowEmpty(cells)) continue;
    dataRowCount++;
  }

  if (dataRowCount === 0) {
    return {
      rows: [],
      errors: [{ row: 0, message: "CSV has no data rows" }],
    };
  }

  if (dataRowCount > POKER_IMPORT_MAX_ROWS) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message: `Too many rows (${dataRowCount}). Maximum is ${POKER_IMPORT_MAX_ROWS}.`,
        },
      ],
    };
  }

  const get = (cells: string[], field: PokerImportHeader) => {
    for (const [idx, name] of colMap.entries()) {
      if (name === field) return cells[idx] ?? "";
    }
    return "";
  };

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const rowNumber = r + 1;
    if (isRowEmpty(cells)) continue;

    const sessionTypeRaw = sanitizeCsvCell(get(cells, "SessionType")).toLowerCase();
    let sessionType: PokerSessionType;
    if (sessionTypeRaw === "tournament") {
      sessionType = "tournament";
    } else if (sessionTypeRaw === "cash_game" || sessionTypeRaw === "cashgame") {
      sessionType = "cash_game";
    } else {
      errors.push({
        row: rowNumber,
        message: `Invalid SessionType "${sessionTypeRaw}" — use cash_game or tournament`,
      });
      continue;
    }

    const playedAtRaw = sanitizeCsvCell(get(cells, "PlayedAt"));
    if (!playedAtRaw) {
      errors.push({ row: rowNumber, message: "PlayedAt is required" });
      continue;
    }
    const playedAt = parsePokerPlayedAtInput(playedAtRaw);

    const buyIn = parseAmount(get(cells, "BuyIn"));
    if (buyIn == null) {
      errors.push({ row: rowNumber, message: "Valid BuyIn is required" });
      continue;
    }

    const currency = normalizeCurrencyCode(sanitizeCsvCell(get(cells, "Currency")) || "SGD");
    if (!isSupportedCurrency(currency)) {
      errors.push({ row: rowNumber, message: `Unsupported currency: ${currency}` });
      continue;
    }

    const fxRateManual = parseBool(get(cells, "FxRateManual"));
    const fxRateRaw = sanitizeCsvCell(get(cells, "FxRateToSgd"));
    let fxRateToSgd: number | null = null;
    if (fxRateRaw) {
      const rate = parseFloat(fxRateRaw.replace(/,/g, ""));
      if (!Number.isFinite(rate) || rate <= 0) {
        errors.push({ row: rowNumber, message: "Invalid FxRateToSgd" });
        continue;
      }
      fxRateToSgd = rate;
    }
    if (fxRateManual && fxRateToSgd == null) {
      errors.push({
        row: rowNumber,
        message: "FxRateToSgd is required when FxRateManual is true",
      });
      continue;
    }

    const hoursRaw = sanitizeCsvCell(get(cells, "Hours"));
    let hours: number | null = null;
    if (hoursRaw) {
      const h = parseFloat(hoursRaw);
      if (!Number.isFinite(h) || h < 0 || h > 999) {
        errors.push({ row: rowNumber, message: "Invalid Hours" });
        continue;
      }
      hours = h;
    }

    const location = clampText(get(cells, "Location"), POKER_IMPORT_MAX_FIELD_LEN);
    const note = clampText(get(cells, "Note"), POKER_IMPORT_MAX_NOTE_LEN);
    const account = clampText(get(cells, "Account"), POKER_IMPORT_MAX_FIELD_LEN);

    let cashOut = 0;
    let gameName = "";
    let smallBlind: number | null = null;
    let bigBlind: number | null = null;
    let ante: number | null = null;
    let tournamentName = "";
    let eventName = "";
    let tournamentResult: TournamentResult | null = null;
    let amountWon: number | null = null;
    let rebuyAmount = 0;
    let bountyAmount = 0;
    let tournamentPlace: number | null = null;
    let tournamentEntries: number | null = null;

    if (sessionType === "cash_game") {
      const out = parseAmount(get(cells, "CashOut"));
      if (out == null) {
        errors.push({ row: rowNumber, message: "Valid CashOut is required for cash games" });
        continue;
      }
      cashOut = out;

      gameName = clampText(get(cells, "GameName"), POKER_IMPORT_MAX_FIELD_LEN);
      const sb = parseAmount(get(cells, "SmallBlind"));
      const bb = parseAmount(get(cells, "BigBlind"));
      if (!gameName || sb == null || bb == null) {
        errors.push({
          row: rowNumber,
          message: "Cash games require GameName, SmallBlind, and BigBlind",
        });
        continue;
      }
      smallBlind = sb;
      bigBlind = bb;
      const anteRaw = sanitizeCsvCell(get(cells, "Ante"));
      if (anteRaw) {
        const a = parseAmount(anteRaw);
        if (a == null) {
          errors.push({ row: rowNumber, message: "Invalid Ante" });
          continue;
        }
        ante = a;
      }
    } else {
      const cashOutCell = sanitizeCsvCell(get(cells, "CashOut"));
      if (cashOutCell) {
        errors.push({
          row: rowNumber,
          message:
            "CashOut is for cash games only — leave it empty for tournaments and use AmountWon instead",
        });
        continue;
      }

      tournamentName = clampText(get(cells, "TournamentName"), POKER_IMPORT_MAX_FIELD_LEN);
      eventName = clampText(get(cells, "EventName"), POKER_IMPORT_MAX_FIELD_LEN);
      if (!tournamentName || !eventName) {
        errors.push({
          row: rowNumber,
          message: "Tournaments require TournamentName and EventName",
        });
        continue;
      }

      const resultRaw = sanitizeCsvCell(get(cells, "TournamentResult")).toLowerCase();
      if (resultRaw !== "placed" && resultRaw !== "busted") {
        errors.push({
          row: rowNumber,
          message: "TournamentResult must be placed or busted",
        });
        continue;
      }
      tournamentResult = resultRaw as TournamentResult;

      const rebuyRaw = sanitizeCsvCell(get(cells, "RebuyAmount"));
      if (rebuyRaw) {
        const rebuy = parseAmount(rebuyRaw);
        if (rebuy == null) {
          errors.push({ row: rowNumber, message: "Invalid RebuyAmount" });
          continue;
        }
        rebuyAmount = rebuy;
      }
      const bountyRaw = sanitizeCsvCell(get(cells, "BountyAmount"));
      if (bountyRaw) {
        const bounty = parseAmount(bountyRaw);
        if (bounty == null) {
          errors.push({ row: rowNumber, message: "Invalid BountyAmount" });
          continue;
        }
        bountyAmount = bounty;
      }

      if (tournamentResult === "placed") {
        const won = parseAmount(get(cells, "AmountWon"));
        if (won == null) {
          errors.push({
            row: rowNumber,
            message: "AmountWon is required when TournamentResult is placed",
          });
          continue;
        }
        amountWon = won;
        tournamentPlace = parseOptionalInt(get(cells, "TournamentPlace"));
      } else {
        amountWon = 0;
      }
      cashOut = (amountWon ?? 0) + bountyAmount;
      tournamentEntries = parseOptionalInt(get(cells, "TournamentEntries"));
    }

    rows.push({
      rowNumber,
      sessionType,
      playedAt,
      location,
      buyIn,
      cashOut,
      currency,
      fxRateToSgd,
      fxRateManual,
      hours,
      note,
      gameName,
      smallBlind,
      bigBlind,
      ante,
      tournamentName,
      eventName,
      tournamentResult,
      amountWon,
      rebuyAmount,
      bountyAmount,
      tournamentPlace,
      tournamentEntries,
      account,
    });
  }

  console.info("[poker/parse-csv] parsed", { rows: rows.length, errors: errors.length });
  return { rows, errors };
}
