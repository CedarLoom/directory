import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeViolations, hydrated, sitePages } from './site-pages.ts';

interface Measured {
  readonly target: string;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly field: boolean;
}

/** Every control the page shows, with the box a tap hits: a checkbox is hit through its label. */
function measureControls(page: Page): Promise<Measured[]> {
  return page.evaluate(() => {
    for (const details of document.querySelectorAll('details')) details.open = true;
    // Links inside running text are inline targets, which WCAG 2.5.8 exempts.
    const controls = document.querySelectorAll<HTMLElement>('a:not(p a, li a), button, summary, select, input');
    return [...controls]
      .map((control) =>
        control instanceof HTMLInputElement && control.type === 'checkbox' ? control.labels?.[0] : control,
      )
      .filter((target): target is HTMLElement => target !== undefined && target.checkVisibility())
      .map((target) => ({ target, box: target.getBoundingClientRect() }))
      .filter(({ box }) => box.bottom + window.scrollY > 0)
      .map(({ target, box }) => ({
        target: target.outerHTML.slice(0, 120),
        width: box.width,
        height: box.height,
        fontSize: Number.parseFloat(getComputedStyle(target).fontSize),
        field: target.matches('select, input'),
      }));
  });
}

for (const path of sitePages) {
  test(`${path} passes axe, and its targets and fields fit the pointer @engines`, async ({ page, hasTouch }) => {
    await page.goto(path);
    await hydrated(page);
    await expectNoAxeViolations(page);
    // 44 px on a touch screen; WCAG 2.5.8 asks 24 px for a mouse.
    const minimum = hasTouch ? 44 : 24;
    const controls = await measureControls(page);
    expect(controls.filter((control) => control.width < minimum || control.height < minimum)).toEqual([]);
    // 16 px field text stops a phone browser from zooming in on focus.
    if (hasTouch) expect(controls.filter((control) => control.field && control.fontSize < 16)).toEqual([]);
  });
}
