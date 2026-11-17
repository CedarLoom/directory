import type { Rubric } from '@directory/contracts';

type Signal = Rubric['signals'][number];
type Scale = Signal['scale'];
type Flag = Rubric['flagPenalties'][number]['flag'];

/** The parts of a record the scorer reads; every record contract has them. */
export interface Scorable {
  kind: Rubric['kind'];
  license: {
    spdx?: string | undefined;
    source?: string | undefined;
    class: 'permissive' | 'copyleft' | 'source-available' | 'none';
    withheld?: true | undefined;
  };
  maintenance?: { pushedAt: string; recentCommits: 'none' | '1-4' | '5+'; archived: boolean } | undefined;
  signals: Readonly<Record<string, number | boolean>>;
  flags: readonly Flag[];
}

export interface Score {
  rubric: { kind: Rubric['kind']; version: string };
  total: number;
  parts: { signal: string; points: number; max: number }[];
}

interface Context {
  record: Scorable;
  rubric: Rubric;
  signal: Signal;
  /** The run date as milliseconds since the epoch. */
  now: number;
}

const day = 86_400_000;

// Points are kept in hundredths, so a total is the same on every platform and run.
function hundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(share: number): number {
  return Math.min(1, Math.max(0, share));
}

function recordSignal(record: Scorable, id: string): number | boolean {
  const value = record.signals[id];
  if (value === undefined) throw new Error(`The ${record.kind} record has no signal ${id}`);
  return value;
}

function signalValue({ record, signal }: Context): number | boolean {
  return recordSignal(record, signal.id);
}

/** A signal without a gate, or one whose gate signal is true or above 0, such as an item with a body. */
function gateOpen({ record, signal }: Context): boolean {
  if (signal.gate === undefined) return true;
  const value = recordSignal(record, signal.gate);
  return value === true || (typeof value === 'number' && value > 0);
}

function numberSignal(context: Context): number {
  const value = signalValue(context);
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`Signal ${context.signal.id} is not a finite number`);
  return value;
}

function pushAgeShare(steps: { days: number; share: number }[], { record, now }: Context): number {
  if (record.maintenance === undefined) return 0;
  const days = Math.floor((now - Date.parse(record.maintenance.pushedAt)) / day);
  return steps.find((step) => days <= step.days)?.share ?? 0;
}

function flagsShare({ record, rubric, signal }: Context): number {
  const penalty = rubric.flagPenalties
    .filter(({ flag }) => record.flags.includes(flag))
    .reduce((sum, { points }) => sum + points, 0);
  return clamp((signal.max - penalty) / signal.max);
}

function licenseLevel({ license }: Scorable): keyof Extract<Scale, { type: 'license' }>['levels'] {
  // Class `none` with a source: the item states a license that no SPDX id names or whose class is not known.
  return license.class === 'none' && license.source !== undefined && license.withheld !== true
    ? 'custom'
    : license.class;
}

/** The share of a scale that reads the record's own signal value. */
function signalShare(scale: Extract<Scale, { type: 'present' | 'linear' | 'within' }>, context: Context): number {
  if (scale.type === 'present') return signalValue(context) === true ? 1 : 0;
  if (scale.type === 'linear') return clamp((numberSignal(context) - scale.zero) / (scale.full - scale.zero));
  const value = numberSignal(context);
  return value >= scale.min && value <= (scale.max ?? Number.POSITIVE_INFINITY) ? 1 : 0;
}

function shareOf(scale: Scale, context: Context): number {
  const { maintenance } = context.record;
  if (scale.type === 'push-age') return pushAgeShare(scale.steps, context);
  if (scale.type === 'recent-commits') return maintenance === undefined ? 0 : scale.levels[maintenance.recentCommits];
  if (scale.type === 'license') return scale.levels[licenseLevel(context.record)];
  if (scale.type === 'flags') return flagsShare(context);
  return signalShare(scale, context);
}

/**
 * Scores a record with a rubric of its kind. `now` is the run date as `YYYY-MM-DD`; the score depends on it only through
 * the push-age steps, so a later date changes the score only when the age crosses a step.
 */
export function score(record: Scorable, rubric: Rubric, now: string): Score {
  if (record.kind !== rubric.kind) throw new Error(`A ${rubric.kind} rubric cannot score a ${record.kind} record`);
  const time = Date.parse(`${now}T00:00:00Z`);
  if (Number.isNaN(time)) throw new RangeError(`Not a run date: ${now}`);
  const archived = record.maintenance?.archived === true;
  const parts = rubric.signals.map((signal) => {
    const context = { record, rubric, signal, now: time };
    const share =
      (archived && signal.group === 'maintenance') || !gateOpen(context) ? 0 : shareOf(signal.scale, context);
    return { signal: signal.id, points: hundredths(signal.max * share), max: signal.max };
  });
  return {
    rubric: { kind: rubric.kind, version: rubric.version },
    total: hundredths(parts.reduce((sum, { points }) => sum + points, 0)),
    parts,
  };
}
