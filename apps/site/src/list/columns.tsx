import type { MessageDescriptor } from '@lingui/core';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { Anchor } from '@mantine/core';
import { createColumnHelper } from '@tanstack/react-table';
import { createLink } from '@tanstack/react-router';
import type { Row } from '../data-types.ts';
import { columnLabels, fitLabels, kindLabels, licenseClassLabels } from '../labels.ts';
import type { ColumnId } from '../list-search.ts';
import { features } from './table-features.ts';

const helper = createColumnHelper<typeof features, Row>();
const AnchorLink = createLink(Anchor);

function NameCell({ row }: { row: Row }) {
  return (
    <AnchorLink to="/$kind/$id/" params={{ kind: row.kind, id: row.id }}>
      {row.name}
    </AnchorLink>
  );
}

function NumberCell({ value, signed = false }: { value: number | undefined; signed?: boolean }) {
  const { i18n } = useLingui();
  if (value === undefined) return <Trans id="list.notMeasured">not measured</Trans>;
  return i18n.number(value, { maximumFractionDigits: 1, signDisplay: signed ? 'exceptZero' : 'auto' });
}

function DateCell({ value }: { value: string | undefined }) {
  const { i18n } = useLingui();
  if (value === undefined) return <Trans id="list.notKnown">not known</Trans>;
  return i18n.date(value, { dateStyle: 'medium', timeZone: 'UTC' });
}

function Label({ descriptor }: { descriptor: MessageDescriptor }) {
  return useLingui()._(descriptor);
}

// Numbers sort high first; an item without the value sorts last in both directions.
const numeric = { sortFn: 'basic', sortDescFirst: true, sortUndefined: 'last' } as const;

/** The list columns by id; column ids are the values of the search parameters `sort` and `cols`. */
export const columns = helper.columns([
  helper.accessor('name', {
    header: () => <Label descriptor={columnLabels.name} />,
    cell: ({ row }) => <NameCell row={row.original} />,
    sortFn: 'text',
  }),
  helper.accessor('kind', {
    header: () => <Label descriptor={columnLabels.kind} />,
    cell: ({ getValue }) => <Label descriptor={kindLabels[getValue()]} />,
    sortFn: 'text',
  }),
  helper.accessor('score', {
    header: () => <Label descriptor={columnLabels.score} />,
    cell: ({ getValue }) => <NumberCell value={getValue()} />,
    ...numeric,
  }),
  helper.accessor('stars', {
    header: () => <Label descriptor={columnLabels.stars} />,
    cell: ({ getValue }) => <NumberCell value={getValue()} />,
    ...numeric,
  }),
  helper.accessor('starsGained30d', {
    header: () => <Label descriptor={columnLabels.starsGained30d} />,
    cell: ({ getValue }) => <NumberCell value={getValue()} signed />,
    ...numeric,
  }),
  helper.accessor('licenseClass', {
    header: () => <Label descriptor={columnLabels.licenseClass} />,
    cell: ({ getValue }) => <Label descriptor={licenseClassLabels[getValue()]} />,
    sortFn: 'text',
  }),
  helper.accessor('fit', {
    header: () => <Label descriptor={columnLabels.fit} />,
    cell: ({ getValue }) => <Label descriptor={fitLabels[getValue()]} />,
    sortFn: 'text',
  }),
  helper.accessor('listedOfficial', {
    header: () => <Label descriptor={columnLabels.listedOfficial} />,
    cell: ({ getValue }) =>
      getValue() ? <Trans id="list.listed">listed</Trans> : <Trans id="list.notListed">not listed</Trans>,
    sortFn: 'basic',
    sortDescFirst: true,
  }),
  helper.accessor('pushedAt', {
    header: () => <Label descriptor={columnLabels.pushedAt} />,
    cell: ({ getValue }) => <DateCell value={getValue()} />,
    sortFn: 'text',
    sortDescFirst: true,
    sortUndefined: 'last',
  }),
  helper.accessor('flagCount', {
    header: () => <Label descriptor={columnLabels.flagCount} />,
    cell: ({ getValue }) => <NumberCell value={getValue()} />,
    sortFn: 'basic',
  }),
]);

export const numericColumns: ReadonlySet<string> = new Set<ColumnId>(['score', 'stars', 'starsGained30d', 'flagCount']);
