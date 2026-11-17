import { expect, it } from 'vitest';
import hook from '../../../rubrics/hook/1.0.0.json' with { type: 'json' };
import lock from '../../../rubrics/lock.json' with { type: 'json' };
import { lockedRubrics } from './rubrics.ts';

const released = { 'hook/1.0.0.json': hook };
const hookLock = { 'hook/1.0.0.json': lock['hook/1.0.0.json'] };

it('accepts a released rubric that matches its hash', () => expect(lockedRubrics(released, hookLock)).toEqual([hook]));

it('refuses an edited released rubric', () => {
  const edited = structuredClone(hook);
  edited.flagPenalties[0] = { flag: 'hook-shell-command', points: 5 };
  expect(() => lockedRubrics({ 'hook/1.0.0.json': edited }, hookLock)).toThrow(
    'rubrics/hook/1.0.0.json differs from its released version',
  );
});

it('refuses a rubric missing from the lock', () =>
  expect(() => lockedRubrics(released, {})).toThrow('rubrics/hook/1.0.0.json is not in the lock'));

it('refuses a removed released rubric', () =>
  expect(() => lockedRubrics({}, hookLock)).toThrow('rubrics/hook/1.0.0.json is in the lock but not released'));

it('refuses a rubric filed under another version', () =>
  expect(() => lockedRubrics({ 'hook/1.1.0.json': hook }, { 'hook/1.1.0.json': hookLock['hook/1.0.0.json'] })).toThrow(
    'rubrics/hook/1.1.0.json holds another kind or version',
  ));
