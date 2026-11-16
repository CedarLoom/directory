import { marketplaceAdapter } from './marketplace-adapter.ts';
import type { SourceAdapter } from './source-adapter.ts';

/** The official, community and Anthropic topic marketplaces, read through the GitHub contents API. */
export const sourceAdapters: readonly SourceAdapter[] = [
  marketplaceAdapter('official-marketplace', [{ owner: 'anthropics', repo: 'claude-plugins-official' }]),
  marketplaceAdapter('community-marketplace', [{ owner: 'anthropics', repo: 'claude-plugins-community' }]),
  marketplaceAdapter('anthropic-marketplaces', [
    { owner: 'anthropics', repo: 'skills' },
    { owner: 'anthropics', repo: 'knowledge-work-plugins' },
  ]),
];
