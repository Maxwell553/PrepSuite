/** Map raw time control string to speed category for aggregation (avoids duplicate Bullet/Blitz rows). */
export function getSpeedCategory(tc: string | undefined, source?: string): string {
  const src = (source || '').toLowerCase();
  if (src === 'otb') return 'classical';
  const s = (tc || '').toLowerCase().trim();
  if (s.includes('correspondence')) return 'correspondence';
  if (s.includes('bullet')) return 'bullet';
  if (s.includes('blitz')) return 'blitz';
  if (s.includes('rapid')) return 'rapid';
  if (s.includes('classical')) return 'classical';
  const numMatch = s.match(/(\d+)/);
  if (!numMatch) return 'unknown';
  const num = parseInt(numMatch[1], 10);
  const baseSeconds = num >= 60 && num <= 3600 ? num : num * 60;
  if (baseSeconds < 180) return 'bullet';
  if (baseSeconds < 600) return 'blitz';
  if (baseSeconds < 3600) return 'rapid';
  return 'classical';
}

/** Get base seconds for sorting (longer = higher). Used to order time controls longest-first. */
export function getTimeControlSecondsForSort(tc: string | undefined): number {
  const s = (tc || '').trim().toLowerCase();
  if (!s) return 0;
  if (s.includes('correspondence')) return 86400; // 1 day
  if (s.includes('classical')) return 1800;
  if (s.includes('rapid')) return 600;
  if (s.includes('blitz')) return 180;
  if (s.includes('bullet')) return 60;
  if (s === 'unknown') return 0;
  const numMatch = s.match(/(\d+)/);
  if (!numMatch) return 0;
  const num = parseInt(numMatch[1], 10);
  return num >= 60 && num <= 3600 ? num : num * 60;
}

/** Format timeControl for display: "180" -> "3 min", "180+2" -> "3+2", "bullet" -> "Bullet" */
export function formatTimeControlForDisplay(tc: string | undefined): string {
  const s = (tc || '').trim();
  if (!s) return '—';
  const lower = s.toLowerCase();
  if (lower.includes('correspondence')) return 'Correspondence';
  if (lower.includes('bullet')) return 'Bullet';
  if (lower.includes('blitz')) return 'Blitz';
  if (lower.includes('rapid')) return 'Rapid';
  if (lower.includes('classical')) return 'Classical';
  if (lower === 'unknown') return 'Unknown';
  const numMatch = s.match(/(\d+)/);
  const incMatch = s.match(/\d+\+(\d+)/);
  if (!numMatch) return s;
  const num = parseInt(numMatch[1], 10);
  // Lichess uses seconds (60, 180, 300, 600); Chess.com sometimes uses minutes (1, 3, 5, 10)
  const baseSeconds = num >= 60 && num <= 3600 ? num : num * 60;
  const minutes = Math.round(baseSeconds / 60);
  const increment = incMatch ? parseInt(incMatch[1], 10) : null;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const hrStr = hours > 0 ? `${hours}h ` : '';
    return increment != null ? `${hrStr}${mins}+${increment}` : `${hrStr}${mins} min`;
  }
  return increment != null ? `${minutes}+${increment}` : `${minutes} min`;
}
