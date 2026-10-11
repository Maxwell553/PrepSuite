import { flushSync } from 'react-dom';
import MotionSurface from './MotionSurface';
import React, { lazy, Suspense, useMemo, useState, useRef } from "react";
import type { GameData, ScoutingReport } from "../types";
import { preparationPriorities } from "../lib/preparation";
const GameAnalysisModal = lazy(() => import("./GameAnalysisModal"));
const GamesModal = lazy(() => import("./GamesModal"));
export default function PreparationPlan({
  report,
}: {
  report: ScoutingReport;
}) {
  const [side, setSide] = useState<"white" | "black">("white"),
    [source, setSource] = useState(""),
    [speed, setSpeed] = useState(""),
    [days, setDays] = useState(0),
    [evidence, setEvidence] = useState<GameData[] | null>(null),
    [game, setGame] = useState<GameData | null>(null),
    [exportError, setExportError] = useState("");
  const priorities = useMemo(
    () => preparationPriorities(report, side, source, speed, days),
    [report, side, source, speed, days],
  );
  const sheetRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const filterDescription = `Prepare as ${side === 'white' ? 'White' : 'Black'} · ${source === 'otb' ? 'Over the board' : source || 'All sources'} · ${speed || 'All speeds'} · ${days ? `Last ${days} days` : 'All dates'}`;
  async function download() {
    setExportError('');
    flushSync(() => setExporting(true));
    try {
      const { exportRoundSheetAsPdf } = await import('../lib/pdfExport');
      if (!sheetRef.current) throw new Error('Round sheet unavailable');
      await exportRoundSheetAsPdf(sheetRef.current);
    } catch {
      setExportError('Could not export. Please try again.');
    } finally { setExporting(false); }
  }
  return (
    <section data-pdf-section
      className="mb-8 rounded-2xl border border-violet-400/25 bg-slate-900 p-5 sm:p-7"
      aria-labelledby="prep-title"
    >
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-violet-300 uppercase">
            Your preparation plan
          </p>
          <h2 id="prep-title" className="text-2xl text-white mt-2">
            Three places to start.
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Choose your color. These are the opponent’s most frequent replies in
            your selected games.
          </p>
        </div>
        <button
          type="button" disabled={exporting || !priorities.length}
          className="text-sm text-violet-200 underline disabled:opacity-50 print:hidden"
          onClick={download}
        >
          {exporting ? 'Exporting round sheet…' : 'Download round sheet'}
        </button>
      </div>
      <p className="text-sm text-slate-300 mt-4" aria-live="polite">{filterDescription}</p>
      <div className="prep-preparation-filters flex flex-wrap gap-3 my-5 print:hidden">
        {[
          {
            label: "Prepare as",
            value: side,
            change: (v: string) => setSide(v as "white" | "black"),
            options: [
              ["white", "White"],
              ["black", "Black"],
            ],
          },
          {
            label: "Source",
            value: source,
            change: setSource,
            options: [
              ["", "All sources"],
              ["otb", "Over the board"],
              ["chess.com", "Chess.com"],
              ["lichess", "Lichess"],
            ],
          },
          {
            label: "Speed",
            value: speed,
            change: setSpeed,
            options: [
              ["", "All speeds"],
              ["bullet", "Bullet"],
              ["blitz", "Blitz"],
              ["rapid", "Rapid"],
              ["classical", "Classical"],
            ],
          },
          {
            label: "Period",
            value: String(days),
            change: (v: string) => setDays(Number(v)),
            options: [
              ["0", "All dates"],
              ["90", "Last 90 days"],
              ["365", "Last year"],
            ],
          },
        ].map((f) => (
          <label key={f.label} className="text-xs text-slate-300">
            {f.label}
            <select
              aria-label={f.label}
              className="block mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              value={f.value}
              onChange={(e) => f.change(e.target.value)}
            >
              {f.options.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {priorities.map((p, i) => (
          <MotionSurface role="article" hoverLift delay={i * .06}
            key={p.opening}
            className="rounded-xl border border-slate-700 p-4"
          >
            <span className="text-violet-300 text-xs">
              0{i + 1} · FREQUENTLY PLAYED
            </span>
            <h3 className="text-white text-lg my-2">{p.opening}</h3>
            <p className="text-sm text-slate-300">
              {p.games.length} games · {Math.round(p.frequency * 100)}% of this
              sample
            </p>
            <p className="text-sm text-slate-300 mt-2">
              Opponent score: {Math.round(p.score * 100)}%
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {p.expected === null
                ? "Opponent ratings incomplete; no rating adjustment."
                : `Rating-expected score: ${Math.round(p.expected * 100)}%. Historical comparison only.`}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {p.confidence} ·{" "}
              {p.games.map((g) => g.playedAt.slice(0, 10)).sort()[0]}–
              {p.games
                .map((g) => g.playedAt.slice(0, 10))
                .sort()
                .at(-1)}
            </p>
            <button
              className="mt-4 text-violet-200 text-sm underline print:hidden"
              onClick={() => setEvidence(p.games)}
            >
              Review supporting games →
            </button>
          </MotionSurface>
        ))}
      </div>
      {!priorities.length && (
        <p className="text-slate-300 text-sm">
          No matching games. Try another color, source, or date range.
        </p>
      )}
      <p className="text-xs text-slate-400 mt-4">
        Score includes half a point per draw. Historical results are not
        engine-confirmed weaknesses. Sample size is not a guarantee of
        prediction accuracy. Filters apply to this preparation plan; the other
        report tabs retain all games.
      </p>
      {exporting && <div ref={sheetRef} className="prep-round-sheet" aria-hidden="true" data-pdf-exclude>
        <p className="sheet-label">PrepSuite.ai / Your round preparation</p>
        <h1>{report.player.name}</h1>
        <p>{filterDescription}</p>
        <p>Report snapshot: {report.lastUpdated?.slice(0, 10) || 'Unknown'} · Prepared {new Date().toISOString().slice(0, 10)}</p>
        {priorities.map((priority, index) => <article key={priority.opening}>
          <p className="sheet-label">0{index + 1} / Frequently played</p>
          <h2>{priority.opening}</h2>
          <p>{priority.games.length} games · {Math.round(priority.frequency * 100)}% of the selected sample · {priority.confidence}</p>
          <p>Opponent score: {Math.round(priority.score * 100)}% (draws count as half).
            {priority.expected !== null ? ` Rating-expected score: ${Math.round(priority.expected * 100)}%.` : ' Opponent ratings incomplete.'}</p>
          <p><strong>Games to review</strong></p>
          {priority.games.slice(0, 2).map((game, i) => <p key={i}>{game.white} — {game.black} · {game.result} · {game.playedAt.slice(0, 10)}</p>)}
        </article>)}
        <footer><p>Historical results are clues, not engine-confirmed weaknesses. Review the games and choose lines you know.</p><p>Use this sheet before your game, not during play.</p></footer>
      </div>}
      {exportError && <p role="alert">{exportError}</p>}
      <Suspense fallback={<p role="status">Loading game explorer…</p>}>
        {evidence && !game && (
          <GamesModal
            games={evidence}
            playerName={report.player.name}
            playerUsername={
              Object.values(report.player.platforms).filter(Boolean) as string[]
            }
            onSelectGame={(i) => setGame(evidence[i])}
            onClose={() => setEvidence(null)}
          />
        )}
        {game && (
          <GameAnalysisModal
            game={game}
            playerName={report.player.name}
            playerUsername={
              Object.values(report.player.platforms).filter(Boolean) as string[]
            }
            onClose={() => setGame(null)}
          />
        )}
      </Suspense>
    </section>
  );
}
