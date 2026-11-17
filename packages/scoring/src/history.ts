import type { HistoryFile } from '@directory/contracts';
import type { Score } from './score.ts';

type Entry = HistoryFile['entries'][number];

/** The entries with one added for `date` when the rounded total or the rubric version differs from the last entry. */
export function nextHistory(entries: readonly Entry[], score: Score, date: string): readonly Entry[] {
  const total = Math.round(score.total);
  const last = entries.at(-1);
  if (last?.total === total && last.rubric === score.rubric.version) return entries;
  return [...entries, { date, rubric: score.rubric.version, total }];
}
