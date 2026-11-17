import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** One page of each route, and a path the site does not have. */
export const sitePages = [
  '/',
  '/plugin/',
  '/mcp-server/',
  '/plugin/gh.example-org.plugins.code-review/',
  '/mcp-server/io.github.example-org.weather/',
  '/method/',
  '/no-such-page/',
];

/** Waits until React has hydrated the page, so a click or a keystroke reaches its handler. */
export async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const main = document.querySelector('main');
    return main !== null && Object.keys(main).some((key) => key.startsWith('__reactFiber'));
  });
}

export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Collects what a page must never do: break its Content-Security-Policy, log an error or request data at runtime. */
export async function watch(page: Page): Promise<{ readonly problems: string[] }> {
  // Not every engine logs a policy violation; the listener turns each one into a console error.
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`policy violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('request', (request) => {
    const type = request.resourceType();
    if (type === 'fetch' || type === 'xhr' || new URL(request.url()).pathname.endsWith('.json')) {
      problems.push(`data request: ${request.url()}`);
    }
  });
  return { problems };
}
