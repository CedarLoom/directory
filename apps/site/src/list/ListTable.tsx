import { Trans } from '@lingui/react/macro';
import { Table, UnstyledButton } from '@mantine/core';
import { type SortingState, useTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useRef } from 'react';
import type { Row } from '../data-types.ts';
import { type ColumnId, columnIds } from '../list-search.ts';
import { columns, numericColumns } from './columns.tsx';
import { features, pageSize } from './table-features.ts';
import { useGridKeys } from './use-grid-keys.ts';

interface TableView {
  sort: SortingState[number];
  cols: readonly ColumnId[];
  page: number;
}

interface Props extends TableView {
  rows: Row[];
  caption: string;
  onSortChange: (sort: SortingState[number]) => void;
}

const sortIcons = { asc: ArrowUp, desc: ArrowDown, none: ArrowUpDown };
const ariaSort = { asc: 'ascending', desc: 'descending', none: undefined } as const;

function useListTable({ rows, sort, cols, page, onSortChange }: Omit<Props, 'caption'>) {
  return useTable({
    features,
    columns,
    data: rows,
    getRowId: (row) => row.id,
    state: {
      sorting: [sort],
      columnVisibility: Object.fromEntries(columnIds.map((id) => [id, cols.includes(id)])),
      pagination: { pageIndex: page - 1, pageSize },
    },
    enableSortingRemoval: false,
    onSortingChange: (updater) => {
      const [next] = typeof updater === 'function' ? updater([sort]) : updater;
      if (next !== undefined) onSortChange(next);
    },
  });
}

function NoMatch() {
  return (
    <p>
      <Trans id="list.empty">No item matches these filters.</Trans>
    </p>
  );
}

/** The list as a grid over rows already filtered: sorting, the chosen columns and one page of 50 rows. */
export function ListTable({ caption, ...view }: Props) {
  const ref = useRef<HTMLTableElement>(null);
  const grid = useGridKeys(ref);
  const table = useListTable(view);
  return (
    <>
      <Table.ScrollContainer minWidth={0}>
        <Table ref={ref} role="grid" highlightOnHover onKeyDown={grid.onKeyDown} onFocus={grid.onFocus}>
          <Table.Caption>{caption}</Table.Caption>
          <Table.Thead>
            {table.getHeaderGroups().map((group) => (
              <Table.Tr key={group.id}>
                {group.headers.map((header) => {
                  const direction = header.column.getIsSorted() || 'none';
                  const Icon = sortIcons[direction];
                  return (
                    <Table.Th
                      key={header.id}
                      aria-sort={ariaSort[direction]}
                      data-numeric={numericColumns.has(header.column.id) || undefined}
                    >
                      <UnstyledButton onClick={header.column.getToggleSortingHandler()} className="sort-button">
                        <table.FlexRender header={header} />
                        <Icon aria-hidden size="1em" />
                      </UnstyledButton>
                    </Table.Th>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {table.getRowModel().rows.map((row) => (
              <Table.Tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <Table.Td key={cell.id} data-numeric={numericColumns.has(cell.column.id) || undefined}>
                    <table.FlexRender cell={cell} />
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {view.rows.length === 0 && <NoMatch />}
    </>
  );
}
