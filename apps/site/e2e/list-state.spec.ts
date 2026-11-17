import { expect, type Page, test } from '@playwright/test';
import { hydrated } from './site-pages.ts';

async function openList(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await hydrated(page);
}

async function reload(page: Page): Promise<void> {
  await page.reload();
  await hydrated(page);
}

function header(page: Page, name: string) {
  return page.getByRole('columnheader', { name, exact: true });
}

async function sortBy(page: Page, name: string): Promise<string | null> {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(header(page, name)).toHaveAttribute('aria-sort', /^(ascending|descending)$/);
  return header(page, name).getAttribute('aria-sort');
}

async function expectState(shown: Page): Promise<void> {
  await expect(shown.getByRole('status')).toHaveText('5 of 21 items');
  await expect(shown.getByLabel('Search names, owners and tags')).toHaveValue('review');
  await expect(header(shown, 'Name')).toHaveAttribute('aria-sort', 'ascending');
  await expect(header(shown, 'License')).toBeVisible();
  await expect(shown.getByRole('row').nth(1)).toContainText('code-review');
}

test('a filter, a sort and a column choice survive a reload and a copied URL', async ({ page, browser }) => {
  await openList(page);
  await page.locator('summary', { hasText: 'Filters' }).click();
  await page.getByLabel('Search names, owners and tags').fill('review');
  await page.getByRole('button', { name: 'Name', exact: true }).click();
  await page.locator('summary', { hasText: 'Columns' }).click();
  await page.getByRole('checkbox', { name: 'License', exact: true }).check();

  await expectState(page);
  await reload(page);
  await expectState(page);

  const copied = await browser.newPage();
  await openList(copied, page.url());
  await expectState(copied);
});

test('the stars +30d column is visible by default', async ({ page }) => {
  await openList(page);
  await expect(header(page, 'Stars +30d (repository)')).toBeVisible();
});

async function expectStarFilters(page: Page): Promise<void> {
  await expect(page.getByRole('status')).toHaveText('4 of 21 items');
  await expect(page.getByLabel('Stars from')).toHaveValue('100');
  await expect(page.getByLabel('Stars to')).toHaveValue('1000');
  await expect(page.getByLabel('Stars gained in 30 days, at least')).toHaveValue('10');
}

async function expectSortSurvivesReload(page: Page, column: string): Promise<void> {
  const direction = await sortBy(page, column);
  await reload(page);
  await expectStarFilters(page);
  await expect(header(page, column)).toHaveAttribute('aria-sort', direction ?? '');
}

test('the star range filter, the minimum gain filter and the sorts by stars and by stars +30d survive a reload', async ({
  page,
}) => {
  await openList(page);
  await page.locator('summary', { hasText: 'Filters' }).click();
  await page.getByLabel('Stars from').fill('100');
  await page.getByLabel('Stars to').fill('1000');
  await page.getByLabel('Stars gained in 30 days, at least').fill('10');
  await expectStarFilters(page);
  await expectSortSurvivesReload(page, 'Stars (repository)');
  await expectSortSurvivesReload(page, 'Stars +30d (repository)');
});
