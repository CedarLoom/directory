import { Anchor } from '@mantine/core';
import type { ReactNode } from 'react';

/** A link off the site, underlined as it stands in running text; `nofollow` as the Directory does not vouch for its target. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Anchor href={href} rel="noopener noreferrer nofollow" underline="always">
      {children}
    </Anchor>
  );
}
