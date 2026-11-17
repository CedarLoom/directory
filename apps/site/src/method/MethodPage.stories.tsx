import type { Meta, StoryObj } from '@storybook/react-vite';
import { runMeta } from '../meta-data.ts';
import { MethodPage } from './MethodPage.tsx';

const meta = { component: MethodPage, args: { meta: runMeta } } satisfies Meta<typeof MethodPage>;

export default meta;

export const Method: StoryObj<typeof meta> = {};
