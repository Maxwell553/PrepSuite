
export interface PlayerMetadata {
  name: string;
  fideId?: string;
  uscfId?: string;
  age?: string;
  country?: string;
  titles?: string[];
  currentRating?: number;
  uscfRating?: number;
  peakRating?: number;
  platforms: {
    chessCom?: string;
    lichess?: string;
  };
}

export interface OpeningStat {
  name: string;
  eco: string;
  frequency: number; // 0-1
  winRate: number; // 0-1
  drawRate: number; // 0-1
  lossRate: number; // 0-1
  wins: number;
  draws: number;
  losses: number;
  totalGames: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface MoveSequence {
  moves: string[]; // Array of moves (for compatibility)
  notation?: string; // Formatted chess notation (e.g., "1. e4 e5 2. Nc3 Nc6 3. b3")
  frequency: number; // How many times this sequence appears
  games: number; // Number of games with this sequence
}

/** Win/loss breakdown by game end type */
export interface WinLossByType {
  resignation: number;
  onTime: number;
  checkmate: number;
  other: number;
}

/** Aggregated clock / flag statistics (Chess.com + Lichess only) */
export interface TimeManagementStats {
  onlineGames: number;
  gamesWithEndMetadata: number;
  lostOnTime: number;
  wonOnTime: number;
  lostOnTimeShareOfLosses: number;
  lostOnTimeShareAmongFlagDecisive?: number;
  bySpeed: Array<{ speed: string; games: number; lostOnTime: number; wonOnTime: number }>;
  timeline: Array<{ period: string; games: number; lostOnTime: number; wonOnTime: number }>;
  winsByType: WinLossByType;
  lossesByType: WinLossByType;
}

export interface GameData {
  id?: string;
  white: string;
  black: string;
  result: string;
  eco: string;
  pgn?: string;
  playedAt: string;
  source: string;
  timeControl?: string;
  chessComWhiteResult?: string;
  chessComBlackResult?: string;
  lichessStatus?: string;
  openingName?: string;
  /** OTB: event name (e.g. tournament) */
  event?: string;
  /** OTB: white/black Elo at time of game */
  whiteElo?: number;
  blackElo?: number;
  /** OTB: chess titles (GM, IM, etc.) */
  whiteTitle?: string;
  blackTitle?: string;
  /** Pre-computed SAN move history (avoids client-side PGN parsing) */
  history?: string[];
}

export interface ScoutingReport {
  id: string;
  /** When saved from batch into a folder */
  folderId?: string;
  folderName?: string;
  player: PlayerMetadata;
  whiteOpenings: OpeningStat[];
  blackDefenses: OpeningStat[];
  strategicSummary: string;
  blackStrategicSummary: string;
  tacticalProfile: string;
  endgameReliability: string;
  timeControlInsights: string;
  strengths: string[];
  weaknesses: string[];
  specificVulnerability: string;
  tacticalRecommendation: string;
  preparationSummary: string;
  suggestedLines: string[];
  repertoireReliability: number; // 0-100
  mostPlayedLines: {
    white: MoveSequence[];
    black: MoveSequence[];
  };
  games?: GameData[]; // All games for analysis board
  /** Pre-computed openings by source (online vs OTB) - avoids client aggregation */
  openingsBySource?: {
    online: { white: OpeningStat[]; black: OpeningStat[] };
    otb: { white: OpeningStat[]; black: OpeningStat[] };
  };
  engineDepth?: number; // Stockfish engine depth used for analysis
  /** Engine-derived stats (mistake histogram, avg eval by opening, endgame accuracy) */
  engineStats?: {
    mistakeHistogram: { bucket: string; count: number }[];
    avgEvalByOpening: {
      openingName: string;
      side: 'white' | 'black';
      avgEval: number;
      games: number;
    }[];
    endgameAccuracy: number;
  };
  timeManagement?: TimeManagementStats;
  /** AI-generated advice on whether to complicate positions based on opponent's time usage (Vertex: gemini-3.1-pro-preview) */
  timeManagementAdvice?: string;
  lastUpdated: string;
}

export interface SearchResult {
  title: string;
  uri: string;
}
