import type { ScoutingReport } from '../types';

export interface ThreatFactor {
  key: string;
  label: string;
  /** Raw score 0-100 for this factor */
  score: number;
  /** Weight used in overall calculation (0-1) */
  weight: number;
  /** Weighted contribution to final score */
  weighted: number;
  /** Short description of what this measures */
  description: string;
  /** Whether data was available to compute this factor */
  available: boolean;
}

export interface ThreatAssessment {
  score: number;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  factors: ThreatFactor[];
}

/**
 * Compute a 0-100 "Threat Level" for a scouted player.
 * Returns both the aggregate score and individual factor breakdowns.
 */
export function computeThreatLevel(report: ScoutingReport): ThreatAssessment {
  const factors: ThreatFactor[] = [];

  // 1. Rating tier (weight 0.35)
  const rating = report.player.currentRating ?? report.player.uscfRating ?? 0;
  const ratingAvail = rating > 0;
  const ratingScore = ratingAvail
    ? Math.min(100, Math.max(0, (rating - 600) / 22))
    : 0;
  factors.push({
    key: 'rating',
    label: 'Rating',
    score: Math.round(ratingScore),
    weight: 0.35,
    weighted: ratingAvail ? ratingScore * 0.35 : 0,
    description: `Based on peak rating of ${rating || '—'}`,
    available: ratingAvail,
  });

  // 2. Repertoire reliability (weight 0.2)
  const relAvail =
    report.repertoireReliability != null && report.repertoireReliability > 0;
  const relScore = relAvail ? report.repertoireReliability : 0;
  factors.push({
    key: 'reliability',
    label: 'Repertoire Reliability',
    score: Math.round(relScore),
    weight: 0.2,
    weighted: relAvail ? relScore * 0.2 : 0,
    description: 'How consistently they stick to their openings',
    available: relAvail,
  });

  // 3. Game volume (weight 0.15)
  const gameCount = report.games?.length ?? 0;
  const volAvail = gameCount > 0;
  const volumeScore = volAvail ? Math.min(100, (gameCount / 500) * 100) : 0;
  factors.push({
    key: 'volume',
    label: 'Game Volume',
    score: Math.round(volumeScore),
    weight: 0.15,
    weighted: volAvail ? volumeScore * 0.15 : 0,
    description: `${gameCount} games analyzed`,
    available: volAvail,
  });

  // 4. Opening diversity (weight 0.15)
  const whiteCount = report.whiteOpenings?.length ?? 0;
  const blackCount = report.blackDefenses?.length ?? 0;
  const totalOpenings = whiteCount + blackCount;
  const divAvail = totalOpenings > 0;
  const diversityScore = divAvail
    ? Math.min(100, (totalOpenings / 12) * 100)
    : 0;
  factors.push({
    key: 'diversity',
    label: 'Opening Variability',
    score: Math.round(diversityScore),
    weight: 0.15,
    weighted: divAvail ? diversityScore * 0.15 : 0,
    description: `${totalOpenings} distinct openings across both colors`,
    available: divAvail,
  });

  // 5. Endgame accuracy / engine accuracy (weight 0.15)
  const accAvail =
    report.engineStats?.endgameAccuracy != null &&
    report.engineStats.endgameAccuracy > 0;
  const accScore = accAvail ? report.engineStats!.endgameAccuracy : 0;
  factors.push({
    key: 'accuracy',
    label: 'Endgame Accuracy',
    score: Math.round(accScore),
    weight: 0.15,
    weighted: accAvail ? accScore * 0.15 : 0,
    description: accAvail
      ? `${Math.round(accScore)}% accuracy in endgame positions`
      : 'Requires Stockfish engine analysis',
    available: accAvail,
  });

  // Normalize across available factors
  const totalWeight = factors
    .filter((f) => f.available)
    .reduce((s, f) => s + f.weight, 0);
  const rawScore = factors.reduce((s, f) => s + f.weighted, 0);
  const finalScore =
    totalWeight > 0 ? Math.round(Math.min(100, rawScore / totalWeight)) : 0;

  return {
    score: finalScore,
    ...getThreatTier(finalScore),
    factors,
  };
}

function getThreatTier(
  score: number,
): { label: string; color: string; bgColor: string; borderColor: string } {
  if (score >= 81)
    return {
      label: 'Critical',
      color: 'text-red-400',
      bgColor: 'bg-red-500/15',
      borderColor: 'border-red-500/30',
    };
  if (score >= 61)
    return {
      label: 'High Threat',
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/15',
      borderColor: 'border-orange-500/30',
    };
  if (score >= 31)
    return {
      label: 'Moderate',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/15',
      borderColor: 'border-amber-500/30',
    };
  return {
    label: 'Low Threat',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/15',
    borderColor: 'border-emerald-500/30',
  };
}
