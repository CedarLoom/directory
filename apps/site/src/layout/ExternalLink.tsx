import { Anchor } from '@mantine/core';
import type { ReactNode } from 'react';

/** A link off the site; `nofollow` because the targets are third-party pages the Directory does not vouch for. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Anchor href={href} rel="noopener noreferrer nofollow">
      {children}
    </Anchor>
  );
}
