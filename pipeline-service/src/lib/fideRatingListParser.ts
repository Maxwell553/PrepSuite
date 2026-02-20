import fs from 'node:fs';
import path from 'node:path';
import type { FideProfile } from './types.js';

/** FIDE title codes (single/double letter) to full title */
const TITLE_MAP: Record<string, string> = {
  g: 'GM',
  wg: 'WGM',
  m: 'IM',
  wm: 'WIM',
  f: 'FM',
  wf: 'WFM',
  c: 'CM',
  wc: 'WCM',
  GM: 'GM',
  WGM: 'WGM',
  IM: 'IM',
  WIM: 'WIM',
  FM: 'FM',
  WFM: 'WFM',
  CM: 'CM',
  WCM: 'WCM',
  NM: 'NM',
  WNM: 'WNM',
};

export interface ParsedFidePlayer extends FideProfile {
  fideId: string;
}

interface ColumnDef {
  name: string;
  start: number;
  end: number;
}

/**
 * Parse FIDE standard rating list TXT (fixed-width format).
 * Header line defines column positions; data rows use same positions.
 */
export function parseFideRatingListTxt(content: string): ParsedFidePlayer[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0];
  const columns = parseHeaderColumns(header);

  const idCol = resolveIdColumn(columns);
  const nameCol = columns.find((c) => /^name$/i.test(c.name));
  const fedCol = columns.find((c) => /^fed$/i.test(c.name));
  const titCol = columns.find((c) => /^titl?$/i.test(c.name) && !/^wtit$/i.test(c.name));
  const bdayCol = columns.find((c) => /^b-?day|born$/i.test(c.name));
  const ratingCol = columns.find(
    (c) => /^[A-Z]{3}\d{2}$/.test(c.name) || /^std|srtng|rtg$/i.test(c.name),
  );

  if (!idCol || !nameCol || !fedCol) {
    throw new Error('FIDE TXT: missing required columns (ID Number, Name, Fed)');
  }

  const players: ParsedFidePlayer[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^\s*FOA\s*$/i.test(line.trim())) continue;

    const fideId = sliceCol(line, idCol).trim();
    if (!fideId || !/^\d+$/.test(fideId)) continue;

    const name = sliceCol(line, nameCol).trim();
    if (!name) continue;

    const federation = sliceCol(line, fedCol).trim();
    const titleRaw = titCol ? sliceCol(line, titCol).trim() : '';
    const title = titleRaw ? (TITLE_MAP[titleRaw] ?? (titleRaw.length <= 3 ? titleRaw.toUpperCase() : '')) : '';
    const birthYear = bdayCol ? sliceCol(line, bdayCol).trim() : '';
    const ratingStr = ratingCol ? sliceCol(line, ratingCol).trim() : '';
    const rating = ratingStr && /^\d+$/.test(ratingStr) ? parseInt(ratingStr, 10) : 0;

    players.push({
      fideId,
      name,
      federation,
      birthYear: birthYear && /^\d{4}$/.test(birthYear) ? birthYear : '',
      rating,
      title: title && ['GM', 'IM', 'FM', 'CM', 'WGM', 'WIM', 'WFM', 'WCM', 'NM', 'WNM'].includes(title) ? title : '',
    });
  }

  return players;
}

function resolveIdColumn(columns: ColumnDef[]): ColumnDef {
  const idx = columns.findIndex((c) => /^id$/i.test(c.name));
  if (idx >= 0 && columns[idx + 1]?.name === 'Number') {
    return { name: 'ID Number', start: columns[idx].start, end: columns[idx + 1].end };
  }
  const fallback = columns.find((c) => /^id\s*number$/i.test(c.name.replace(/_/g, ' ')));
  if (fallback) return fallback;
  return columns[0];
}

function sliceCol(line: string, col: ColumnDef): string {
  const end = Math.min(col.end, line.length);
  return line.slice(col.start, end);
}

/** Find column start/end from header (tokens are where non-space starts after space) */
function parseHeaderColumns(header: string): ColumnDef[] {
  const columns: ColumnDef[] = [];
  let i = 0;
  let inToken = false;
  let tokenStart = 0;

  while (i <= header.length) {
    const c = header[i];
    const isSpace = c === ' ' || c === '\t' || i === header.length;

    if (isSpace) {
      if (inToken) {
        const name = header.slice(tokenStart, i).trim();
        if (name) {
          columns.push({
            name,
            start: tokenStart,
            end: i,
          });
        }
        inToken = false;
      }
    } else {
      if (!inToken) {
        tokenStart = i;
        inToken = true;
      }
    }
    i++;
  }

  // Extend each column's end to the next column's start (for fixed-width slicing)
  for (let j = 0; j < columns.length; j++) {
    columns[j].end = columns[j + 1]?.start ?? header.length;
  }

  return columns;
}

/**
 * Load and parse FIDE rating list from file path.
 * Path is relative to project root or absolute.
 */
export function loadFideRatingListFromFile(filePath: string): ParsedFidePlayer[] {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  const content = fs.readFileSync(resolved, 'utf-8');
  return parseFideRatingListTxt(content);
}
