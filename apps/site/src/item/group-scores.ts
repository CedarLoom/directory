import type { ItemRecord, Rubric } from '../data-types.ts';

type Group = Rubric['signals'][number]['group'];
type Part = NonNullable<ItemRecord['score']>['parts'][number];

export interface GroupScore {
  group: Group;
  points: number;
  max: number;
  /** The ids of the group's signals, in rubric order. */
  signals: string[];
}

/** The points of a score summed per rubric group, in the order the rubric first names each group. */
export function groupScores(rubric: Rubric, parts: readonly Part[]): GroupScore[] {
  const groups = new Map<Group, GroupScore>();
  for (const { id, group, max } of rubric.signals) {
    const part = parts.find(({ signal }) => signal === id);
    // The record and the rubric are separate files; a score of another rubric would show wrong groups.
    if (part === undefined) throw new Error(`The score has no part for signal ${id} of rubric ${rubric.version}`);
    const entry = groups.get(group) ?? { group, points: 0, max: 0, signals: [] };
    groups.set(group, {
      ...entry,
      points: entry.points + part.points,
      max: entry.max + max,
      signals: [...entry.signals, id],
    });
  }
  return [...groups.values()];
}
