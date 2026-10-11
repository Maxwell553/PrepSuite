import { getOpeningFamily } from "./openingStats";
import type { GameData, ScoutingReport } from "../types";
import { identityKey } from "./identity";
export { identityKey } from "./identity";
export function playerAliases(report: ScoutingReport) {
  return [
    report.player.name,
    report.player.platforms?.chessCom,
    report.player.platforms?.lichess,
    (report.player as { fideName?: string }).fideName,
  ]
    .filter(Boolean)
    .map((v) => identityKey(v!));
}
export function gameSpeed(game: GameData) {
  const tc = (game.timeControl || "").toLowerCase();
  for (const speed of ["bullet", "blitz", "rapid", "classical"])
    if (tc.includes(speed)) return speed;
  const match = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!match) return "unknown";
  const seconds = Number(match[1]) + 40 * Number(match[2] || 0);
  return seconds < 180
    ? "bullet"
    : seconds < 600
      ? "blitz"
      : seconds < 1800
        ? "rapid"
        : "classical";
}
export interface PreparationPriority {
  opening: string;
  games: GameData[];
  score: number;
  expected: number | null;
  confidence: string;
  frequency: number;
}
export function preparationPriorities(
  report: ScoutingReport,
  side: "white" | "black",
  source: string,
  speed: string,
  days: number,
): PreparationPriority[] {
  const aliases = playerAliases(report),
    cutoff = days ? Date.now() - days * 86400000 : 0;
  const groups = new Map<string, GameData[]>();
  const games = (report.games || []).filter(
    (g) =>
      aliases.includes(identityKey(side === "white" ? g.black : g.white)) &&
      (!source || g.source === source) &&
      (!speed || gameSpeed(g) === speed) &&
      (!days || Date.parse(g.playedAt) >= cutoff) &&
      ["1-0", "0-1", "1/2-1/2"].includes(g.result),
  );
  for (const game of games) {
    const name = getOpeningFamily(
      game.openingName || game.eco || "Unclassified",
    );
    groups.set(name, [...(groups.get(name) || []), game]);
  }
  return [...groups]
    .map(([opening, items]) => {
      let points = 0,
        expected = 0,
        rated = 0;
      for (const g of items) {
        points +=
          g.result === "1/2-1/2"
            ? 0.5
            : g.result === (side === "white" ? "0-1" : "1-0")
              ? 1
              : 0;
        const player = side === "white" ? g.blackElo : g.whiteElo,
          other = side === "white" ? g.whiteElo : g.blackElo;
        if (player && other) {
          expected += 1 / (1 + 10 ** ((other - player) / 400));
          rated++;
        }
      }
      return {
        opening,
        games: items,
        score: points / items.length,
        expected: rated === items.length ? expected / rated : null,
        confidence:
          items.length < 20
            ? "Small sample"
            : items.length < 50
              ? "Moderate sample"
              : "Larger sample",
        frequency: items.length / games.length,
      };
    })
    .sort((a, b) => b.games.length - a.games.length)
    .slice(0, 3);
}
