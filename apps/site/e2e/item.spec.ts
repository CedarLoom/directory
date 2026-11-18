import { expect, test } from '@playwright/test';

test('an item page shows its score breakdown', async ({ page }) => {
  await page.goto('/plugin/gh.example-org.plugins.code-review/');
  const breakdown = page.getByRole('region', { name: 'Score 87.6 of 100, rubric 1.1.0' });
  await expect(breakdown).toBeVisible();
  // A header row and one row per signal of the plugin rubric.
  await expect(breakdown.getByRole('row')).toHaveCount(11);
  await expect(breakdown.getByRole('rowheader', { name: 'Last push' })).toBeVisible();
  await expect(breakdown.getByRole('rowheader', { name: 'Safety flags' })).toBeVisible();
});

test('a signal that an empty item gets no points for names the gate signal it lacks', async ({ page }) => {
  await page.goto('/output-style/gh.example-org.terse/');
  const breakdown = page.getByRole('region', { name: 'Score 50 of 100, rubric 1.1.0' });
  const tokens = breakdown.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Tokens (estimate)' }) });
  await expect(tokens).toContainText('Body lines');
});

test('on an item page the link to its kind list is not marked as the current page', async ({ page }) => {
  await page.goto('/plugin/gh.example-org.plugins.code-review/');
  const plugins = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plugins', exact: true });
  await expect(plugins).toBeVisible();
  await expect(plugins).not.toHaveAttribute('aria-current');
});
