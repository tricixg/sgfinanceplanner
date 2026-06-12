import type { PokerGame, PokerSession, PokerSessionType } from "@/lib/poker/types";
import { formatGameStakes } from "@/lib/poker/types";

export type PokerSessionTypeFilter = "all" | PokerSessionType;

export type PokerSessionListFilters = {
  sessionType: PokerSessionTypeFilter;
  gameId: string;
  location: string;
};

export const EMPTY_POKER_SESSION_FILTERS: PokerSessionListFilters = {
  sessionType: "all",
  gameId: "",
  location: "",
};

export function pokerSessionFiltersActive(filters: PokerSessionListFilters): boolean {
  return (
    filters.sessionType !== "all" || Boolean(filters.gameId) || Boolean(filters.location)
  );
}

export function filterPokerSessions(
  sessions: PokerSession[],
  filters: PokerSessionListFilters
): PokerSession[] {
  return sessions.filter((session) => {
    if (filters.sessionType !== "all" && session.sessionType !== filters.sessionType) {
      return false;
    }
    if (filters.location && session.location.trim() !== filters.location) {
      return false;
    }
    if (filters.gameId) {
      if (session.sessionType !== "cash_game" || session.gameId !== filters.gameId) {
        return false;
      }
    }
    return true;
  });
}

export function derivePokerFilterCatalog(sessions: PokerSession[]): {
  locations: string[];
  games: PokerGame[];
} {
  const locationSet = new Set<string>();
  const gameMap = new Map<string, PokerGame>();
  for (const session of sessions) {
    const loc = session.location.trim();
    if (loc) locationSet.add(loc);
    if (session.game) gameMap.set(session.game.id, session.game);
  }
  return {
    locations: [...locationSet].sort((a, b) => a.localeCompare(b)),
    games: [...gameMap.values()].sort((a, b) =>
      formatGameStakes(a).localeCompare(formatGameStakes(b))
    ),
  };
}
