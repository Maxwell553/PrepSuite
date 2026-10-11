import { Chess } from "chess.js";
import { GameData } from "../types";
import { loadPgn } from "./pgnUtils";

/** Pre-parsed game: history only. Avoids repeated PGN parsing. */
export type ParsedGame = { history: string[]; game: GameData } | null;

const parsedCache = new WeakMap<GameData[], ParsedGame[]>();
const pendingCache = new WeakMap<GameData[], Promise<ParsedGame[]>>();

/** Parse all games once. Uses pre-computed history when present, else parses PGN on main thread. */
export function parseGameHistories(games: GameData[]): ParsedGame[] {
  const cached = parsedCache.get(games);
  if (cached) return cached;
  const parsed = games.map((g) => {
    if (!g) return null;
    if (g.history && Array.isArray(g.history) && g.history.length >= 0) {
      return { history: g.history, game: g };
    }
    if (!g.pgn || g.pgn.trim().length < 10) return null;
    const chess = loadPgn(g.pgn, Chess);
    return chess ? { history: chess.history(), game: g } : null;
  });
  parsedCache.set(games, parsed);
  return parsed;
}

/** Whether all games have pre-computed history (no parsing needed). */
function allGamesHaveHistory(games: GameData[]): boolean {
  return games.every((g) => g?.history && Array.isArray(g.history));
}

/** Parse games in a Web Worker. Used when some games lack pre-computed history. */
export function parseGameHistoriesInWorker(
  games: GameData[],
): Promise<ParsedGame[]> {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("../workers/parseGames.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<{ results: ParsedGame[] }>) => {
      worker.terminate();
      resolve(e.data.results);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(parseGameHistories(games));
    };
    worker.postMessage({ games });
  });
}

/** Parse games: sync when all have history, else async via worker. */
export async function parseGameHistoriesAsync(
  games: GameData[],
): Promise<ParsedGame[]> {
  if (allGamesHaveHistory(games)) {
    return parseGameHistories(games);
  }
  const cached = parsedCache.get(games);
  if (cached) return cached;
  let pending = pendingCache.get(games);
  if (!pending) {
    pending = parseGameHistoriesInWorker(games)
      .then((result) => {
        parsedCache.set(games, result);
        return result;
      })
      .finally(() => pendingCache.delete(games));
    pendingCache.set(games, pending);
  }
  return pending;
}
