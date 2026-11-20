import type { Pin, SourceKind } from '@directory/contracts';
import type { Scorable } from '@directory/scoring';
import type { HookFacts } from './hook-analyzer.ts';
import { isLicenseValue } from './license-class.ts';
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

function raised(checks: readonly (readonly [Flag, boolean])[]): Flag[] {
  return checks.filter(([, on]) => on).map(([flag]) => flag);
}

/** Lowercase letters, digits and single hyphens, up to 64 characters. */
function validName(name: string | undefined): name is string {
  return name !== undefined && name.length <= 64 && kebabCase.test(name);
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
  folderName: string | undefined,
): Assessment {
  return {
    signals: {
      // The name must match the skill's folder, where it has one.
      nameValid: validName(facts.declaredName) && (folderName === undefined || facts.declaredName === folderName),
      descriptionLength: facts.descriptionLength,
      bodyLines: facts.bodyLines,
      licenseField: facts.declaredLicense !== undefined && isLicenseValue(facts.declaredLicense),
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

/** The hook flags raised by any of the hook configurations. */
function hookFlags(configs: readonly HookFacts[]) {
  return [
    ['hook-shell-command', configs.some(({ handlerTypes }) => handlerTypes.includes('command'))],
    ['hook-session-start', configs.some(({ events }) => events.includes('SessionStart'))],
    ['hook-match-all', configs.some(({ matcherBreadth }) => matcherBreadth === 'match-all')],
    ['hook-http', configs.some(({ handlerTypes }) => handlerTypes.includes('http'))],
  ] as const;
}

export function hookAssessment(hooks: HookFacts): Assessment {
  return {
    signals: { matchersSpecific: hooks.matcherBreadth !== 'match-all' },
    flags: raised([...hookFlags([hooks]), ['network-indicator', hooks.networkIndicator]]),
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
    hooksByEvent: Readonly<Record<string, number>>;
    mcpServersByTransport: Partial<Record<'stdio' | 'http' | 'sse', number>>;
    lspServers: number;
    outputStyles: number;
    monitors: number;
    binFiles: number;
  };
  /** The mod modules the hooks configurations list. */
  modules: number;
  /** The plugin holds theme or workflow files, which the counts leave out. */
  themesOrWorkflows: boolean;
  /** A workflow location holds a `.js` file, which Claude Code runs as code. */
  workflowCode: boolean;
  hasEvals: boolean;
  /** The facts of each hook configuration: hooks/hooks.json and hooks inline in plugin.json. */
  hooks: readonly HookFacts[];
  mcpUnpinnedPackage: boolean;
  mcpSecretsRequired: boolean;
  source: { kind: SourceKind; pin: Pin };
  listedIn: readonly string[];
}

const sum = (counts: Readonly<Record<string, number>>): number =>
  Object.values(counts).reduce((total, count) => total + count, 0);

export function pluginAssessment(facts: PluginFacts): Assessment {
  const { components, hooks } = facts;
  const { http = 0, sse = 0 } = components.mcpServersByTransport;
  return {
    signals: {
      manifestFields: facts.manifestFields,
      nameValid: validName(facts.name),
      noRootClaudeMd: !facts.rootClaudeMd,
      alwaysOnComponents: components.skills + components.agents + components.commands,
      // A plugin without a counted component, a mod module, a theme or a workflow is empty.
      hasComponents:
        facts.themesOrWorkflows ||
        [
          components.skills,
          components.agents,
          components.commands,
          sum(components.hooksByEvent),
          sum(components.mcpServersByTransport),
          components.lspServers,
          components.outputStyles,
          components.monitors,
          components.binFiles,
          facts.modules,
        ].some((count) => count > 0),
      hasEvals: facts.hasEvals,
    },
    flags: raised([
      ...hookFlags(hooks),
      ['monitor-background-command', components.monitors > 0],
      ['lsp-server-command', components.lspServers > 0],
      ['mod-module', facts.modules > 0],
      ['workflow-code', facts.workflowCode],
      ['bin-executables', components.binFiles > 0],
      ['network-indicator', hooks.some(({ networkIndicator }) => networkIndicator)],
      ['mcp-stdio-unpinned-package', facts.mcpUnpinnedPackage],
      ['mcp-remote', http + sse > 0],
      ['mcp-secrets-required', facts.mcpSecretsRequired],
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
