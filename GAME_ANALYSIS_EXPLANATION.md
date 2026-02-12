# How Games Are Weighted and Analyzed

**Last Updated:** January 26, 2026

This document explains how PrepSuite processes, weights, and analyzes chess games to generate player statistics and scouting reports.

---

## 📊 Overview

The analysis system processes games through multiple stages:

1. **Game Collection** - Fetches games from Chess.com and Lichess
2. **Game Filtering** - Filters games by player side (white/black)
3. **Opening Identification** - Groups games by ECO codes and opening variations
4. **Statistics Calculation** - Calculates win rates, frequencies, and trends
5. **Engine Analysis** - Uses Stockfish to analyze tactical patterns

---

## 🎯 Game Weighting System

### Current Weighting: **Equal Weight (1.0)**

**All games are currently weighted equally**, regardless of:
- Time control (blitz, rapid, classical)
- Opponent strength
- Date played
- Platform (Chess.com vs Lichess)

**Code Reference:**
```typescript
// From services/analysis.worker.ts:831
const weight = 1; // All games weighted equally
```

### Why Equal Weighting?

1. **Simplicity** - Easier to understand and maintain
2. **Transparency** - Users can see raw game counts
3. **No Bias** - Doesn't favor certain game types
4. **Statistical Clarity** - Win rates are straightforward percentages

### Potential Future Weighting Factors

The `GameData` interface includes a `weight?: number` field, suggesting future weighting could consider:

- **Time Control** (not currently implemented):
  - Classical: 1.5x weight
  - Rapid: 1.0x weight
  - Blitz: 0.8x weight
  - Bullet: 0.5x weight

- **Opponent Strength** (not currently implemented):
  - Higher-rated opponents: 1.2x weight
  - Similar-rated opponents: 1.0x weight
  - Lower-rated opponents: 0.8x weight

- **Recency** (not currently implemented):
  - Recent games (last 6 months): 1.2x weight
  - Older games: 0.8x weight

---

## 🔍 Game Filtering Process

### 1. Side-Based Filtering

Games are filtered to only include those where the target player is on the specified side:

**For White Statistics:**
```typescript
// Only games where target plays white
const relevantGames = games.filter(g => {
    const isTargetWhite = g.white.toLowerCase() === targetLower;
    return isTargetWhite;
});
```

**For Black Statistics:**
```typescript
// Only games where target plays black
const relevantGames = games.filter(g => {
    const isTargetBlack = g.black.toLowerCase() === targetLower;
    return isTargetBlack;
});
```

**Key Point:** Each game is counted **only once** - if a player is white, it's counted in white stats only, not black stats.

### 2. Minimum Game Thresholds

To ensure statistical significance, openings must meet minimum game counts:

- **White Openings:** Minimum 5 games
- **Black Defenses:** Minimum 10 games

**Rationale:**
- Lower threshold for white (5 games) shows more opponent responses/variations
- Higher threshold for black (10 games) focuses on main defenses

**Code Reference:**
```typescript
// From services/analysis.worker.ts:822
const MIN_GAMES = side === 'white' ? 5 : 10;
```

---

## 📈 Statistics Calculation

### 1. Opening Aggregation

Games are grouped by ECO (Encyclopedia of Chess Openings) codes:

**Process:**
1. Extract ECO code from each game
2. Use PGN-based identification for granular opening detection (5-10 moves)
3. Aggregate similar openings (e.g., "C11" → "French Defense (Classical)")
4. Track which specific ECOs contributed to each aggregated opening

**Code Reference:**
```typescript
// From services/analysis.worker.ts:830
const aggregatedECO = aggregateECO(originalECO, g.pgn, side);
```

### 2. Win/Loss/Draw Calculation

Results are calculated from the **target player's perspective**:

**For White Games:**
- `1-0` = Win (white wins)
- `0-1` = Loss (white loses)
- `1/2-1/2` = Draw

**For Black Games:**
- `0-1` = Win (black wins)
- `1-0` = Loss (black loses)
- `1/2-1/2` = Draw

**Code Reference:**
```typescript
// From services/analysis.worker.ts:858-876
if (side === 'white') {
    if (g.result === '1-0') isWin = true;
    else if (g.result === '0-1') isLoss = true;
    else if (g.result === '1/2-1/2') isDraw = true;
} else {
    if (g.result === '0-1') isWin = true;
    else if (g.result === '1-0') isLoss = true;
    else if (g.result === '1/2-1/2') isDraw = true;
}
```

### 3. Win Rate Calculation

**Important:** Win rates are calculated from **raw counts**, not weighted counts:

```typescript
// From services/analysis.worker.ts:921-925
const winRate = totalGames > 0 ? rawWins / totalGames : 0;
const drawRate = totalGames > 0 ? rawDraws / totalGames : 0;
const lossRate = totalGames > 0 ? rawLosses / totalGames : 0;
```

**Example:**
- 10 games total
- 6 wins, 2 draws, 2 losses
- Win rate = 6/10 = 0.6 (60%)
- Draw rate = 2/10 = 0.2 (20%)
- Loss rate = 2/10 = 0.2 (20%)

### 4. Frequency Calculation

Frequency represents how often an opening is played **relative to all openings**:

```typescript
// From services/analysis.worker.ts:930
frequency: totalWeighted > 0 ? s.weightedCount / totalWeighted : 0
```

**Example:**
- Total weighted games across all openings: 100
- Sicilian Defense weighted count: 25
- Frequency = 25/100 = 0.25 (25% of games)

---

## ⚙️ Stockfish Engine Analysis

### Game Selection for Analysis

**All games with substantial PGN are analyzed:**
```typescript
// From components/SearchScreen.tsx:343-348
const gamesWithPGN = allGames
    .filter(g => g.pgn && g.pgn.trim().length > 20) // Only games with substantial PGN
    .sort((a, b) => {
        // Sort by date (most recent first)
        return new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime();
    });
```

**Criteria:**
- Must have PGN (Portable Game Notation)
- PGN must be at least 20 characters (substantial game)
- Sorted by date (most recent first)

### Analysis Process

1. **Sequential Analysis** - Games analyzed one at a time to avoid overwhelming the engine
2. **Progress Tracking** - Callback updates progress (75% → 84% of total progress)
3. **Error Handling** - Failed analyses don't stop the process
4. **Grouping by Opening** - Analyses grouped by ECO code for opening-specific insights

**Code Reference:**
```typescript
// From services/stockfishAnalysis.ts:448-496
async analyzeGames(games, targetUsername, maxGames, progressCallback) {
    // Analyze games sequentially
    for (let i = 0; i < gamesToAnalyze.length; i++) {
        const analysis = await this.analyzeGame(gamesToAnalyze[i], targetUsername);
        // Small delay between games (30ms)
    }
}
```

### What Stockfish Analyzes

- **Critical Mistakes** - Moves that significantly worsen position
- **Average Evaluation** - Average position evaluation throughout game
- **Evaluation Trend** - Whether position improved or worsened
- **Endgame Accuracy** - Performance in endgame phase

---

## 📋 Move Sequence Extraction

### Process

1. **Parse PGN** - Extract moves from game notation
2. **Extract Sequences** - Get first N moves (default: 24 moves = 12 full moves)
3. **Group by Frequency** - Count how many times each sequence appears
4. **Format Notation** - Convert to standard chess notation (e.g., "1. e4 e5 2. Nf3 Nc6")

**Code Reference:**
```typescript
// From services/moveSequenceExtractor.ts:84-176
export function extractMostPlayedLines(
    games: GameData[],
    targetUsername: string,
    maxSequences: number = 10,
    sequenceLength: number = 24 // 12 full moves
)
```

### Sequence Length

- **Default:** 24 moves (12 full moves)
- **Purpose:** Capture deep opening choices and early middlegame transitions
- **Configurable:** Can be adjusted in `SearchScreen.tsx`

---

## 🎯 Sorting and Prioritization

### Opening Statistics

**Sorted by frequency** (most played first):
```typescript
// From services/analysis.worker.ts:941
.sort((a, b) => b.frequency - a.frequency)
```

**Result:** Most frequently played openings appear first in the report.

### Stockfish Analysis

**Sorted by date** (most recent first):
```typescript
// From components/SearchScreen.tsx:345-348
.sort((a, b) => {
    return new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime();
});
```

**Result:** Recent games are analyzed first, providing more current insights.

---

## 📊 Data Flow Summary

```
1. Fetch Games
   ├─ Chess.com API → up to gameLimit games
   └─ Lichess API → up to gameLimit games

2. Parse Games
   ├─ Extract: white, black, result, ECO, PGN, date, timeControl
   └─ Filter: Only games with target player

3. Generate Statistics
   ├─ Filter by side (white/black)
   ├─ Group by ECO/opening
   ├─ Calculate: wins, losses, draws (raw counts)
   ├─ Calculate: winRate = wins / totalGames
   ├─ Calculate: frequency = openingGames / totalGames
   └─ Filter: Only openings with MIN_GAMES threshold

4. Stockfish Analysis
   ├─ Filter: Games with substantial PGN (>20 chars)
   ├─ Sort: Most recent first
   ├─ Analyze: Each game sequentially
   └─ Group: By opening (ECO code)

5. Move Sequence Extraction
   ├─ Parse PGN to moves
   ├─ Extract: First 24 moves (12 full moves)
   ├─ Group: By sequence frequency
   └─ Format: Standard chess notation
```

---

## 🔢 Example Calculation

### Scenario: Player has 100 games as White

**Sicilian Defense (B20-B99):**
- Total games: 30
- Wins: 18
- Draws: 6
- Losses: 6

**Calculations:**
- Win rate = 18/30 = 0.6 (60%)
- Draw rate = 6/30 = 0.2 (20%)
- Loss rate = 6/30 = 0.2 (20%)
- Frequency = 30/100 = 0.3 (30% of white games)

**Queen's Gambit (D30-D69):**
- Total games: 20
- Wins: 12
- Draws: 4
- Losses: 4

**Calculations:**
- Win rate = 12/20 = 0.6 (60%)
- Draw rate = 4/20 = 0.2 (20%)
- Loss rate = 4/20 = 0.2 (20%)
- Frequency = 20/100 = 0.2 (20% of white games)

**Result:** Sicilian appears first (higher frequency), but both have same win rate.

---

## ⚠️ Important Notes

### 1. Equal Weighting Means:
- A blitz game counts the same as a classical game
- A game against a 1200-rated player counts the same as a 2000-rated player
- A game from 2020 counts the same as a game from 2025

### 2. Minimum Game Thresholds:
- Openings with fewer than 5 games (white) or 10 games (black) are excluded
- This ensures statistical significance
- Prevents noise from rare openings

### 3. Win Rate Accuracy:
- Win rates are calculated from raw counts (not weighted)
- This ensures percentages are accurate and intuitive
- Example: 6 wins out of 10 games = 60% win rate

### 4. Frequency vs. Win Rate:
- **Frequency:** How often an opening is played (relative to all openings)
- **Win Rate:** Success rate in that opening (wins / total games)
- An opening can have high frequency but low win rate (or vice versa)

---

## 🚀 Potential Improvements

### 1. Implement Time Control Weighting
```typescript
const weight = getTimeControlWeight(g.timeControl);
// Classical: 1.5, Rapid: 1.0, Blitz: 0.8, Bullet: 0.5
```

### 2. Implement Opponent Strength Weighting
```typescript
const weight = getOpponentStrengthWeight(g.opponentRating, targetRating);
// Higher-rated: 1.2, Similar: 1.0, Lower: 0.8
```

### 3. Implement Recency Weighting
```typescript
const weight = getRecencyWeight(g.playedAt);
// Recent (6 months): 1.2, Older: 0.8
```

### 4. Add Opening Strength Metrics
- Track performance against different opponent strengths
- Identify openings that work better against stronger/weaker opponents

---

## 📝 Summary

**Current System:**
- ✅ Equal weighting (all games = 1.0)
- ✅ Side-based filtering (white/black separate)
- ✅ Minimum game thresholds (5 for white, 10 for black)
- ✅ Raw count-based win rates (accurate percentages)
- ✅ Frequency-based sorting (most played first)
- ✅ All games analyzed with Stockfish (if PGN available)

**Key Characteristics:**
- Simple and transparent
- No bias toward game types
- Statistical significance ensured
- Recent games prioritized for analysis

**Future Enhancements:**
- Time control weighting
- Opponent strength weighting
- Recency weighting
- More sophisticated opening detection

---

**Questions?** Check the code references above or review:
- `services/analysis.worker.ts` - Statistics generation
- `services/stockfishAnalysis.ts` - Engine analysis
- `services/moveSequenceExtractor.ts` - Move sequence extraction
- `components/SearchScreen.tsx` - Overall analysis orchestration
