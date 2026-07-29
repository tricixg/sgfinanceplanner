/** User-facing copy aligned with TabPoker / web form labels. */

export const POKER_PROMPTS = {
  playedAt:
    "Date & time (Singapore)? Tap Now for current time, or send e.g. 2026-05-29 14:30 or 2026-05-29T14:30.",
  locationPick: "Location (optional) — pick a saved location, add new, or skip.",
  locationNewName: "New location — Name (e.g. Marina Bay Sands, Home game…)",

  gamePick: "Game (stakes) — pick saved stakes or tap ＋ New game.",
  gameNewIntro:
    "New game — enter the same fields as the web app:\n1. Name\n2. Small blind\n3. Big blind\n4. Ante (optional)",
  gameName: "Name (e.g. NLHE)",
  gameSmallBlind: "Small blind (e.g. 1)",
  gameBigBlind: "Big blind (e.g. 2)",
  gameAnte: "Ante (optional — per hand, or tap Skip ante /send /skip)",

  currencyPick: "Currency for this tournament? Buy-in, prize, and bounties will be entered in this currency.",

  tournamentName: "Tournament name (e.g. APT Taipei)",
  tournamentEvent: "Event name (e.g. Main Event Day 1)",
  tournamentResult: "Result — Placed (in the money) or Busted?",
  tournamentPlace: "Place (finish position)? Optional — e.g. 12, or tap Skip place /send /skip",
  tournamentAmountWon: "Amount won?",
  tournamentEntries: "Total entries (field size)? Optional — or tap Skip entries /send /skip",

  buyIn: "Buy-in?",
  cashOut: "Cash-out? (0 if you busted)",
  hours: "Hours played? Optional — for hourly stats (Skip hours or /skip)",
  note: "Note? Optional — tap Skip note or /skip",
} as const;
