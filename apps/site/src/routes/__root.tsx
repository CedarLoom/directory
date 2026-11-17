import '../styles.ts';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { ColorSchemeScript, Container, mantineHtmlProps } from '@mantine/core';
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SiteFooter } from '../layout/SiteFooter.tsx';
import { SiteHeader } from '../layout/SiteHeader.tsx';
import { SiteProviders } from '../layout/SiteProviders.tsx';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        name: 'description',
        content: t({
          id: 'site.description',
          message:
            'Claude Code plugins, skills, agents, hooks, MCP servers and output styles, scored by an open rubric.',
        }),
      },
      { title: t({ id: 'site.title', message: 'CedarLoom Directory' }) },
    ],
  }),
  shellComponent: Shell,
  component: Outlet,
  notFoundComponent: NotFound,
});

function Shell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <HeadContent />
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <SiteProviders>
          <SiteHeader />
          <Container component="main" id="main" size="xl" py="lg">
            {children}
          </Container>
          <SiteFooter />
        </SiteProviders>
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <p>
      <Trans id="notFound.body">This page does not exist.</Trans>
    </p>
  );
}
