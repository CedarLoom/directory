import { expect, test } from '@playwright/test';
import { hydrated } from './site-pages.ts';

const pages = [
  { name: 'list', path: '/' },
  { name: 'item', path: '/plugin/gh.example-org.plugins.code-review/' },
  { name: 'method', path: '/method/' },
];

for (const { name, path } of pages) {
  for (const width of [390, 1280]) {
    test(`${name} at ${width} px looks as recorded @visual`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(path);
      await hydrated(page);
      await expect(page).toHaveScreenshot(`${name}-${width}.png`, { fullPage: true });
    });
  }
}
