import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Pagination, Stack, Text, Title } from '@mantine/core';
import type { SortingState } from '@tanstack/react-table';
import { type ReactNode, useMemo } from 'react';
import type { Row } from '../data-types.ts';
import { filterRows } from '../filter-rows.ts';
import type { ColumnId, ListFilters as Filters, ListSearch } from '../list-search.ts';
import { ColumnChooser } from './ColumnChooser.tsx';
import { ListFilters } from './ListFilters.tsx';
import { ListTable } from './ListTable.tsx';
import { pageSize } from './table-features.ts';

interface Props {
  title: ReactNode;
  rows: readonly Row[];
  /** False on a kind's own list, whose rows are all of one kind. */
  showKinds: boolean;
  runAt: string;
  search: ListSearch;
  /** Sets search parameters; `replace` keeps typing in the search field out of the history. */
  onSearchChange: (patch: Partial<ListSearch>, replace: boolean) => void;
}

const pageControlLabels = {
  first: msg({ id: 'list.firstPage', message: 'First page' }),
  previous: msg({ id: 'list.previousPage', message: 'Previous page' }),
  next: msg({ id: 'list.nextPage', message: 'Next page' }),
  last: msg({ id: 'list.lastPage', message: 'Last page' }),
};

function parseSort(sort: string): SortingState[number] {
  const [id = 'score', direction] = sort.split('.');
  return { id, desc: direction === 'desc' };
}

/** A list page: filters, column choice, the table and its pages, all held in the search parameters. */
export function ListPage({ title, rows, showKinds, runAt, search, onSearchChange }: Props) {
  const { t, i18n } = useLingui();
  const tags = useMemo(() => [...new Set(rows.flatMap((row) => row.tags))].toSorted(), [rows]);
  const shown = useMemo(() => filterRows(rows, search, runAt), [rows, search, runAt]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const page = Math.min(search.page, pages);
  // A filter change returns to the first page.
  const onFilterChange = (patch: Partial<Filters>) => onSearchChange({ ...patch, page: 1 }, 'q' in patch);
  return (
    <Stack gap="md">
      <Title order={1}>{title}</Title>
      <Text c="dimmed" role="status">
        <Trans id="list.count">
          {shown.length} of {rows.length} items
        </Trans>
      </Text>
      <details className="disclosure">
        <summary>
          <Trans id="list.filters">Filters</Trans>
        </summary>
        <ListFilters filters={search} tags={tags} showKinds={showKinds} onChange={onFilterChange} />
      </details>
      <details className="disclosure">
        <summary>
          <Trans id="list.columns">Columns</Trans>
        </summary>
        <ColumnChooser value={search.cols} onChange={(cols: ColumnId[]) => onSearchChange({ cols }, false)} />
      </details>
      <ListTable
        rows={shown}
        caption={t({ id: 'list.caption', message: 'Items, sorted by the chosen column' })}
        sort={parseSort(search.sort)}
        cols={search.cols}
        page={page}
        onSortChange={({ id, desc }) => onSearchChange({ sort: `${id}.${desc ? 'desc' : 'asc'}` }, false)}
      />
      {pages > 1 && (
        <Pagination
          total={pages}
          value={page}
          classNames={{ control: 'page-link' }}
          onChange={(next) => onSearchChange({ page: next }, false)}
          getControlProps={(control) => ({ 'aria-label': i18n._(pageControlLabels[control]) })}
          getItemProps={(item) => ({ 'aria-label': t({ id: 'list.page', message: `Page ${item}` }) })}
        />
      )}
    </Stack>
  );
}
