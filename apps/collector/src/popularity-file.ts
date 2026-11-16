import type { PopularityFile } from '@directory/contracts';

const dayMs = 86_400_000;

function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** The Monday of the date's ISO week. */
function weekStart(date: string): string {
  const time = Date.parse(date);
  const daysSinceMonday = (new Date(time).getUTCDay() + 6) % 7;
  return isoDate(time - daysSinceMonday * dayMs);
}

/**
 * The file with the run's star count: unchanged when the count equals the last snapshot, else one snapshot per week,
 * dated the Monday of the run's week, which a later run in the same week overwrites or, back at the count before, removes.
 */
export function withSnapshot(
  file: PopularityFile | undefined,
  id: string,
  stars: number,
  runDate: string,
): PopularityFile {
  const snapshots = file?.snapshots ?? [];
  const last = snapshots.at(-1);
  if (file !== undefined && last?.stars === stars) return file;
  const date = weekStart(runDate);
  const kept = last?.date === date ? snapshots.slice(0, -1) : snapshots;
  return { schemaVersion: 1, id, snapshots: kept.at(-1)?.stars === stars ? kept : [...kept, { date, stars }] };
}

/** Stars minus the newest snapshot 30 or more days before the run date; undefined while no snapshot is that old. */
export function starsGained30d(file: PopularityFile, stars: number, runDate: string): number | undefined {
  const cutoff = isoDate(Date.parse(runDate) - 30 * dayMs);
  const base = file.snapshots.findLast((snapshot) => snapshot.date <= cutoff);
  return base === undefined ? undefined : stars - base.stars;
}
