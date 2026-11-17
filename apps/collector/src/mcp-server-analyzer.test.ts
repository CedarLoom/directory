import { expect, it } from 'vitest';
import { analyzeMcpServer } from './mcp-server-analyzer.ts';

it('counts required secret arguments with the environment of the same package', () => {
  const secret = { isRequired: true, isSecret: true };
  const facts = analyzeMcpServer(
    {
      name: 'io.github.example-org/alpha',
      version: '1.0.0',
      packages: [
        {
          registryType: 'oci',
          identifier: 'ghcr.io/example-org/alpha:1.0.0',
          transport: { type: 'stdio' },
          runtimeArguments: [secret],
          packageArguments: [secret, { isRequired: true }],
          environmentVariables: [secret],
        },
      ],
    },
    'active',
  );
  expect({ requiredSecrets: facts.requiredSecrets, versionPinned: facts.versionPinned }).toEqual({
    requiredSecrets: 3,
    versionPinned: true,
  });
});

function pinnedOf(identifier: string): boolean {
  return analyzeMcpServer(
    {
      name: 'io.github.example-org/alpha',
      version: '1.0.0',
      packages: [{ registryType: 'oci', identifier, transport: { type: 'stdio' } }],
    },
    'active',
  ).versionPinned;
}

it('reads a version, tag or digest other than latest as pinned', () => {
  expect(
    ['ghcr.io/o/i:1.0', 'ghcr.io/o/i', 'localhost:5000/i', 'i@sha256:ab', 'i:latest'].map((identifier) => [
      identifier,
      pinnedOf(identifier),
    ]),
  ).toEqual([
    ['ghcr.io/o/i:1.0', true],
    ['ghcr.io/o/i', false],
    ['localhost:5000/i', false],
    ['i@sha256:ab', true],
    ['i:latest', false],
  ]);
});

it('counts the required secret variables of a header and of a remote URL', () => {
  const secret = { isRequired: true, isSecret: true };
  const facts = analyzeMcpServer(
    {
      name: 'io.github.example-org/alpha',
      version: '1.0.0',
      remotes: [
        {
          type: 'streamable-http',
          url: 'https://{tenant}.example.test/mcp',
          headers: [{ isRequired: true, variables: { token: secret, team: { isRequired: true } } }],
          variables: { tenant: secret },
        },
      ],
    },
    'active',
  );
  expect(facts.requiredSecrets).toBe(2);
});

it('counts the variables of a templated secret header, not the header as well', () => {
  const secret = { isRequired: true, isSecret: true };
  const facts = analyzeMcpServer(
    {
      name: 'io.github.example-org/alpha',
      version: '1.0.0',
      remotes: [
        {
          type: 'streamable-http',
          url: 'https://example.test/mcp',
          headers: [{ ...secret, variables: { token: secret } }, secret],
        },
      ],
    },
    'active',
  );
  expect(facts.requiredSecrets).toBe(2);
});

it('counts a remote host once however its URLs spell it', () => {
  const facts = analyzeMcpServer(
    {
      name: 'io.github.example-org/alpha',
      version: '1.0.0',
      remotes: [
        'https://a.example/x',
        'https://A.example:443/y',
        'https://user@a.example/z',
        'https://b.example',
        'http://[::1]:8080/mcp',
        'http://[::1]/sse',
      ].map((url) => ({ type: 'sse' as const, url })),
    },
    'active',
  );
  expect(facts.remoteHosts).toBe(3);
});

it('counts the secrets of a server with 300,000 remotes', () => {
  const remotes = Array.from({ length: 300_000 }, () => ({ type: 'sse' as const, url: 'https://a.example' }));
  const facts = analyzeMcpServer({ name: 'io.github.example-org/alpha', version: '1.0.0', remotes }, 'active');
  expect(facts.requiredSecrets).toBe(0);
});
