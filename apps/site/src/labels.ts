import type { I18n, MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type { Flag, FitLabel, ItemRecord, Kind, LicenseClass, Maintenance, RecentCommits } from './data-types.ts';
import type { ColumnId } from './list-search.ts';

export const kindLabels = {
  marketplace: msg({ id: 'kind.marketplace', message: 'Marketplace' }),
  plugin: msg({ id: 'kind.plugin', message: 'Plugin' }),
  skill: msg({ id: 'kind.skill', message: 'Skill' }),
  agent: msg({ id: 'kind.agent', message: 'Agent' }),
  hook: msg({ id: 'kind.hook', message: 'Hook' }),
  'mcp-server': msg({ id: 'kind.mcp-server', message: 'MCP server' }),
  'output-style': msg({ id: 'kind.output-style', message: 'Output style' }),
} satisfies Record<Kind, MessageDescriptor>;

export const kindPluralLabels = {
  marketplace: msg({ id: 'kinds.marketplace', message: 'Marketplaces' }),
  plugin: msg({ id: 'kinds.plugin', message: 'Plugins' }),
  skill: msg({ id: 'kinds.skill', message: 'Skills' }),
  agent: msg({ id: 'kinds.agent', message: 'Agents' }),
  hook: msg({ id: 'kinds.hook', message: 'Hooks' }),
  'mcp-server': msg({ id: 'kinds.mcp-server', message: 'MCP servers' }),
  'output-style': msg({ id: 'kinds.output-style', message: 'Output styles' }),
} satisfies Record<Kind, MessageDescriptor>;

export const licenseClassLabels = {
  permissive: msg({ id: 'license.permissive', message: 'Permissive' }),
  copyleft: msg({ id: 'license.copyleft', message: 'Copyleft' }),
  'source-available': msg({ id: 'license.source-available', message: 'Source available' }),
  // The class also holds licenses without an SPDX id or a known class, so the label does not assert that there is none.
  none: msg({ id: 'license.none', message: 'None detected or class not known' }),
  withheld: msg({ id: 'license.withheld', message: 'Withheld: no license granted' }),
} satisfies Record<LicenseClass, MessageDescriptor>;

/** The class next to an SPDX id: an id of class `none` names a license, so only its class is missing. */
export function licenseClassOfId(licenseClass: LicenseClass): MessageDescriptor {
  return licenseClass === 'none'
    ? msg({ id: 'license.classNotKnown', message: 'Class not known' })
    : licenseClassLabels[licenseClass];
}

/** A license with no SPDX id: one withheld, one found without an id, none detected, or its class. */
export function licenseWithoutId({ class: licenseClass, source, withheld }: ItemRecord['license']): MessageDescriptor {
  if (withheld === true) return licenseClassLabels.withheld;
  if (licenseClass !== 'none') return licenseClassLabels[licenseClass];
  return source === undefined
    ? msg({ id: 'license.notDetected', message: 'No license detected' })
    : msg({ id: 'license.custom', message: 'A license, no SPDX id detected' });
}

/** Where a license value comes from; without a source, the collector found none where it looks. */
export const licenseSourceLabels = {
  'github-detected': msg({ id: 'licenseSource.github-detected', message: 'GitHub at the repository root' }),
  manifest: msg({ id: 'licenseSource.manifest', message: 'the plugin manifest' }),
  frontmatter: msg({ id: 'licenseSource.frontmatter', message: 'the license field of the frontmatter' }),
  'license-file': msg({ id: 'licenseSource.license-file', message: "a license file in the item's folder" }),
  none: msg({ id: 'licenseSource.none', message: 'none of the places the method page lists' }),
} satisfies Record<NonNullable<ItemRecord['license']['source']> | 'none', MessageDescriptor>;

export const recentCommitsLabels = {
  none: msg({ id: 'commits.none', message: 'None' }),
  '1-4': msg({ id: 'commits.1-4', message: '1 to 4' }),
  '5+': msg({ id: 'commits.5-or-more', message: '5 or more' }),
} satisfies Record<RecentCommits, MessageDescriptor>;

export const fitLabels = {
  complements: msg({ id: 'fit.complements', message: 'Complements CedarLoom' }),
  overlaps: msg({ id: 'fit.overlaps', message: 'Overlaps CedarLoom' }),
  'may-conflict': msg({ id: 'fit.may-conflict', message: 'May conflict with CedarLoom' }),
  'not-assessed': msg({ id: 'fit.not-assessed', message: 'Not assessed' }),
} satisfies Record<FitLabel, MessageDescriptor>;

export const maintenanceLabels = {
  active: msg({ id: 'maintenance.active', message: 'Pushed in the last 90 days' }),
  inactive: msg({ id: 'maintenance.inactive', message: 'No push in 90 days' }),
  archived: msg({ id: 'maintenance.archived', message: 'Archived' }),
  unknown: msg({ id: 'maintenance.unknown', message: 'Not known' }),
} satisfies Record<Maintenance, MessageDescriptor>;

/** Each safety flag in plain words. */
export const flagLabels = {
  'hook-shell-command': msg({ id: 'flag.hook-shell-command', message: 'Runs shell commands from hooks.' }),
  'hook-session-start': msg({ id: 'flag.hook-session-start', message: 'Runs a hook when every session starts.' }),
  'hook-match-all': msg({ id: 'flag.hook-match-all', message: 'Has a hook that matches every tool call.' }),
  'hook-http': msg({ id: 'flag.hook-http', message: 'Sends hook events to a web address.' }),
  'monitor-background-command': msg({
    id: 'flag.monitor-background-command',
    message: 'Runs a command in the background as a monitor.',
  }),
  'lsp-server-command': msg({
    id: 'flag.lsp-server-command',
    message: 'Starts a language server program.',
  }),
  'mod-module': msg({ id: 'flag.mod-module', message: 'Loads code modules into Claude Code as a mod.' }),
  'workflow-code': msg({ id: 'flag.workflow-code', message: 'Ships workflow scripts that Claude Code runs as code.' }),
  'bin-executables': msg({ id: 'flag.bin-executables', message: 'Ships executables that are added to the path.' }),
  'scripts-present': msg({ id: 'flag.scripts-present', message: 'Ships scripts that the model may run.' }),
  'network-indicator': msg({
    id: 'flag.network-indicator',
    message: 'Has hook commands with signs of network access.',
  }),
  'mcp-stdio-unpinned-package': msg({
    id: 'flag.mcp-stdio-unpinned-package',
    message: 'Starts a local MCP server from a package without an exact version.',
  }),
  'mcp-remote': msg({ id: 'flag.mcp-remote', message: 'Connects to a remote MCP server.' }),
  'mcp-secrets-required': msg({ id: 'flag.mcp-secrets-required', message: 'Needs secrets such as API keys.' }),
  'mcp-headers-helper': msg({
    id: 'flag.mcp-headers-helper',
    message: 'Runs a local command for the headers of a remote MCP server.',
  }),
  'allowed-tools-unrestricted-bash': msg({
    id: 'flag.allowed-tools-unrestricted-bash',
    message: 'Allows any shell command without asking.',
  }),
  'agent-inherits-all-tools': msg({
    id: 'flag.agent-inherits-all-tools',
    message: 'Declares no tools, so it can use every tool of the session.',
  }),
  'install-command-source': msg({
    id: 'flag.install-command-source',
    message: 'Installs by running a command.',
  }),
  'unpinned-source': msg({
    id: 'flag.unpinned-source',
    message: 'Installs from a source not pinned to a commit or tag.',
  }),
  'listed-official-marketplace': msg({
    id: 'flag.listed-official-marketplace',
    message: 'Listed in the official Anthropic marketplace.',
  }),
} satisfies Record<Flag, MessageDescriptor>;

/** The rubric signals by id; a signal of a newer rubric without a label shows its id. */
const signalLabels: Readonly<Record<string, MessageDescriptor>> = {
  lastPush: msg({ id: 'signal.lastPush', message: 'Last push' }),
  recentCommits: msg({ id: 'signal.recentCommits', message: 'Commits in the last 90 days' }),
  release: msg({ id: 'signal.release', message: 'Has a release' }),
  license: msg({ id: 'signal.license', message: 'License' }),
  nameValid: msg({ id: 'signal.nameValid', message: 'Valid name' }),
  descriptionLength: msg({ id: 'signal.descriptionLength', message: 'Description length' }),
  toolsDeclared: msg({ id: 'signal.toolsDeclared', message: 'Declares its tools' }),
  bodyLines: msg({ id: 'signal.bodyLines', message: 'Body lines' }),
  metadataTokens: msg({ id: 'signal.metadataTokens', message: 'Always-loaded tokens (estimate)' }),
  bodyTokens: msg({ id: 'signal.bodyTokens', message: 'Body tokens (estimate)' }),
  safety: msg({ id: 'signal.safety', message: 'Safety flags' }),
  matchersSpecific: msg({ id: 'signal.matchersSpecific', message: 'Specific matchers' }),
  validEntryShare: msg({ id: 'signal.validEntryShare', message: 'Share of valid entries' }),
  describedShare: msg({ id: 'signal.describedShare', message: 'Share of described entries' }),
  noDuplicateNames: msg({ id: 'signal.noDuplicateNames', message: 'No duplicate names' }),
  transportDeclared: msg({ id: 'signal.transportDeclared', message: 'Declares its transport' }),
  versionPinned: msg({ id: 'signal.versionPinned', message: 'Exact package versions' }),
  versionLabel: msg({ id: 'signal.versionLabel', message: 'Has a version' }),
  registryActive: msg({ id: 'signal.registryActive', message: 'Active in the MCP Registry' }),
  namespaceMatches: msg({ id: 'signal.namespaceMatches', message: 'Namespace matches the repository' }),
  nameField: msg({ id: 'signal.nameField', message: 'Has a name field' }),
  descriptionField: msg({ id: 'signal.descriptionField', message: 'Has a description field' }),
  tokens: msg({ id: 'signal.tokens', message: 'Tokens (estimate)' }),
  manifestFields: msg({ id: 'signal.manifestFields', message: 'Manifest fields' }),
  noRootClaudeMd: msg({ id: 'signal.noRootClaudeMd', message: 'No CLAUDE.md at the plugin root' }),
  alwaysOnComponents: msg({ id: 'signal.alwaysOnComponents', message: 'Always-on components' }),
  hasComponents: msg({ id: 'signal.hasComponents', message: 'Components' }),
  hasEvals: msg({ id: 'signal.hasEvals', message: 'Ships evals' }),
  licenseField: msg({ id: 'signal.licenseField', message: 'Has a license field that is neither blank nor withheld' }),
  testsShipped: msg({ id: 'signal.testsShipped', message: 'Ships tests' }),
};

/** The label of a signal, or its id when it has none. */
export function signalName(i18n: I18n, id: string): string {
  const label = signalLabels[id];
  return label === undefined ? id : i18n._(label);
}

export const columnLabels = {
  name: msg({ id: 'column.name', message: 'Name' }),
  kind: msg({ id: 'column.kind', message: 'Kind' }),
  score: msg({ id: 'column.score', message: 'Score' }),
  stars: msg({ id: 'column.stars', message: 'Stars (repository)' }),
  starsGained30d: msg({ id: 'column.starsGained30d', message: 'Stars +30d (repository)' }),
  licenseClass: msg({ id: 'column.licenseClass', message: 'License' }),
  fit: msg({ id: 'column.fit', message: 'CedarLoom fit' }),
  listedOfficial: msg({ id: 'column.listedOfficial', message: 'Official listing' }),
  pushedAt: msg({ id: 'column.pushedAt', message: 'Last push' }),
  flagCount: msg({ id: 'column.flagCount', message: 'Safety flags' }),
} satisfies Record<ColumnId, MessageDescriptor>;
