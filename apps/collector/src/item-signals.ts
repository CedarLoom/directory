import type { Pin, SourceKind } from '@directory/contracts';
import type { Scorable } from '@directory/scoring';
import type { HookFacts } from './hook-analyzer.ts';
import { type MarketplaceEntries, share } from './marketplace-analyzer.ts';
import type { McpServerFacts } from './mcp-server-analyzer.ts';

type Flag = Scorable['flags'][number];

/** The signals a rubric scores and the flags raised, in the order of the flag list. */
export interface Assessment {
  signals: Record<string, number | boolean>;
  flags: Flag[];
}

export const officialMarketplace = 'gh.anthropics.claude-plugins-official';

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// The kebab-case plugin names Claude Code refuses.
const reservedPrefix = /^(?:claude|anthropics?|cc-plugin)-/;
const reservedNames: ReadonlySet<string> = new Set(['claude', 'anthropic', 'anthropics', 'claude-code', 'claude-mods']);
const officialBeside = /(?:^|-)(?:claude|anthropics?)-official(?:-|$)|(?:^|-)official-(?:claude|anthropics?)(?:-|$)/;

function raised(checks: readonly (readonly [Flag, boolean])[]): Flag[] {
  return checks.filter(([, on]) => on).map(([flag]) => flag);
}

/** Lowercase letters, digits and single hyphens, up to 64 characters. */
function validName(name: string | undefined): name is string {
  return name !== undefined && name.length <= 64 && kebabCase.test(name);
}

function reservedName(name: string): boolean {
  return reservedPrefix.test(name) || reservedNames.has(name) || officialBeside.test(name);
}

interface FileFacts {
  declaredName: string | undefined;
  descriptionLength: number;
  bodyLines: number;
  tokens: { metadata: number; body: number };
  unrestrictedBash: boolean;
}

export function skillAssessment(
  facts: FileFacts & { declaredLicense: string | undefined; scripts: number; tests: boolean },
  folderName: string,
): Assessment {
  return {
    signals: {
      // The name must match the skill's folder.
      nameValid: validName(facts.declaredName) && facts.declaredName === folderName,
      descriptionLength: facts.descriptionLength,
      bodyLines: facts.bodyLines,
      licenseField: facts.declaredLicense !== undefined,
      metadataTokens: facts.tokens.metadata,
      bodyTokens: facts.tokens.body,
      testsShipped: facts.tests,
    },
    flags: raised([
      ['scripts-present', facts.scripts > 0],
      ['allowed-tools-unrestricted-bash', facts.unrestrictedBash],
    ]),
  };
}

export function agentAssessment(facts: FileFacts & { toolsDeclared: boolean }): Assessment {
  return {
    signals: {
      nameValid: validName(facts.declaredName),
      descriptionLength: facts.descriptionLength,
      toolsDeclared: facts.toolsDeclared,
      bodyLines: facts.bodyLines,
      metadataTokens: facts.tokens.metadata,
      bodyTokens: facts.tokens.body,
    },
    flags: raised([
      ['allowed-tools-unrestricted-bash', facts.unrestrictedBash],
      ['agent-inherits-all-tools', !facts.toolsDeclared],
    ]),
  };
}

export function outputStyleAssessment(facts: {
  named: boolean;
  described: boolean;
  bodyLines: number;
  tokens: number;
}): Assessment {
  return {
    signals: {
      nameField: facts.named,
      descriptionField: facts.described,
      bodyLines: facts.bodyLines,
      tokens: facts.tokens,
    },
    flags: [],
  };
}

function hookFlags(hooks: HookFacts | undefined, sessionStart: boolean) {
  return [
    ['hook-shell-command', hooks?.handlerTypes.includes('command') === true],
    ['hook-session-start', sessionStart],
    ['hook-match-all', hooks?.matcherBreadth === 'match-all'],
    ['hook-http', hooks?.handlerTypes.includes('http') === true],
  ] as const;
}

export function hookAssessment(hooks: HookFacts): Assessment {
  return {
    signals: { matchersSpecific: hooks.matcherBreadth !== 'match-all' },
    flags: raised([
      ...hookFlags(hooks, hooks.events.includes('SessionStart')),
      ['network-indicator', hooks.networkIndicator],
    ]),
  };
}

export interface PluginFacts {
  name: string;
  manifestFields: number;
  rootClaudeMd: boolean;
  components: {
    skills: number;
    agents: number;
    commands: number;
    hooksByEvent: Record<string, number>;
    mcpServersByTransport: Partial<Record<'stdio' | 'http' | 'sse', number>>;
    binFiles: number;
  };
  hasEvals: boolean;
  /** The facts of the plugin's hooks/hooks.json, when it has one the hook analyzer read. */
  hooks: HookFacts | undefined;
  source: { kind: SourceKind; pin: Pin };
  listedIn: readonly string[];
}

export function pluginAssessment(facts: PluginFacts): Assessment {
  const { components, hooks } = facts;
  const { http = 0, sse = 0 } = components.mcpServersByTransport;
  return {
    signals: {
      manifestFields: facts.manifestFields,
      nameValid: validName(facts.name) && !reservedName(facts.name),
      noRootClaudeMd: !facts.rootClaudeMd,
      alwaysOnComponents: components.skills + components.agents + components.commands,
      hasEvals: facts.hasEvals,
    },
    flags: raised([
      ...hookFlags(hooks, (components.hooksByEvent['SessionStart'] ?? 0) > 0),
      ['bin-executables', components.binFiles > 0],
      ['network-indicator', hooks?.networkIndicator === true],
      ['mcp-remote', http + sse > 0],
      ['install-command-source', facts.source.kind === 'command'],
      ['unpinned-source', facts.source.pin === 'none'],
      ['listed-official-marketplace', facts.listedIn.includes(officialMarketplace)],
    ]),
  };
}

export function marketplaceAssessment({ count, sources, described, duplicateNames }: MarketplaceEntries): Assessment {
  return {
    signals: {
      validEntryShare: share(sources.length, count),
      describedShare: share(described, count),
      noDuplicateNames: !duplicateNames,
    },
    flags: raised([
      ['install-command-source', sources.some(({ kind }) => kind === 'command')],
      ['unpinned-source', sources.some(({ pin }) => pin === 'none')],
    ]),
  };
}

export function mcpServerAssessment(server: McpServerFacts, name: string, owner: string): Assessment {
  return {
    signals: {
      transportDeclared: server.transports.length > 0,
      versionPinned: server.versionPinned,
      versionLabel: server.version !== undefined,
      registryActive: server.registryStatus === 'active',
      // A GitHub-verified namespace names the repository's owner.
      namespaceMatches: name.toLowerCase().startsWith(`io.github.${owner.toLowerCase()}/`),
    },
    flags: raised([
      ['mcp-stdio-unpinned-package', server.transports.includes('stdio') && !server.versionPinned],
      ['mcp-remote', server.remoteHosts > 0],
      ['mcp-secrets-required', server.requiredSecrets > 0],
    ]),
  };
}
