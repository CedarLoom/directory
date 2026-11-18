import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, hydrated, sitePages, watch } from './site-pages.ts';

const widths = [320, 390, 1280];
const schemes = [
  { name: 'light', media: { colorScheme: 'light', forcedColors: 'none' } },
  { name: 'dark', media: { colorScheme: 'dark', forcedColors: 'none' } },
  { name: 'forced colors', media: { colorScheme: 'light', forcedColors: 'active' } },
] as const;

// The browser reports the status of the not-found page itself as an error.
const notFoundStatus = 'Failed to load resource: the server responded with a status of 404 (Not Found)';

for (const path of sitePages) {
  test(`${path} loads without a policy violation, an error or a data request`, async ({ page }) => {
    const { problems } = await watch(page);
    await page.goto(path);
    await hydrated(page);
    expect(problems.filter((problem) => problem !== `console: ${notFoundStatus}`)).toEqual([]);
  });

  for (const width of widths) {
    for (const scheme of schemes) {
      test(`${path} passes axe at ${width} px in ${scheme.name}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia(scheme.media);
        await page.goto(path);
        await hydrated(page);
        await expectNoAxeViolations(page);
      });
    }
  }
}

test('a link from the list opens an item page without a data request', async ({ page }) => {
  const { problems } = await watch(page);
  await page.goto('/');
  await hydrated(page);
  await page.getByRole('link', { name: 'code-review' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Score 87.6 of 100, rubric 1.1.0' })).toBeVisible();
  expect(problems).toEqual([]);
});
