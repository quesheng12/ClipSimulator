import { expect, test } from '@playwright/test';

const APP_URL = 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await page.goto(APP_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('textbox', { name: '偶像姓名', exact: true }).fill('沈知夏');
  await page.getByRole('combobox', { name: '所属队伍' }).click();
  await page.getByRole('option', { name: /^Team NII/ }).click();
  await page.getByRole('button', { name: '进入成员主页' }).click();
});

test('desktop keeps page scrolling inside the simulated phone frame', async ({ page }) => {
  const frame = page.locator('.app-frame');
  const tabbar = page.locator('.pocket-tabbar');

  const homeShell = await frame.evaluate((element) => {
    const frameRect = element.getBoundingClientRect();
    const tabbarRect = document.querySelector('.pocket-tabbar')?.getBoundingClientRect();
    return {
      frameTop: Math.round(frameRect.top),
      frameBottomGap: Math.round(window.innerHeight - frameRect.bottom),
      frameHeight: Math.round(frameRect.height),
      frameOverflowY: getComputedStyle(element).overflowY,
      scrollbarGutter: getComputedStyle(element).scrollbarGutter,
      documentScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      tabbarFrameGap: tabbarRect ? Math.round(frameRect.bottom - tabbarRect.bottom) : null,
    };
  });

  expect(homeShell).toMatchObject({
    frameTop: 24,
    frameBottomGap: 24,
    frameHeight: 720,
    frameOverflowY: 'auto',
    scrollbarGutter: 'stable',
    bodyOverflowY: 'hidden',
    tabbarFrameGap: 0,
  });
  expect(homeShell.documentScrollHeight).toBe(homeShell.viewportHeight);
  await expect(tabbar).toBeVisible();

  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  const actions = page.locator('.turn-actions--fixed');
  await expect(actions).toBeVisible();
  await expect.poll(() => frame.evaluate((element) => element.scrollTop)).toBe(0);

  const workbenchMetrics = await frame.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    windowScrollY: window.scrollY,
  }));
  expect(workbenchMetrics.scrollHeight).toBeGreaterThan(workbenchMetrics.clientHeight);
  expect(workbenchMetrics.windowScrollY).toBe(0);

  const frameBox = await frame.boundingBox();
  if (!frameBox) throw new Error('Expected the desktop phone frame to have a bounding box.');
  await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
  await page.mouse.wheel(0, 620);
  await expect.poll(() => frame.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  const dockAlignment = await actions.evaluate((footer) => {
    const frameRect = document.querySelector('.app-frame')?.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    return frameRect
      ? {
          bottomGap: Math.round(frameRect.bottom - footerRect.bottom),
          leftGap: Math.round(footerRect.left - frameRect.left),
          rightGap: Math.round(frameRect.right - footerRect.right),
        }
      : null;
  });
  expect(dockAlignment).toEqual({ bottomGap: 0, leftGap: 0, rightGap: 0 });

  const pendingRow = page.locator('.conversation-group--pending .conversation-row').last();
  await pendingRow.scrollIntoViewIfNeeded();
  const workbenchScrollTop = await frame.evaluate((element) => element.scrollTop);
  expect(workbenchScrollTop).toBeGreaterThan(0);
  await pendingRow.click();
  const composer = page.locator('.reply-composer--fixed');
  await expect(composer).toBeVisible();
  await expect
    .poll(() =>
      composer.evaluate((footer) => {
        const frameRect = document.querySelector('.app-frame')?.getBoundingClientRect();
        return frameRect
          ? Math.round(frameRect.bottom - footer.getBoundingClientRect().bottom)
          : null;
      }),
    )
    .toBe(0);

  await page.screenshot({ path: 'artifacts/playtest/game-desktop-phone-scroll.png' });

  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(page.getByRole('heading', { name: '翻牌消息' })).toBeVisible();
  await expect
    .poll(() => frame.evaluate((element) => Math.round(element.scrollTop)))
    .toBe(Math.round(workbenchScrollTop));
});
