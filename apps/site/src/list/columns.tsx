import type { MessageDescriptor } from '@lingui/core';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { Anchor } from '@mantine/core';
import { createColumnHelper } from '@tanstack/react-table';
import { createLink } from '@tanstack/react-router';
import type { Row } from '../data-types.ts';
import { columnLabels, kindLabels, licenseClassLabels } from '../labels.ts';
import type { ColumnId } from '../list-search.ts';
import { LastPush, OfficialListing, SafetyLine, ScoreBadge } from '../glance/GlanceValues.tsx';
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

function Label({ descriptor }: { descriptor: MessageDescriptor }) {
  return useLingui()._(descriptor);
}

// Numbers sort high first; an item without the value sorts last in both directions.
const numeric = { sortFn: 'basic', sortDescFirst: true, sortUndefined: 'last' } as const;

/** The list columns by id; column ids are the values of the search parameters `sort` and `cols`. */
export const columns = helper.columns([
  helper.accessor('score', {
    header: () => <Label descriptor={columnLabels.score} />,
    cell: ({ getValue }) => <ScoreBadge score={getValue()} />,
    ...numeric,
  }),
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
  helper.accessor('licenseClass', {
    header: () => <Label descriptor={columnLabels.licenseClass} />,
    cell: ({ getValue }) => <Label descriptor={licenseClassLabels[getValue()]} />,
    sortFn: 'text',
  }),
  helper.accessor('pushedAt', {
    header: () => <Label descriptor={columnLabels.pushedAt} />,
    cell: ({ getValue }) => <LastPush pushedAt={getValue()} />,
    sortFn: 'text',
    sortDescFirst: true,
    sortUndefined: 'last',
  }),
  helper.accessor('listedOfficial', {
    header: () => <Label descriptor={columnLabels.listedOfficial} />,
    cell: ({ getValue }) => <OfficialListing listed={getValue()} />,
    sortFn: 'basic',
    sortDescFirst: true,
  }),
  helper.accessor('flagCount', {
    header: () => <Label descriptor={columnLabels.flagCount} />,
    cell: ({ getValue }) => <SafetyLine flagCount={getValue()} />,
    sortFn: 'basic',
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
]);

export const numericColumns: ReadonlySet<string> = new Set<ColumnId>(['stars', 'starsGained30d']);
