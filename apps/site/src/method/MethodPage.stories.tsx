import type { Meta, StoryObj } from '@storybook/react-vite';
import { runMeta } from '../meta-data.ts';
import { MethodPage } from './MethodPage.tsx';
import { loadRubrics } from './rubrics.ts';

const meta = {
  component: MethodPage,
  args: { meta: runMeta, rubrics: await loadRubrics() },
} satisfies Meta<typeof MethodPage>;

export default meta;

export const Method: StoryObj<typeof meta> = {};
