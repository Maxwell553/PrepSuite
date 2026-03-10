import { useState, useEffect } from 'react';
import { parseGameHistories, parseGameHistoriesAsync, type ParsedGame } from '../lib/repertoireUtils';
import type { GameData } from '../types';

function allGamesHaveHistory(games: GameData[]): boolean {
  return games.every((g) => g?.history && Array.isArray(g.history));
}

/** Returns parsed games. Sync when all have pre-computed history; async via worker otherwise. */
export function useParsedGames(games: GameData[]): { parsed: ParsedGame[]; loading: boolean } {
  const hasHistory = games?.length && allGamesHaveHistory(games);
  const [parsed, setParsed] = useState<ParsedGame[]>(() =>
    hasHistory ? parseGameHistories(games) : [],
  );
  const [loading, setLoading] = useState(!hasHistory);

  useEffect(() => {
    if (!games?.length) {
      setParsed([]);
      setLoading(false);
      return;
    }

    if (allGamesHaveHistory(games)) {
      setParsed(parseGameHistories(games));
      setLoading(false);
      return;
    }

    setLoading(true);
    parseGameHistoriesAsync(games).then((result) => {
      setParsed(result);
      setLoading(false);
    });
  }, [games]);

  return { parsed, loading };
}
