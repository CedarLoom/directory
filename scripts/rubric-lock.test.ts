import { expect, it } from 'vitest';
import { lockEdits } from './rubric-lock.ts';

const hook = 'a'.repeat(64);
const skill = 'b'.repeat(64);

it('accepts a lock that adds a version and keeps the released ones', () =>
  expect(lockEdits({ 'hook/1.0.0.json': hook }, { 'hook/1.0.0.json': hook, 'hook/1.1.0.json': skill })).toEqual([]));

it('refuses a changed and a removed released entry', () =>
  expect(lockEdits({ 'hook/1.0.0.json': hook, 'skill/1.0.0.json': skill }, { 'hook/1.0.0.json': skill })).toEqual([
    `rubrics/hook/1.0.0.json: hash changed from ${hook} to ${skill}`,
    'rubrics/skill/1.0.0.json: removed from the lock',
  ]));
