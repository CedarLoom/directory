import { expect, test } from '@playwright/test';

test('an item page shows its score breakdown', async ({ page }) => {
  await page.goto('/plugin/gh.example-org.plugins.code-review/');
  const breakdown = page.getByRole('region', { name: 'Score 87.6 of 100, rubric 1.0.0' });
  await expect(breakdown).toBeVisible();
  // A header row and one row per signal of the plugin rubric.
  await expect(breakdown.getByRole('row')).toHaveCount(11);
  await expect(breakdown.getByRole('rowheader', { name: 'Last push' })).toBeVisible();
  await expect(breakdown.getByRole('rowheader', { name: 'Safety flags' })).toBeVisible();
});

test('on an item page the link to its kind list is not marked as the current page', async ({ page }) => {
  await page.goto('/plugin/gh.example-org.plugins.code-review/');
  const plugins = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plugins', exact: true });
  await expect(plugins).toBeVisible();
  await expect(plugins).not.toHaveAttribute('aria-current');
});
