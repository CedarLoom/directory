/** The named bands of a score of 0 to 100, highest first. */
export const scoreBands = [
  // The quarters of 100: the share steps 1, 0.75, 0.5 and 0.25 of the rubrics' push-age scale.
  { band: 'high', from: 75 },
  { band: 'medium', from: 50 },
  { band: 'low', from: 25 },
] as const;

export type ScoreBand = (typeof scoreBands)[number]['band'] | 'very-low';

/** The band a score falls in; a score below every band's lower edge is very low. */
export function scoreBand(score: number): ScoreBand {
  return scoreBands.find(({ from }) => score >= from)?.band ?? 'very-low';
}
