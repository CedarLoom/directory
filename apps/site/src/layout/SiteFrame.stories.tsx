import type { Meta, StoryObj } from '@storybook/react-vite';
import { SiteFooter } from './SiteFooter.tsx';
import { SiteHeader } from './SiteHeader.tsx';

function SiteFrame() {
  return (
    <>
      <SiteHeader />
      <main id="main" />
      <SiteFooter />
    </>
  );
}

const meta = { component: SiteFrame } satisfies Meta<typeof SiteFrame>;

export default meta;

export const HeaderAndFooter: StoryObj<typeof meta> = {};
