import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { rows } from '../index-data.ts';
import { type ListSearch, listSearch } from '../list-search.ts';
import { runMeta } from '../meta-data.ts';
import { ListPage } from './ListPage.tsx';

// The route keeps the search in the URL; a story keeps it in state.
function StatefulListPage({ initial, showKinds }: { initial: ListSearch; showKinds: boolean }) {
  const [search, setSearch] = useState(initial);
  return (
    <ListPage
      title="Directory"
      rows={rows}
      showKinds={showKinds}
      runAt={runMeta.runAt}
      search={search}
      onSearchChange={(patch) => setSearch((previous) => ({ ...previous, ...patch }))}
    />
  );
}

const meta = {
  component: StatefulListPage,
  args: { initial: listSearch.parse({}), showKinds: true },
} satisfies Meta<typeof StatefulListPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllItems: Story = {};

export const StarRangeSortedByGain: Story = {
  args: { initial: listSearch.parse({ starsMin: 100, starsMax: 5000, gainMin: 10, sort: 'starsGained30d.desc' }) },
};

export const EveryColumn: Story = {
  args: {
    initial: listSearch.parse({
      cols: [
        'name',
        'kind',
        'score',
        'stars',
        'starsGained30d',
        'licenseClass',
        'listedOfficial',
        'pushedAt',
        'flagCount',
      ],
    }),
  },
};

export const NoMatch: Story = { args: { initial: listSearch.parse({ q: 'no item has this name' }) } };

export const OneKind: Story = { args: { showKinds: false } };
