import { Trans, useLingui } from '@lingui/react/macro';
import { Anchor, Group, VisuallyHidden } from '@mantine/core';
import { FolderGit2, GitFork, Star } from 'lucide-react';

const repo = 'CedarLoom/directory';

/** The link to the Directory's repository with its star and fork counts as of the build; without counts, the name only. */
export function RepoWidget({ facts }: { facts: { readonly stars?: number; readonly forks?: number } }) {
  const { i18n } = useLingui();
  const count = (n: number) => i18n.number(n, { notation: 'compact' });
  return (
    <Anchor href={`https://github.com/${repo}`} rel="noopener noreferrer" c="var(--ink)">
      <Group gap="xs" wrap="nowrap" component="span">
        <FolderGit2 aria-hidden size={18} />
        <span>{repo}</span>
        {facts.stars !== undefined && (
          <Group gap={4} wrap="nowrap" component="span" data-numeric>
            <Star aria-hidden size={14} />
            <VisuallyHidden>
              <Trans id="repo.stars">Stars</Trans>
            </VisuallyHidden>
            {count(facts.stars)}
          </Group>
        )}
        {facts.forks !== undefined && (
          <Group gap={4} wrap="nowrap" component="span" data-numeric>
            <GitFork aria-hidden size={14} />
            <VisuallyHidden>
              <Trans id="repo.forks">Forks</Trans>
            </VisuallyHidden>
            {count(facts.forks)}
          </Group>
        )}
      </Group>
    </Anchor>
  );
}
