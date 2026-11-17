import '../src/styles.ts';
import type { Decorator, Preview } from '@storybook/react-vite';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { SiteProviders } from '../src/layout/SiteProviders.tsx';

// Links need a router; a one-route memory router renders the story as its only page.
const withRouter: Decorator = (Story) => {
  const router = createRouter({
    routeTree: createRootRoute({ component: Story }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    trailingSlash: 'always',
  });
  return <RouterProvider router={router} />;
};

const withProviders: Decorator = (Story) => (
  <SiteProviders>
    <Story />
  </SiteProviders>
);

const preview: Preview = {
  decorators: [withRouter, withProviders],
  parameters: {
    // Every story is an accessibility test: an axe violation fails it.
    a11y: {
      test: 'error',
      options: { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } },
    },
  },
};

export default preview;
