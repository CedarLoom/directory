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
