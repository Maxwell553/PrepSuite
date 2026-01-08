
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
    chessBase?: boolean;
  };
}

export interface OpeningStat {
  name: string;
  eco: string;
  frequency: number; // 0-1
  winRate: number; // 0-1
  drawRate: number; // 0-1
  lossRate: number; // 0-1
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface ScoutingReport {
  id: string;
  player: PlayerMetadata;
  whiteOpenings: OpeningStat[];
  blackDefenses: OpeningStat[];
  strategicSummary: string;
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
  lastUpdated: string;
}

export interface SearchResult {
  title: string;
  uri: string;
}
