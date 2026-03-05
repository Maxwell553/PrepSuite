/** FIDE profile from HTML scraping */
export interface FideProfile {
  name: string;
  federation: string;
  birthYear: string;
  rating: number;
  title: string;
}

/** USCF profile from HTML scraping */
export interface UscfProfile {
  id: string;
  name: string;
  rating: number;
  state: string;
  fideId?: string;
  title?: string;
}

/** Chess.com player profile */
export interface ChessComProfile {
  avatar?: string;
  name?: string;
  username: string;
  followers: number;
  country: string;
  last_online: number;
  joined: number;
  status: string;
  is_streamer: boolean;
  verified: boolean;
  league?: string;
  title?: string;
}

/** Lichess player profile */
export interface LichessProfile {
  id: string;
  username: string;
  perfs: {
    blitz?: { rating: number };
    rapid?: { rating: number };
    classical?: { rating: number };
  };
  profile?: {
    firstName?: string;
    lastName?: string;
    /** Full name; many users fill this instead of firstName/lastName */
    realName?: string;
    country?: string;
    bio?: string;
  };
  title?: string;
}

/** Resolved identity from the pipeline */
export interface ResolvedIdentity {
  verifiedName: string;
  fideId: string;
  fideProfile: FideProfile | null;
  /** USCF ID when known (from profile or Gemini), even if profile fetch failed */
  uscfId: string;
  uscfProfile: UscfProfile | null;
  chessComUsername: string;
  lichessUsername: string;
  confidence: number;
}

/** Normalized game data from Chess.com, Lichess, or OTB */
export interface GameData {
  id: string;
  source: 'chess.com' | 'lichess' | 'otb';
  white: string;
  black: string;
  result: string; // '1-0', '0-1', '1/2-1/2'
  eco: string;
  pgn: string;
  playedAt: string;
  timeControl: string;
  weight?: number;
  /** Opening name from ECO library when available */
  openingName?: string;
  /** OTB: event name (e.g. tournament) */
  event?: string;
  /** OTB: white/black Elo at time of game */
  whiteElo?: number;
  blackElo?: number;
  /** OTB: chess titles (GM, IM, etc.) */
  whiteTitle?: string;
  blackTitle?: string;
}

/** Opening statistics per side */
export interface OpeningStat {
  name: string;
  eco: string;
  frequency: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  wins: number;
  draws: number;
  losses: number;
  totalGames: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

/** Most-played opening line */
export interface MoveSequence {
  moves: string[];
  notation: string;
  frequency: number;
  games: number;
}

/** Stockfish analysis result for a single game */
export interface GameAnalysis {
  gameId: string;
  criticalMistakes: Array<{
    moveNumber: number;
    move: string;
    evaluationBefore: number;
    evaluationAfter: number;
    mistakeSeverity: number;
  }>;
  averageEvaluation: number;
  evaluationTrend: 'improving' | 'declining' | 'stable';
  endgameAccuracy: number;
}

/** Request body for POST /api/analyze */
export interface AnalyzeRequest {
  name: string;
  fideId?: string;
  uscfId?: string;
  chessComUsername?: string;
  lichessUsername?: string;
  gameLimit?: number;
}

/** Player metadata for scouting reports */
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

/** Full scouting report returned by the pipeline */
export interface ScoutingReport {
  id: string;
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
  repertoireReliability: number;
  mostPlayedLines: {
    white: MoveSequence[];
    black: MoveSequence[];
  };
  games?: GameData[];
  engineDepth?: number;
  lastUpdated: string;
}

/** Chat request body for POST /api/chat */
export interface ChatRequest {
  report: ChatContext;
  /** Conversation history. If provided, the last message should be the current user question. */
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Legacy: single question. Used when messages is not provided. */
  question?: string;
}

/** Subset of ScoutingReport used for chat context */
export interface ChatContext {
  player: PlayerMetadata;
  whiteOpenings?: OpeningStat[];
  blackDefenses?: OpeningStat[];
  mostPlayedLines?: {
    white: MoveSequence[];
    black: MoveSequence[];
  };
  preparationSummary?: string;
  blackStrategicSummary?: string;
  /** Games for tool access (get_game, get_pgn). 1-based indexing. */
  games?: GameData[];
}

/** SSE event: phase status */
export interface PhaseEvent {
  phase: 'identity' | 'games' | 'parsing' | 'engine' | 'report';
  status: 'started' | 'complete' | 'progress';
  durationMs?: number;
  gameCount?: number;
  gamesAnalyzed?: number;
  /** When status is 'progress', a short message for the UI */
  message?: string;
}

/** SSE event: progress within a phase */
export interface ProgressEvent {
  phase: 'identity' | 'games' | 'engine';
  current: number;
  total: number;
}

/** SSE event: pipeline complete */
export interface CompleteEvent {
  report: ScoutingReport;
}

/** SSE event: error */
export interface ErrorEvent {
  error: string;
  phase?: 'identity' | 'games' | 'parsing' | 'engine' | 'report';
}
