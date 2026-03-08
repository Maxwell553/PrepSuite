/**
 * Preparatory content matching: maps opening names/weaknesses to curated learning resources.
 * Used when the report identifies specific opening weaknesses.
 */

export interface PrepResource {
  title: string;
  url: string;
  type: 'youtube' | 'article' | 'course';
}

/** Pattern → resources. Keys are lowercase substrings to match in weakness text. */
const OPENING_RESOURCES: Record<string, PrepResource[]> = {
  'caro-kann': [
    { title: 'Caro-Kann Advance - GM Daniel King', url: 'https://www.youtube.com/results?search_query=caro-kann+advance+white', type: 'youtube' },
    { title: 'Caro-Kann - Chess.com Guide', url: 'https://www.chess.com/openings/Caro-Kann-Defense', type: 'article' },
  ],
  'sicilian': [
    { title: 'Sicilian Defense - GM Hikaru', url: 'https://www.youtube.com/results?search_query=sicilian+defense+white+preparation', type: 'youtube' },
    { title: 'Sicilian - Chess.com', url: 'https://www.chess.com/openings/Sicilian-Defense', type: 'article' },
  ],
  'french': [
    { title: 'French Defense - White Preparation', url: 'https://www.youtube.com/results?search_query=french+defense+white+advance', type: 'youtube' },
    { title: 'French Defense - Lichess', url: 'https://lichess.org/study/french-defense', type: 'article' },
  ],
  'ruy lopez': [
    { title: 'Ruy Lopez - GM Preparation', url: 'https://www.youtube.com/results?search_query=ruy+lopez+white+preparation', type: 'youtube' },
    { title: 'Ruy Lopez - Chess.com', url: 'https://www.chess.com/openings/Ruy-Lopez', type: 'article' },
  ],
  'italian': [
    { title: 'Italian Game - White Repertoire', url: 'https://www.youtube.com/results?search_query=italian+game+white+evans+gambit', type: 'youtube' },
    { title: 'Italian Game - Lichess', url: 'https://lichess.org/study/italian-game', type: 'article' },
  ],
  'english': [
    { title: 'English Opening - GM Analysis', url: 'https://www.youtube.com/results?search_query=english+opening+repertoire', type: 'youtube' },
    { title: 'English - Chess.com', url: 'https://www.chess.com/openings/English-Opening', type: 'article' },
  ],
  'queen\'s pawn': [
    { title: 'Queen\'s Pawn - London System', url: 'https://www.youtube.com/results?search_query=london+system+white', type: 'youtube' },
    { title: 'Queen\'s Pawn - Chess.com', url: 'https://www.chess.com/openings/Queens-Pawn-Game', type: 'article' },
  ],
  'nimzo-indian': [
    { title: 'Nimzo-Indian - White Repertoire', url: 'https://www.youtube.com/results?search_query=nimzo+indian+white+rubinstein', type: 'youtube' },
    { title: 'Nimzo-Indian - Lichess', url: 'https://lichess.org/study/nimzo-indian', type: 'article' },
  ],
  'queen\'s indian': [
    { title: 'Queen\'s Indian - White Prep', url: 'https://www.youtube.com/results?search_query=queens+indian+defense+white', type: 'youtube' },
    { title: 'Queen\'s Indian - Chess.com', url: 'https://www.chess.com/openings/Queens-Indian-Defense', type: 'article' },
  ],
  'king\'s indian': [
    { title: 'King\'s Indian - White Attack', url: 'https://www.youtube.com/results?search_query=kings+indian+attack+white', type: 'youtube' },
    { title: 'King\'s Indian - Chess.com', url: 'https://www.chess.com/openings/Kings-Indian-Defense', type: 'article' },
  ],
  'dutch': [
    { title: 'Dutch Defense - White Prep', url: 'https://www.youtube.com/results?search_query=dutch+defense+white+stonewall', type: 'youtube' },
    { title: 'Dutch - Chess.com', url: 'https://www.chess.com/openings/Dutch-Defense', type: 'article' },
  ],
  'modern': [
    { title: 'Modern Defense - White Lines', url: 'https://www.youtube.com/results?search_query=modern+defense+white+preparation', type: 'youtube' },
    { title: 'Modern - Chess.com', url: 'https://www.chess.com/openings/Modern-Defense', type: 'article' },
  ],
  'benoni': [
    { title: 'Benoni - White Attack', url: 'https://www.youtube.com/results?search_query=benoni+defense+white', type: 'youtube' },
    { title: 'Benoni - Chess.com', url: 'https://www.chess.com/openings/Benoni-Defense', type: 'article' },
  ],
  'pirc': [
    { title: 'Pirc Defense - White Repertoire', url: 'https://www.youtube.com/results?search_query=pirc+defense+white+austrian', type: 'youtube' },
    { title: 'Pirc - Chess.com', url: 'https://www.chess.com/openings/Pirc-Defense', type: 'article' },
  ],
  'scandinavian': [
    { title: 'Scandinavian - White Prep', url: 'https://www.youtube.com/results?search_query=scandinavian+defense+white', type: 'youtube' },
    { title: 'Scandinavian - Chess.com', url: 'https://www.chess.com/openings/Scandinavian-Defense', type: 'article' },
  ],
};

/** Extract opening-related resources from report weakness text. */
export function getPrepResourcesForReport(report: {
  weaknesses?: string[];
  specificVulnerability?: string;
  tacticalRecommendation?: string;
}): PrepResource[] {
  const text = [
    ...(report.weaknesses || []),
    report.specificVulnerability || '',
    report.tacticalRecommendation || '',
  ].join(' ').toLowerCase();

  const seen = new Set<string>();
  const resources: PrepResource[] = [];

  for (const [pattern, resList] of Object.entries(OPENING_RESOURCES)) {
    if (text.includes(pattern)) {
      for (const r of resList) {
        if (!seen.has(r.url)) {
          seen.add(r.url);
          resources.push(r);
        }
      }
    }
  }

  return resources.slice(0, 6); // Max 6 to avoid clutter
}
