
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
  moves: string[]; // Array of moves in PGN format (e.g., ["e4", "c5", "Nf3", "d6"])
  frequency: number; // How many times this sequence appears
  games: number; // Number of games with this sequence
}

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
  repertoireReliability: number; // 0-100
  mostPlayedLines: {
    white: MoveSequence[];
    black: MoveSequence[];
  };
  lastUpdated: string;
}

export interface SearchResult {
  title: string;
  uri: string;
}
