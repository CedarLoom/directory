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
    message: 'The official Claude Code plugin marketplace',
  }),
  'community-marketplace': msg({ id: 'source.community-marketplace', message: 'The community plugin marketplace' }),
  'anthropic-marketplaces': msg({
    id: 'source.anthropic-marketplaces',
    message: 'The marketplaces of two more Anthropic repositories',
  }),
  github: msg({ id: 'source.github', message: 'GitHub: repository facts, stars and a search by topic' }),
  'mcp-registry': msg({ id: 'source.mcp-registry', message: 'The MCP Registry' }),
  seeds: msg({ id: 'source.seeds', message: 'A curated list of repositories' }),
};

// The repositories behind each source, by GitHub owner and name.
const sourceRepositories: Readonly<Record<string, readonly string[]>> = {
  'official-marketplace': ['anthropics/claude-plugins-official'],
  'community-marketplace': ['anthropics/claude-plugins-community'],
  'anthropic-marketplaces': ['anthropics/skills', 'anthropics/knowledge-work-plugins'],
  'mcp-registry': ['modelcontextprotocol/registry'],
};

function RepositoryLinks({ repositories }: { repositories: readonly string[] }) {
  return (
    <>
      {' ('}
      {repositories.map((repository, index) => (
        <span key={repository}>
          {index > 0 && ', '}
          <ExternalLink href={`https://github.com/${repository}`}>{repository}</ExternalLink>
        </span>
      ))}
      {')'}
    </>
  );
}

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
          const repositories = sourceRepositories[source.id];
          return (
            <List.Item key={source.id}>
              <Trans id="method.sourceRead">
                {name}, read {readAt}
              </Trans>
              {repositories !== undefined && <RepositoryLinks repositories={repositories} />}
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

function OwnInterest() {
  return (
    <section aria-labelledby="own-interest-heading">
      <Title order={2} id="own-interest-heading">
        <Trans id="method.ownInterestHeading">Who runs the Directory</Trans>
      </Title>
      <List>
        <List.Item>
          <Trans id="method.ownInterest.maker">
            The Directory is run by the maker of CedarLoom. CedarLoom is its maker's own Claude Code plugin, so the
            maker has an interest of its own in how other items compare with it.
          </Trans>
        </List.Item>
        <List.Item>
          <Trans id="method.ownInterest.sameRubric">
            Every item of a kind is scored with the same published rubric. No entry, score or position is paid for.
          </Trans>
        </List.Item>
        <List.Item>
          <Trans id="method.ownInterest.fit">
            The CedarLoom fit fact on item pages and in the list is not part of the score. It reads "Not assessed" for
            every item today.
          </Trans>
        </List.Item>
        <List.Item>
          <Trans id="method.ownInterest.ownItems">
            Items of CedarLoom's maker get no exception: they are read from the same sources and scored with the same
            rubric as every other item, and no score is set by hand.
          </Trans>
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
          To correct an entry or to have your item removed, open an issue with the correction or removal form. No reason
          is needed for a removal, and every request is answered within one month. A removed item stays out of later
          runs.
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
        <Text>
          <Trans id="method.licenseFacts">
            The license of an item is the license field of a skill's frontmatter, else the license GitHub detects at the
            repository root, else the license field of a plugin's manifest, else a license file in a skill's or plugin's
            own folder. A frontmatter or manifest field that withholds the license, such as UNLICENSED, NONE or one that
            starts with proprietary, reads "Withheld" and scores as no license whatever the repository grants; one that
            holds NOASSERTION states no license, so only a license file in the item's folder can give one. A field that
            holds no SPDX expression of listed license and exception ids, such as one with a LicenseRef, and a license
            file in the item's folder are recorded without an SPDX id. SPDX ids match in any case and are recorded as
            the SPDX License List writes them. An expression takes the class of its most permissive part when OR joins
            its parts and of its least permissive part when AND joins them. "No license detected" means that none of
            these was found, not that the item has no license.
          </Trans>
        </Text>
        <Stack gap="md">
          {rubrics.map((rubric) => (
            <RubricTable key={rubric.kind} rubric={rubric} />
          ))}
        </Stack>
      </section>
      <NotMeasured />
      <OwnInterest />
      <Policies />
    </Stack>
  );
}
