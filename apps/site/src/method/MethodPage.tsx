import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { List, Stack, Text, Title } from '@mantine/core';
import type { MetaFile } from '../data-types.ts';
import { ExternalLink } from '../layout/ExternalLink.tsx';
import { newIssueUrl } from '../new-issue-url.ts';
import { RubricTable } from './RubricTable.tsx';
import { rubrics } from './rubrics.ts';

const sourceLabels: Readonly<Record<string, MessageDescriptor>> = {
  'official-marketplace': msg({
    id: 'source.official-marketplace',
    message: 'The official Claude Code plugin marketplace (anthropics/claude-plugins-official)',
  }),
  'community-marketplace': msg({
    id: 'source.community-marketplace',
    message: 'The community plugin marketplace (anthropics/claude-plugins-community)',
  }),
  'anthropic-marketplaces': msg({
    id: 'source.anthropic-marketplaces',
    message: 'The marketplaces in anthropics/skills and anthropics/knowledge-work-plugins',
  }),
  github: msg({ id: 'source.github', message: 'GitHub: repository facts, stars and a search by topic' }),
  'mcp-registry': msg({ id: 'source.mcp-registry', message: 'The MCP Registry' }),
  seeds: msg({ id: 'source.seeds', message: 'A curated list of repositories' }),
};

function Sources({ meta }: { meta: MetaFile }) {
  const { i18n } = useLingui();
  return (
    <section aria-labelledby="sources-heading">
      <Title order={2} id="sources-heading">
        <Trans id="method.sourcesHeading">Sources</Trans>
      </Title>
      <List>
        {meta.sources.map((source) => {
          const label = sourceLabels[source.id];
          const readAt = i18n.date(source.readAt, { dateStyle: 'long', timeZone: 'UTC' });
          const name = label === undefined ? source.id : i18n._(label);
          return (
            <List.Item key={source.id}>
              <Trans id="method.sourceRead">
                {name}, read {readAt}
              </Trans>
            </List.Item>
          );
        })}
      </List>
    </section>
  );
}

function NotMeasured() {
  return (
    <section aria-labelledby="not-measured-heading">
      <Title order={2} id="not-measured-heading">
        <Trans id="method.notMeasuredHeading">What the score does not measure</Trans>
      </Title>
      <List>
        <List.Item>
          <Trans id="method.notMeasured.works">
            Whether an item works or does what it describes: nothing is installed or run.
          </Trans>
        </List.Item>
        <List.Item>
          <Trans id="method.notMeasured.audit">
            Security: safety flags point at patterns that need care; they are no audit, and an item without flags is not
            proven safe.
          </Trans>
        </List.Item>
        <List.Item>
          <Trans id="method.notMeasured.stars">
            Popularity: stars count for the whole repository, not for one item in it, and do not change the score.
          </Trans>
        </List.Item>
        <List.Item>
          <Trans id="method.notMeasured.tokens">Token counts are estimates: characters divided by four.</Trans>
        </List.Item>
      </List>
    </section>
  );
}

function Policies() {
  return (
    <section aria-labelledby="policies-heading">
      <Title order={2} id="policies-heading">
        <Trans id="method.policiesHeading">License, corrections and removal</Trans>
      </Title>
      <Text>
        <Trans id="method.license">
          The Directory's own data is released under CC0 1.0. Names and descriptions of listed items belong to their
          authors; the Directory links to them and copies no description.
        </Trans>
      </Text>
      <Text>
        <Trans id="method.takedown">
          To correct an entry or to have your item removed, open an issue. A removed item stays out of later runs.
        </Trans>{' '}
        <ExternalLink href={newIssueUrl}>
          <Trans id="method.openIssue">Open an issue</Trans>
        </ExternalLink>
      </Text>
    </section>
  );
}

/** How the Directory collects and scores its items. */
export function MethodPage({ meta }: { meta: MetaFile }) {
  const { i18n } = useLingui();
  const runDate = i18n.date(meta.runAt, { dateStyle: 'long', timeZone: 'UTC' });
  return (
    <Stack gap="lg">
      <Title order={1}>
        <Trans id="method.heading">Method</Trans>
      </Title>
      <Text>
        <Trans id="method.intro">
          A collector reads public sources once a week, records published facts about each item and scores it with the
          open rubric of its kind. The last run was on {runDate}. The CedarLoom Directory is not affiliated with or
          endorsed by Anthropic.
        </Trans>
      </Text>
      <Sources meta={meta} />
      <section aria-labelledby="rubrics-heading">
        <Title order={2} id="rubrics-heading">
          <Trans id="method.rubricsHeading">Rubrics</Trans>
        </Title>
        <Stack gap="md">
          {rubrics.map((rubric) => (
            <RubricTable key={rubric.kind} rubric={rubric} />
          ))}
        </Stack>
      </section>
      <NotMeasured />
      <Policies />
    </Stack>
  );
}
