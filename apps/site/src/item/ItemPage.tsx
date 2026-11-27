import { Trans, useLingui } from '@lingui/react/macro';
import { Group, List, Stack, Text, Title } from '@mantine/core';
import type { ItemRecord } from '../data-types.ts';
import type { Item } from '../item-data.ts';
import { flagLabels } from '../labels.ts';
import { ExternalLink } from '../layout/ExternalLink.tsx';
import { newIssueUrl } from '../new-issue-url.ts';
import { ItemFacts } from './ItemFacts.tsx';
import { ItemSummary } from './ItemSummary.tsx';
import { ScoreBreakdown } from './ScoreBreakdown.tsx';
import { ScoreHistory } from './ScoreHistory.tsx';
import { WhyScore } from './WhyScore.tsx';

function Links({ links }: { links: ItemRecord['links'] }) {
  return (
    <Group gap="md" className="link-row">
      {links.source !== undefined && (
        <ExternalLink href={links.source}>
          <Trans id="item.source">Source</Trans>
        </ExternalLink>
      )}
      {links.install !== undefined && (
        <ExternalLink href={links.install}>
          <Trans id="item.install">Install instructions</Trans>
        </ExternalLink>
      )}
      {links.registry !== undefined && (
        <ExternalLink href={links.registry}>
          <Trans id="item.registry">MCP Registry entry</Trans>
        </ExternalLink>
      )}
    </Group>
  );
}

function Flags({ flags }: { flags: ItemRecord['flags'] }) {
  const { i18n } = useLingui();
  return (
    <section aria-labelledby="flags-heading">
      <Title order={2} id="flags-heading">
        <Trans id="item.flagsHeading">Safety flags</Trans>
      </Title>
      <Text size="sm" c="dimmed">
        <Trans id="item.flagsNote">
          Flags point at patterns that need care. They are no audit: an item without flags is not proven safe.
        </Trans>
      </Text>
      {flags.length === 0 ? (
        <Text>
          <Trans id="item.noFlags">The collector raised no safety flag.</Trans>
        </Text>
      ) : (
        <List>
          {flags.map((flag) => (
            <List.Item key={flag}>{i18n._(flagLabels[flag])}</List.Item>
          ))}
        </List>
      )}
    </section>
  );
}

/** One item: its facts at a glance, why it has its score, links, all facts, score breakdown, flags and score history. */
export function ItemPage({ item, runAt }: { item: Item; runAt: string }) {
  const { i18n } = useLingui();
  const { record, history, popularity, rubric } = item;
  const changedAt = i18n.date(record.changedAt, { dateStyle: 'long', timeZone: 'UTC' });
  const runDate = i18n.date(runAt, { dateStyle: 'long', timeZone: 'UTC' });
  return (
    <Stack gap="lg">
      <Title order={1}>{record.name}</Title>
      <ItemSummary record={record} />
      <Links links={record.links} />
      {record.score !== undefined && rubric !== undefined && (
        <WhyScore record={record} score={record.score} rubric={rubric} />
      )}
      <ItemFacts record={record} popularity={popularity} />
      {record.score === undefined ? (
        <Text>
          <Trans id="item.notScored">No rubric has scored this item yet.</Trans>
        </Text>
      ) : (
        <ScoreBreakdown record={record} score={record.score} />
      )}
      <Flags flags={record.flags} />
      {history !== undefined && history.entries.length > 0 && <ScoreHistory history={history} />}
      <Text size="sm" c="dimmed">
        <Trans id="item.dataAsOf">
          Data as of {changedAt}; last collector run {runDate}.
        </Trans>{' '}
        <ExternalLink href={newIssueUrl}>
          <Trans id="item.report">Report a problem with this entry</Trans>
        </ExternalLink>
      </Text>
    </Stack>
  );
}
