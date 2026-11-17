import { Trans, useLingui } from '@lingui/react/macro';
import { Table, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import type { ItemRecord, PopularityFile } from '../data-types.ts';
import {
  fitLabels,
  kindLabels,
  licenseClassLabels,
  licenseSourceLabels,
  licenseWithoutId,
  recentCommitsLabels,
} from '../labels.ts';

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Table.Tr>
      <Table.Th scope="row">{label}</Table.Th>
      <Table.Td>{children}</Table.Td>
    </Table.Tr>
  );
}

function MaintenanceFacts({ maintenance }: { maintenance: NonNullable<ItemRecord['maintenance']> }) {
  const { i18n } = useLingui();
  const release = maintenance.latestRelease;
  return (
    <>
      <Fact label={<Trans id="item.lastPush">Last push</Trans>}>
        {i18n.date(maintenance.pushedAt, { dateStyle: 'medium', timeZone: 'UTC' })}
      </Fact>
      <Fact label={<Trans id="item.recentCommits">Commits in the last 90 days</Trans>}>
        {i18n._(recentCommitsLabels[maintenance.recentCommits])}
      </Fact>
      <Fact label={<Trans id="item.release">Latest release</Trans>}>
        {release === undefined ? (
          <Trans id="item.noRelease">none</Trans>
        ) : (
          `${release.tag} (${i18n.date(release.date, { dateStyle: 'medium', timeZone: 'UTC' })})`
        )}
      </Fact>
      {maintenance.archived && (
        <Fact label={<Trans id="item.archived">Archived</Trans>}>
          <Trans id="item.yes">yes</Trans>
        </Fact>
      )}
    </>
  );
}

/** The newest star count of the repository; the record holds only a pointer to it. */
function Stars({ popularity }: { popularity: PopularityFile | undefined }) {
  const { i18n } = useLingui();
  const latest = popularity?.snapshots.at(-1);
  if (latest === undefined) return <Trans id="item.notMeasured">not measured</Trans>;
  const stars = i18n.number(latest.stars);
  const date = i18n.date(latest.date, { dateStyle: 'medium', timeZone: 'UTC' });
  return (
    <Trans id="item.stars">
      {stars} stars on the whole repository, counted {date}
    </Trans>
  );
}

/** Kind, license, fit, popularity and maintenance of one item. */
export function ItemFacts({ record, popularity }: { record: ItemRecord; popularity: PopularityFile | undefined }) {
  const { i18n } = useLingui();
  const { spdx, source } = record.license;
  const licenseSource = i18n._(licenseSourceLabels[source ?? 'none']);
  return (
    <Table>
      <Table.Tbody>
        <Fact label={<Trans id="item.kind">Kind</Trans>}>{i18n._(kindLabels[record.kind])}</Fact>
        <Fact label={<Trans id="item.license">License</Trans>}>
          {spdx === undefined
            ? i18n._(licenseWithoutId(record.license))
            : `${spdx} (${i18n._(licenseClassLabels[record.license.class])})`}
          <Text size="sm" c="dimmed">
            <Trans id="item.licenseSource">Source: {licenseSource}</Trans>
          </Text>
        </Fact>
        <Fact label={<Trans id="item.fit">CedarLoom fit</Trans>}>{i18n._(fitLabels[record.cedarloomFit.label])}</Fact>
        <Fact label={<Trans id="item.popularity">Popularity</Trans>}>
          <Stars popularity={popularity} />
        </Fact>
        {record.listedIn.length > 0 && (
          <Fact label={<Trans id="item.listedIn">Listed in</Trans>}>{record.listedIn.join(', ')}</Fact>
        )}
        {record.tags.length > 0 && <Fact label={<Trans id="item.tags">Tags</Trans>}>{record.tags.join(', ')}</Fact>}
        {record.maintenance !== undefined && <MaintenanceFacts maintenance={record.maintenance} />}
      </Table.Tbody>
    </Table>
  );
}
