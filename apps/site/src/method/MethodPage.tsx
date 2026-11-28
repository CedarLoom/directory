import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Anchor, List, Stack, Text, Title } from '@mantine/core';
import type { MetaFile, Rubric } from '../data-types.ts';
import { scoreBandLabels } from '../labels.ts';
import { ExternalLink } from '../layout/ExternalLink.tsx';
import { newIssueUrl } from '../new-issue-url.ts';
import { scoreBands } from '../score-band.ts';
import { RubricTable } from './RubricTable.tsx';

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

function Bands() {
  const { t, i18n } = useLingui();
  const lowestEdge = Math.min(...scoreBands.map(({ from }) => from));
  const bands = new Intl.ListFormat(i18n.locale, { type: 'conjunction' }).format([
    ...scoreBands.map(({ band, from }) => {
      const name = i18n._(scoreBandLabels[band]);
      const points = i18n.number(from);
      return t({ id: 'method.bandFrom', message: `${name} from ${points}` });
    }),
    t({ id: 'method.bandBelow', message: `${i18n._(scoreBandLabels['very-low'])} below ${i18n.number(lowestEdge)}` }),
  ]);
  return <Trans id="method.bands">The list and the item pages name the band of each score: {bands}.</Trans>;
}

/** The method in plain words, before its details. */
function InShort() {
  return (
    <List>
      <List.Item>
        <Trans id="method.short.rubric">
          The collector scores every item by the same published rubric of its kind, shown below.
        </Trans>
      </List.Item>
      <List.Item>
        <Trans id="method.short.noPerson">No person scores an item, and no score is set by hand.</Trans>
      </List.Item>
      <List.Item>
        <Trans id="method.short.stars">Stars are shown, but never counted in the score.</Trans>
      </List.Item>
      <List.Item>
        <Trans id="method.short.itemPage">Each item's page shows where every point of its score came from.</Trans>
      </List.Item>
      <List.Item>
        <Bands />
      </List.Item>
    </List>
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
        <List.Item>
          <Trans id="method.notMeasured.themesWorkflows">
            Plugin themes and workflows: they are not counted and only keep the plugin from counting as empty; a .js
            file directly in a workflow folder raises a flag, as Claude Code runs it as code. Plugin files more than two
            subfolders below a component folder and manifest paths outside the plugin folder are not read.
          </Trans>
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
            The CedarLoom fit is not part of the score. It is not assessed for any item yet, so the list and the item
            pages leave it out.
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
          The Directory's own data is released under the MIT license. Names and descriptions of listed items belong to
          their authors; the Directory links to them and copies no description.
        </Trans>
      </Text>
      <Text>
        <Trans id="method.fontLicense">
          The site's font, Inter, is copyright 2016 The Inter Project Authors and licensed under the{' '}
          <Anchor href={`${import.meta.env.BASE_URL}licenses/inter-ofl.txt`} underline="always">
            SIL Open Font License 1.1
          </Anchor>
          .
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

function LicenseFacts() {
  return (
    <Trans id="method.licenseFacts">
      The license of an item is the license field of a skill's frontmatter, else the license GitHub detects at the
      repository root, else the license field of a plugin's manifest, else a license file in a skill's or plugin's own
      folder. A license file at the repository root that GitHub cannot name comes after the license field of a plugin's
      manifest and, without one, before a license file in the item's own folder; for a plugin or skill at the repository
      root it is named by its text like a license file in the item's folder when it is the only license file GitHub
      reads at the root, and otherwise it is recorded without an SPDX id. A frontmatter or manifest field that withholds
      the license, which is UNLICENSED, NONE or the word proprietary alone, reads "Withheld: no license granted" in the
      list and on the item's page and scores as no license whatever the repository grants. A plugin manifest that
      withholds the license withholds it also for the skills, agents, hooks and output styles found in or listed for the
      plugin; a skill's own license field still applies, and so does a license file in a skill's folder other than the
      plugin's. A plugin manifest's license field that states a license applies to these items as well when GitHub names
      no license at the repository root, again after a skill's own license field and a license file in a skill's folder
      other than the plugin's. A repository found by topic search is the plugin of its items when it is the one plugin
      listed at its root or, with none listed, has a plugin manifest; an item in a folder several listed plugins share
      belongs to the one whose entry lists it, else to none, with the license of the folder's plugin manifest. An item
      whose plugin manifest is cut by GitHub, over the size cap or not a JSON object is not listed, as its license
      cannot be read. For a plugin in its marketplace's own repository, the license field of its marketplace entry is
      read as the manifest's when it has no plugin.json or one with an empty or no license field, also when another
      marketplace lists it. The entry of a plugin in another repository is not read, as a marketplace may hold no rights
      to grant that plugin's license. A blank field and one that holds NOASSERTION state nothing, so the next of these
      sources applies. A blank, NOASSERTION or withholding license field does not count as filled, neither for a skill's
      license field nor among a plugin's manifest fields. A field that holds the full name of a license in the SPDX
      License List 3.29, other than a deprecated one, such as MIT License, in any case and spacing, is recorded with
      that license's SPDX id. A field that holds neither such a name nor an SPDX expression of listed license and
      exception ids, such as one with a LicenseRef or The MIT License, is recorded without an SPDX id. A license file in
      the item's folder is recorded with the SPDX id of the license whose template in the SPDX License List 3.29 its
      text matches once whitespace, case, dash and quote styles, the spaces next to punctuation, title lines that hold
      only words of the license's name or id and a version, and copyright notices are set aside as the SPDX matching
      guidelines describe; the templates are those of the licenses GitHub detects, their earlier versions and other
      licenses items state. A copyright notice opens with Copyright, (c) or © and may name its holders in any case or
      script. The next line is set aside with it when it holds no word of terms and continues the notice: the notice
      ends with a comma, and, the, of or &; or the notice ends with Inc., Corp., Ltd. or Co., or the line opens with a
      digit, and the line's first sentence holds a comma and each of its words opens with a capital or a digit, as in an
      address. Any other line after a notice is kept. A copyright line that holds a word of terms, such as only,
      commercial, NC, proprietary, confidential, evaluation, trial, expires, internal, not, prohibited, restricted or
      permission, is kept, so the text matches no template. Terms in other words, such as "ask first", pass as a
      holder's name and do not change the match. A part that a template leaves free, such as the copyright holders in
      MIT's warranty disclaimer, takes any text, so terms added there do not change the match. A license file that
      matches none of the templates, and one of several license files in the folder, is recorded without an SPDX id.
      SPDX ids match in any case and are recorded as the SPDX License List writes them. An expression takes the class of
      its most permissive part when OR joins its parts and of its least permissive part when AND joins them. "No license
      detected" means that none of these was found, not that the item has no license.
    </Trans>
  );
}

function Rubrics({ rubrics }: { rubrics: readonly Rubric[] }) {
  return (
    <section aria-labelledby="rubrics-heading">
      <Title order={2} id="rubrics-heading">
        <Trans id="method.rubricsHeading">Rubrics</Trans>
      </Title>
      <Text>
        <LicenseFacts />
      </Text>
      <Stack gap="md">
        {rubrics.map((rubric) => (
          <RubricTable key={rubric.kind} rubric={rubric} />
        ))}
      </Stack>
    </section>
  );
}

/** How the Directory collects and scores its items, with the rubric of each kind that scored the data. */
export function MethodPage({ meta, rubrics }: { meta: MetaFile; rubrics: readonly Rubric[] }) {
  const { i18n } = useLingui();
  const runDate = i18n.date(meta.runAt, { dateStyle: 'long', timeZone: 'UTC' });
  return (
    <Stack gap="lg">
      <Title order={1}>
        <Trans id="method.heading">Method</Trans>
      </Title>
      <InShort />
      <Text>
        <Trans id="method.intro">
          A collector reads public sources once a week, records published facts about each item and scores it with the
          open rubric of its kind. The last run was on {runDate}. The CedarLoom Directory is not affiliated with or
          endorsed by Anthropic.
        </Trans>
      </Text>
      <Sources meta={meta} />
      <Rubrics rubrics={rubrics} />
      <NotMeasured />
      <OwnInterest />
      <Policies />
    </Stack>
  );
}
