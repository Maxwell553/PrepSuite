# Report Prompt: Contents and Reduction Ideas

**This document describes what is actually sent to the Gemini model** — the full prompt text passed to `generateReport()` in the pipeline. The "little blobs" (rules, data summary, openings, etc.) are the real prompt contents; there is no separate or hidden prompt.

## Current limits (as implemented)

- `MAX_GAME_METADATA_IN_PROMPT`: **10** games
- `MAX_MOVE_LIST_IN_PROMPT`: **14** games
- `maxMovesPerGame`: **10** moves per game

## What's in the prompt (~30KB)

The `buildReportPrompt` in `pipeline-service/src/pipeline/promptBuilder.ts` sends:

1. **Rules block** (~1.5KB): Instructions for the AI (naming, citation rules, opening phrasing, JSON format)
2. **Data summary** (~200B): Game counts by source, decisive/draw counts, date range
3. **Identity** (~150B): FIDE rating, USCF rating, Chess.com/Lichess usernames
4. **White openings** (~1–4KB): Full opening stats with name, ECO, games, W/D/L, win rate, frequency per opening
5. **Black defenses** (~1–4KB): Same structure
6. **Most played lines** (~0.5KB): Top 10 white and black move sequences
7. **Game metadata** (~2–6KB): Up to **10** games, stratified by opening — `source white v black result eco date timeControl` per line
8. **Move sequences** (~4–12KB): Up to **14** games with up to **10** moves each in notation (e.g. `1. e4 e5 2. Nf3 Nc6`)
9. **Engine analysis** (~0.5–2KB): Per-opening avg eval when ≥3 games analyzed
10. **Task/schema** (~1KB): Required JSON fields and format

## Prompt length and speed

**Does prompt length correlate to speed?** Yes. Longer prompts increase:

- **Time to first token (TTFT)**: The model must process the entire prompt before generating. More input tokens → longer prefill/encode phase.
- **Cost**: Input tokens are billed; shorter prompts cost less.
- **Memory**: Very long prompts can hit context limits or slow inference.

**Ways to make report generation faster:**

1. **Reduce prompt size** (current: ~18KB, 10 metadata games, 14 move-list games, 10 moves/game). Further cuts: lower `MAX_MOVE_LIST_IN_PROMPT` (e.g. 10), `MAX_GAME_METADATA_IN_PROMPT` (e.g. 6), or `maxMovesPerGame` (e.g. 8).
2. **Use a faster model** (e.g. Gemini Flash instead of Gemini Pro).
3. **Prompt caching**: If the same prompt prefix is reused, some APIs cache it.
4. **Compact formatting**: Abbreviate opening stats, game metadata, etc. (see ideas below).
5. **Parallelize**: Run identity, games, and engine analysis in parallel where possible (already done).

## Ideas to reduce prompt length

1. **Lower sample sizes** *(partially done)*
   - `MAX_GAME_METADATA_IN_PROMPT`: 10 ✓
   - `MAX_MOVE_LIST_IN_PROMPT`: 14 ✓
   - Could go lower if needed

2. **Shorter move sequences** *(done)*
   - `maxMovesPerGame`: 10 ✓

3. **Compact game metadata**
   - Use `W v B R ECO` instead of full `source white v black result eco date timeControl`
   - Saves ~1–2KB

4. **Abbreviate opening stats**
   - Use `Name: W/D/L, WR%` instead of full line
   - Saves ~1–2KB

5. **Drop or trim engine analysis**
   - Omit per-opening breakdown; keep only a short note
   - Saves ~0.5–1.5KB

6. **Condense rules**
   - Merge rules into fewer bullets
   - Saves ~0.5KB

7. **Trim opening lists**
   - Include only top N openings by frequency (e.g. 15)
   - Saves ~1–2KB

8. **Use shorter JSON schema**
   - Keep only required fields; omit optional ones in the prompt
   - Saves ~0.5KB

9. **Two-phase generation**
   - First call: short prompt with stats only → structured data
   - Second call: narrative from that data
   - More total tokens but smaller per-call prompts

10. **Streaming / structured output**
    - Use schema-first, minimal prose instructions
    - Fewer examples and fewer rules in the prompt
