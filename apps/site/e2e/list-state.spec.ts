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
  await expect(shown.getByRole('status')).toHaveText('6 of 22 items');
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
  await expect(page.getByRole('status')).toHaveText('5 of 22 items');
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

test('a marketplace and a root skill of one repository share an id and each show once, in sort order', async ({
  page,
}) => {
  await openList(page, '/?tag=review');
  const names = page.locator('tbody tr td:first-child');
  const byScore = ['sql-review', 'security-auditor', 'code-review', 'plugins-guide', 'plugins', 'refactor-agent'];
  await expect(names).toHaveText(byScore);
  await sortBy(page, 'Score');
  await expect(names).toHaveText(byScore.toReversed());
});

test('a shift-click on a column header sorts by that column', async ({ page }) => {
  await openList(page);
  await page.getByRole('button', { name: 'Name', exact: true }).click({ modifiers: ['Shift'] });
  await expect(header(page, 'Name')).toHaveAttribute('aria-sort', 'ascending');
});

test('typing in the search field keeps every character and the caret', async ({ page }) => {
  await openList(page);
  await page.locator('summary', { hasText: 'Filters' }).click();
  const search = page.getByLabel('Search names, owners and tags');
  await search.pressSequentially('rw');
  await search.press('ArrowLeft');
  await search.pressSequentially('evie');
  await expect(search).toHaveValue('review');
  expect(await search.evaluate((field: HTMLInputElement) => field.selectionStart)).toBe(5);
  await expect(page.getByRole('status')).toHaveText('6 of 22 items');
});

test('a tag from the address that no item has stays selected', async ({ page }) => {
  await openList(page, '/?tag=gone');
  await page.locator('summary', { hasText: 'Filters' }).click();
  await expect(page.getByLabel('Category tag')).toHaveValue('gone');
  await expect(page.getByRole('status')).toHaveText('0 of 22 items');
});

test('text that is not a number marks a bound invalid and keeps the bound', async ({ page }) => {
  await openList(page);
  await page.locator('summary', { hasText: 'Filters' }).click();
  const from = page.getByLabel('Stars from');
  await from.fill('100');
  await expect(page).toHaveURL(/starsMin=100/);
  await from.pressSequentially('e');
  await expect(from).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/starsMin=100/);
});
