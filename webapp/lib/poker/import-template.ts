/** Poker session CSV import — headers and downloadable template. */

export const POKER_IMPORT_HEADERS = [
  "SessionType",
  "PlayedAt",
  "Location",
  "BuyIn",
  "CashOut",
  "Currency",
  "FxRateToSgd",
  "FxRateManual",
  "Hours",
  "Note",
  "GameName",
  "SmallBlind",
  "BigBlind",
  "Ante",
  "TournamentName",
  "EventName",
  "TournamentResult",
  "AmountWon",
  "RebuyAmount",
  "BountyAmount",
  "TournamentPlace",
  "TournamentEntries",
  "Account",
] as const;

export type PokerImportHeader = (typeof POKER_IMPORT_HEADERS)[number];

/** Example cash-game row (no Account — safe to upload as-is). */
export const POKER_IMPORT_EXAMPLE_CASH_ROW =
  "cash_game,2026-03-15T20:00,Marina Bay Sands,300,450,SGD,,false,4.5,Friday night,NLH,1,3,,,,,,,,,,";

/** Example tournament ITM row — CashOut empty; use AmountWon (no Account). */
export const POKER_IMPORT_EXAMPLE_TOURNAMENT_ROW =
  "tournament,2026-05-10T14:00,Resorts World,500,,USD,1.35,true,8,Day 1,,,,,APT,Main Event,placed,1200,200,0,8,200,";

/** Example busted PKO row — bounties without a prize (no Account). */
export const POKER_IMPORT_EXAMPLE_TOURNAMENT_BUSTED_ROW =
  "tournament,2026-06-01T19:00,Marina Bay Sands,300,,SGD,,false,5,PKO night,,,,,MBS PKO,500 NLH PKO,busted,,100,150,,";

/** @deprecated Use POKER_IMPORT_EXAMPLE_CASH_ROW */
export const POKER_IMPORT_EXAMPLE_ROW = POKER_IMPORT_EXAMPLE_CASH_ROW;

export const POKER_IMPORT_TEMPLATE_CSV = [
  POKER_IMPORT_HEADERS.join(","),
  POKER_IMPORT_EXAMPLE_CASH_ROW,
  POKER_IMPORT_EXAMPLE_TOURNAMENT_ROW,
  POKER_IMPORT_EXAMPLE_TOURNAMENT_BUSTED_ROW,
].join("\n");

export const POKER_IMPORT_TEMPLATE_FILENAME = "poker-sessions-import-template.csv";

/** Max upload size (bytes) — shared by client and server. */
export const POKER_IMPORT_MAX_FILE_BYTES = 512_000;

/** Max data rows per import. */
export const POKER_IMPORT_MAX_ROWS = 100;
