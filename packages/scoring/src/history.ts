import type { HistoryFile } from '@directory/contracts';
import type { Score } from './score.ts';

type Entry = HistoryFile['entries'][number];

/**
 * The entries with one added for `date` when the rounded total or the rubric version differs from the last entry. A
 * later run on the same date replaces that date's entry, so each date has one.
 */
export function nextHistory(entries: readonly Entry[], score: Score, date: string): readonly Entry[] {
  const entry = { date, rubric: score.rubric.version, total: Math.round(score.total) };
  const same = (other: Entry | undefined) => other?.total === entry.total && other.rubric === entry.rubric;
  const kept = entries.at(-1)?.date === date ? entries.slice(0, -1) : entries;
  return same(kept.at(-1)) ? kept : [...kept, entry];
}
