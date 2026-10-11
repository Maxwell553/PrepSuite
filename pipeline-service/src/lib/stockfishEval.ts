import { spawn } from "node:child_process";
import { Chess } from "chess.js";
import { workContext } from "./workContext.js";
const STOCKFISH_BINARY = process.env.STOCKFISH_PATH || "stockfish";
let active = 0;
export interface StockfishEvalResult {
  evaluation: number;
  bestMove?: string;
  pv?: string[];
  depth: number;
}
/** One bounded engine process; evaluation is always from White's perspective. */
export async function evaluateFen(
  fen: string,
  depth = 14,
): Promise<StockfishEvalResult> {
  const position = new Chess(fen);
  const cleanFen = position.fen();
  const sign = position.turn() === "w" ? 1 : -1;
  const boundedDepth = Math.max(1, Math.min(20, Math.trunc(depth) || 14));
  if (active >= 2) throw new Error("Practice engine is busy. Please retry.");
  const signal = workContext.getStore();
  signal?.throwIfAborted();
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const proc = spawn(STOCKFISH_BINARY, [], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let buffer = "",
        evaluation = 0,
        bestMove: string | undefined,
        pv: string[] = [],
        settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        proc.kill("SIGTERM");
        if (error) reject(error);
        else
          resolve({
            evaluation: sign * evaluation,
            bestMove,
            pv,
            depth: boundedDepth,
          });
      };
      const cancel = () => finish(new Error("Engine analysis cancelled"));
      const timer = setTimeout(
        () => finish(new Error("Stockfish evaluation timed out")),
        15000,
      );
      signal?.addEventListener("abort", cancel, { once: true });
      const send = (cmd: string) => {
        if (!settled && proc.stdin?.writable) proc.stdin.write(cmd + "\n");
      };
      proc.stdout?.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (t === "uciok") {
            send("setoption name Threads value 1");
            send("setoption name Hash value 32");
            send("isready");
          }
          if (t === "readyok") {
            send(`position fen ${cleanFen}`);
            send(`go depth ${boundedDepth}`);
          }
          const cp = t.match(/score cp (-?\d+)/);
          if (cp) evaluation = Number(cp[1]);
          const mate = t.match(/score mate (-?\d+)/);
          if (mate) evaluation = Number(mate[1]) > 0 ? 10000 : -10000;
          const principal = t.match(/\spv\s+(.+)/);
          if (principal)
            pv = principal[1]
              .split(/\s+/)
              .filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
          if (t.startsWith("bestmove ")) {
            bestMove = t.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1];
            finish();
          }
        }
      });
      proc.on("error", finish);
      proc.stdin?.on("error", finish);
      proc.on("exit", () => {
        if (!settled)
          finish(new Error("Stockfish exited before returning a move"));
      });
      send("uci");
    });
  } finally {
    active--;
  }
}
