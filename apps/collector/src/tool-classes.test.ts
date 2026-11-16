import { expect, it } from 'vitest';
import { toolClasses } from './tool-classes.ts';

it('classes a tool named like an object property as other', () => {
  expect(toolClasses('constructor, toString')).toEqual(['other']);
});
