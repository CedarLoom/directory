import { registryName, versionLabel } from '@directory/contracts';
import { z } from 'zod';
import { imagePinned } from './package-pin.ts';

const transportTypes = ['stdio', 'streamable-http', 'sse'] as const;
const registryTypes = ['npm', 'pypi', 'oci', 'nuget', 'mcpb', 'cargo'] as const;

// The registry's server.json; only the keys a fact needs are read, the rest is stripped.
const supplied = z.object({ isRequired: z.boolean().optional(), isSecret: z.boolean().optional() });
// The variables fill the `{curly_braces}` of an input's value or a remote's URL; each is a value the user may supply.
const variables = z.record(z.string(), supplied).optional();
const input = supplied.extend({ variables });
const registryPackage = z.object({
  registryType: z.enum(registryTypes),
  identifier: z.string(),
  version: z.string().optional(),
  transport: z.object({ type: z.enum(transportTypes) }),
  runtimeArguments: z.array(input).optional(),
  packageArguments: z.array(input).optional(),
  environmentVariables: z.array(input).optional(),
});
const remote = z.object({
  type: z.enum(transportTypes),
  url: z.string(),
  headers: z.array(input).optional(),
  variables,
});

/** The server a registry entry describes; the name and version patterns are the registry's own. */
export const registryServer = z.object({
  name: registryName,
  version: z.string().max(255),
  // The registry leaves out an empty URL, so a repository can come without one.
  repository: z.object({ url: z.string().optional() }).optional(),
  packages: z.array(registryPackage).optional(),
  remotes: z.array(remote).optional(),
});
export type RegistryServer = z.infer<typeof registryServer>;

export interface McpServerFacts {
  version?: string;
  registryStatus: 'active' | 'deprecated';
  transports: (typeof transportTypes)[number][];
  packageRegistryTypes: (typeof registryTypes)[number][];
  versionPinned: boolean;
  requiredSecrets: number;
  remoteHosts: number;
}

/** A package names an exact version: its `version`, or for an image without one a tag or digest other than `latest`. */
function pinned({ version, identifier }: z.infer<typeof registryPackage>): boolean {
  if (version !== undefined) return version !== '' && version !== 'latest';
  return imagePinned(identifier);
}

function secrets(inputs: readonly z.infer<typeof input>[] = []): number {
  // A templated input is filled from its variables, so the user supplies the variables, not the input.
  const values = inputs.flatMap((one) => {
    const filled = Object.values(one.variables ?? {});
    return filled.length > 0 ? filled : [one];
  });
  return values.filter(({ isRequired, isSecret }) => isRequired === true && isSecret === true).length;
}

function present<T extends string>(order: readonly T[], found: readonly T[]): T[] {
  return order.filter((value) => found.includes(value));
}

/** The facts of a registry server; each package and remote is one way to run it, so secrets count per way, the most of them. */
export function analyzeMcpServer(server: RegistryServer, registryStatus: McpServerFacts['registryStatus']) {
  const { packages = [], remotes = [] } = server;
  const version = versionLabel.safeParse(server.version);
  return {
    ...(version.success ? { version: version.data } : {}),
    registryStatus,
    transports: present(transportTypes, [
      ...packages.map(({ transport }) => transport.type),
      ...remotes.map(({ type }) => type),
    ]),
    packageRegistryTypes: present(
      registryTypes,
      packages.map(({ registryType }) => registryType),
    ),
    versionPinned: packages.every(pinned),
    // A fold, not a spread into Math.max: a spread of a very long list overflows the call stack.
    requiredSecrets: [
      ...packages.map(({ runtimeArguments = [], packageArguments = [], environmentVariables = [] }) =>
        secrets([...runtimeArguments, ...packageArguments, ...environmentVariables]),
      ),
      ...remotes.map(({ headers = [], variables: urlVariables = {} }) =>
        secrets([...headers, ...Object.values(urlVariables)]),
      ),
    ].reduce((most, way) => Math.max(most, way), 0),
    // Hosts as the URL names them without user info and port, a `{variable}` part included.
    remoteHosts: new Set(
      remotes.map(({ url }) => /^[a-z]+:\/\/(?:[^/?#@]*@)?(\[[^\]]*\]|[^/?#:]*)/i.exec(url)?.[1]?.toLowerCase() ?? url),
    ).size,
  } satisfies McpServerFacts;
}
