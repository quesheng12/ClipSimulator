import { expect, test, type Page } from '@playwright/test';
import testStoryJson from '../../content/test-story.json' with { type: 'json' };

const inboxMessageList = (page: Page) => page.locator('.inbox-message-list');
const repliedGroup = (page: Page) => page.locator('.conversation-group--replied');
const fixedTurnActions = (page: Page) => page.locator('.turn-actions--fixed');
const DEFAULT_IDOL_NAME = '沈知夏';
const ADAPTED_IDOL_NAMES = new Set(testStoryJson.profileSetup.namePools.adapted);

async function selectTeam(page: Page, teamName: string) {
  await page.getByRole('combobox', { name: '所属队伍' }).click();
  await page.getByRole('option', { name: new RegExp(`^${teamName}`) }).click();
}

async function completeProfileSetup(page: Page, idolName = DEFAULT_IDOL_NAME) {
  await expect(page.getByRole('heading', { name: '先写下你的成员资料' })).toBeVisible();
  await expect(page.locator('.profile-setup__eyebrow')).toHaveText(
    '入团后的第一次总选 · 还剩 30 天',
  );
  await expect(page.locator('.profile-setup-card > p')).toHaveText(
    '你是刚加入星河48的新人小偶像。面对粉丝发来的翻牌，你会怎么回复？',
  );
  await page.screenshot({ path: 'artifacts/playtest/game-profile-setup-mobile.png' });
  await page.getByRole('textbox', { name: '偶像姓名', exact: true }).fill(idolName);
  await selectTeam(page, 'Team NII');
  await page.getByRole('button', { name: '进入成员主页' }).click();
  await expect(page.getByRole('heading', { name: idolName })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await completeProfileSetup(page);
});

test('first entry creates a persistent member profile that remains editable in settings', async ({
  page,
}) => {
  await page.evaluate(() => localStorage.removeItem('clip-simulator:player-profile:v1'));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.reload();

  await expect(page.getByRole('heading', { name: '先写下你的成员资料' })).toBeVisible();
  const enterProfileButton = page.getByRole('button', { name: '进入成员主页' });
  await enterProfileButton.scrollIntoViewIfNeeded();
  await expect(enterProfileButton).toBeInViewport();
  await page.screenshot({
    path: 'artifacts/playtest/game-profile-setup-short-mobile.png',
    fullPage: true,
  });
  const nameInput = page.getByRole('textbox', { name: '偶像姓名', exact: true });
  const randomNameButton = page.getByRole('button', {
    name: '从姓名库随机一个偶像姓名',
  });
  const teamCombobox = page.getByRole('combobox', { name: '所属队伍' });
  await expect(page.locator('.team-picker__marks')).toHaveCount(0);
  const onboardingScrollBeforeOpen = await page.evaluate(() => window.scrollY);
  await teamCombobox.click();
  const teamPopup = page.locator('.team-select-content');
  await expect(page.getByRole('option', { name: /^Team SII/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(onboardingScrollBeforeOpen);
  const [triggerBox, popupBox] = await Promise.all([
    page.locator('.team-select-trigger').boundingBox(),
    teamPopup.boundingBox(),
  ]);
  expect(Math.abs((triggerBox?.width ?? 0) - (popupBox?.width ?? 0))).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'artifacts/playtest/game-team-picker-open-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(teamCombobox).toBeFocused();
  await teamCombobox.press('ArrowDown');
  await expect(page.getByRole('option', { name: /^Team SII/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: /^Team NII/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: /^Team HII/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: /^Team X/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(teamCombobox).toContainText('Team X');
  const firstThreeSuggestions = [await nameInput.inputValue()];
  await randomNameButton.click();
  firstThreeSuggestions.push(await nameInput.inputValue());
  await randomNameButton.click();
  firstThreeSuggestions.push(await nameInput.inputValue());
  expect(firstThreeSuggestions.every((name) => ADAPTED_IDOL_NAMES.has(name))).toBe(true);
  expect(new Set(firstThreeSuggestions).size).toBe(3);
  const adaptedOnlySuggestions = [...firstThreeSuggestions];
  for (let draw = 0; draw < 5; draw += 1) {
    await randomNameButton.click();
    adaptedOnlySuggestions.push(await nameInput.inputValue());
  }
  expect(adaptedOnlySuggestions.every((name) => ADAPTED_IDOL_NAMES.has(name))).toBe(true);
  expect(new Set(adaptedOnlySuggestions).size).toBe(adaptedOnlySuggestions.length);

  await nameInput.fill('顾星遥');
  await selectTeam(page, 'Team HII');
  await enterProfileButton.click();
  await expect(page.getByRole('heading', { name: '顾星遥' })).toBeVisible();
  await expect(page.locator('.member-status')).toContainText('HII');

  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('textbox', { name: '偶像姓名', exact: true }).fill('许朝夕');
  const settingsScroller = page.locator('.settings-sheet__content');
  const settingsTeamCombobox = page.getByRole('combobox', { name: '所属队伍' });
  await settingsTeamCombobox.scrollIntoViewIfNeeded();
  const [pageScrollBeforeSettingsSelect, sheetScrollBeforeSettingsSelect] = await Promise.all([
    page.evaluate(() => window.scrollY),
    settingsScroller.evaluate((element) => element.scrollTop),
  ]);
  await settingsTeamCombobox.click();
  await expect(page.locator('.settings-select-portal-host .team-select-content')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(pageScrollBeforeSettingsSelect);
  await expect
    .poll(() => settingsScroller.evaluate((element) => element.scrollTop))
    .toBe(sheetScrollBeforeSettingsSelect);
  await page.keyboard.press('Escape');
  await expect(settingsTeamCombobox).toBeFocused();
  await selectTeam(page, 'Team X');
  await page.getByRole('button', { name: '保存成员资料' }).click();
  await expect(page.getByText('已保存')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('heading', { name: '许朝夕' })).toBeVisible();
  await expect(page.locator('.member-status')).toContainText('X');

  await page.reload();
  await expect(page.getByRole('heading', { name: '许朝夕' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('clip-simulator:player-profile:v1') ?? '{}'),
      ),
    )
    .toEqual({ idolName: '许朝夕', teamId: 'x' });
});

test('standard mode shows a quiet inbox and keeps complete conversation history', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { name: DEFAULT_IDOL_NAME })).toBeVisible();
  await expect
    .poll(async () =>
      page.locator('#root').evaluate((root) => {
        const style = getComputedStyle(root);
        return {
          caretColor: style.caretColor,
          cursor: style.cursor,
          userSelect: style.userSelect,
        };
      }),
    )
    .toEqual({ caretColor: 'rgba(0, 0, 0, 0)', cursor: 'default', userSelect: 'none' });
  await expect(page.locator("input, textarea, [contenteditable='true']")).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/playtest/game-member-pocket-home.png' });
  await expect(page.getByText('我的行程')).toHaveCount(0);
  await expect(page.getByText('私信袋王')).toHaveCount(0);
  await expect(page.getByText('生日祝福')).toHaveCount(0);
  await expect(page.locator('.pocket-work-card.is-unavailable')).toHaveCount(3);
  await expect
    .poll(async () =>
      page
        .locator('.pocket-work-card.is-unavailable')
        .first()
        .evaluate((card) => {
          const content = card.querySelector(':scope > span');
          return content ? getComputedStyle(content).filter : 'none';
        }),
    )
    .toContain('blur');
  await expect
    .poll(async () =>
      page.locator('.pocket-tabbar').evaluate((bar) => {
        const rect = bar.getBoundingClientRect();
        return Math.round(window.innerHeight - rect.bottom);
      }),
    )
    .toBe(0);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const home = document.querySelector('.pocket-home');
        const workbench = document.querySelector('.pocket-workbench');
        const tabbar = document.querySelector('.pocket-tabbar');
        if (!home || !workbench || !tabbar) return false;
        const workbenchRect = workbench.getBoundingClientRect();
        const tabbarRect = tabbar.getBoundingClientRect();
        return (
          getComputedStyle(home).backgroundColor === getComputedStyle(tabbar).backgroundColor &&
          getComputedStyle(workbench).backgroundColor !==
            getComputedStyle(tabbar).backgroundColor &&
          workbenchRect.bottom >= tabbarRect.top
        );
      }),
    )
    .toBe(true);

  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '翻牌消息' })).toBeVisible();
  const messageList = inboxMessageList(page);
  const splitters = messageList.locator('.conversation-splitter');
  await expect(messageList).toHaveCount(1);
  await expect(messageList.getByRole('heading', { name: '未回复', exact: true })).toBeVisible();
  await expect(splitters).toHaveCount(1);
  await expect(splitters).toContainText('已回复');
  await expect(messageList.getByRole('button', { name: /柚子汽水/ })).toHaveClass(
    'conversation-row',
  );
  await expect(messageList.getByRole('button', { name: /柚子汽水/ })).toContainText(
    '还有 7 天过期',
  );
  await expect(repliedGroup(page).getByRole('button', { name: /奶茶去冰/ })).toHaveClass(
    'conversation-row',
  );
  await expect(page.getByText(/NPC/i)).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/playtest/game-workbench-mobile.png' });

  await page.getByRole('button', { name: /柚子汽水/ }).click();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toBeVisible();
  await expect(page.locator('.chat-row--fan .fan-message')).toContainText(
    '第一次被翻到需要什么入河仪式吗',
  );
  await expect(page.locator('.choice-card__cost').first()).toHaveAttribute(
    'aria-label',
    /消耗 1 点精力，1 点心态/,
  );
  await expect(page.locator('.choice-card__cost').first().locator('svg')).toHaveCount(2);
  const longChoice = page.getByRole('button', { name: /我知道你刚来会有点紧张/ });
  await expect(longChoice).toContainText('先按自己的节奏认识我');
  await expect
    .poll(() =>
      longChoice.evaluate((card) => {
        const copy = card.querySelector('strong');
        const style = copy ? getComputedStyle(copy) : undefined;
        return {
          overflowY: getComputedStyle(card).overflowY,
          whiteSpace: style?.whiteSpace,
          overflowWrap: style?.overflowWrap,
          growsBeyondMinimum: card.getBoundingClientRect().height > 72,
        };
      }),
    )
    .toEqual({
      overflowY: 'visible',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      growsBeyondMinimum: true,
    });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: 'artifacts/playtest/game-reply-chat-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: /仪式就是/ }).click();
  await expect(page.getByText('柚子汽水 好感 +10')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: 'artifacts/playtest/game-reply-result-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: /回到工作台/ }).click();

  const repliedRows = repliedGroup(page).locator('.conversation-row');
  await expect(repliedRows.first()).toContainText('柚子汽水');
  const coreRow = repliedGroup(page).getByRole('button', { name: /柚子汽水/ });
  const ordinaryRow = repliedGroup(page).getByRole('button', { name: /奶茶去冰/ });
  await expect(coreRow).toHaveClass('conversation-row');
  await expect(ordinaryRow).toHaveClass('conversation-row');
  expect(await coreRow.getAttribute('class')).toBe(await ordinaryRow.getAttribute('class'));
  await expect(page.getByText(/NPC/i)).toHaveCount(0);

  await coreRow.click();
  await expect(
    page.getByText('第一次被翻到需要什么入河仪式吗？我已经把昵称改得很像老粉了。'),
  ).toBeVisible();
  await expect(page.getByText(/仪式就是：从今天开始别把自己当外人，来Team NII/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toHaveCount(0);
  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(repliedGroup(page).getByRole('button', { name: /柚子汽水/ })).toBeVisible();

  await ordinaryRow.click();
  await expect(page.getByText('今天吃了吗？')).toBeVisible();
  await expect(page.getByText('吃了，吃的是经纪人的画饼。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toHaveCount(0);
  await expect(page.locator('.choice-section')).toHaveCount(0);
  await expect(page.getByText('当前没有待回复的翻牌')).toBeVisible();
  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(repliedGroup(page).getByRole('button', { name: /奶茶去冰/ })).toBeVisible();

  await page.getByRole('button', { name: '返回主菜单' }).click();
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  await expect(inboxMessageList(page)).toBeVisible();
  await page.getByRole('button', { name: '返回主菜单' }).click();
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '放弃进度，从头开始' }).click();
  await expect(inboxMessageList(page)).toBeVisible();
  await expect(
    inboxMessageList(page).getByRole('heading', { name: '未回复', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.game-header__countdown')).toHaveText('离总选结束还剩 29 天');
});

test('the single inbox list stays clear of the fixed turn actions', async ({ page }) => {
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();

  const messageList = inboxMessageList(page);
  const actions = fixedTurnActions(page);
  await expect(messageList).toBeVisible();
  await expect(actions).toBeVisible();
  await expect(actions.getByRole('button', { name: '几天后', exact: true })).toBeVisible();
  await expect(actions.getByRole('button', { name: /外卖/ })).toBeVisible();
  await expect(page.getByText(/本月已点/)).toHaveCount(0);
  await expect(page.locator('.game-header__countdown')).toHaveText('离总选结束还剩 29 天');

  const layout = await actions.evaluate((footer) => {
    const screen = document.querySelector<HTMLElement>('.inbox-screen');
    const footerStyle = getComputedStyle(footer);
    const footerRect = footer.getBoundingClientRect();
    return {
      position: footerStyle.position,
      bottom: Number.parseFloat(footerStyle.bottom),
      viewportGap: Math.round(window.innerHeight - footerRect.bottom),
      footerHeight: footerRect.height,
      contentPaddingBottom: screen ? Number.parseFloat(getComputedStyle(screen).paddingBottom) : 0,
      backgroundColor: footerStyle.backgroundColor,
      ownsViewportBottom: footer.contains(
        document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 1),
      ),
    };
  });
  expect(layout.position).toBe('fixed');
  expect(layout.bottom).toBe(0);
  expect(layout.viewportGap).toBe(0);
  expect(layout.contentPaddingBottom).toBeGreaterThanOrEqual(layout.footerHeight);
  expect(layout.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(layout.ownsViewportBottom).toBe(true);

  await messageList.evaluate((list) => {
    list.scrollTop = list.scrollHeight;
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const lastConversation = messageList.locator('.conversation-row').last();
  await expect(lastConversation).toBeVisible();
  await expect
    .poll(async () =>
      lastConversation.evaluate((row) => {
        const footer = document.querySelector<HTMLElement>('.turn-actions--fixed');
        return footer
          ? row.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top
          : false;
      }),
    )
    .toBe(true);

  await page.setViewportSize({ width: 1024, height: 768 });
  const desktopLayout = await actions.evaluate((footer) => {
    const frame = document.querySelector<HTMLElement>('.app-frame');
    const footerRect = footer.getBoundingClientRect();
    const frameRect = frame?.getBoundingClientRect();
    return {
      viewportGap: Math.round(window.innerHeight - footerRect.bottom),
      width: Math.round(footerRect.width),
      alignsWithFrame:
        frameRect !== undefined &&
        Math.abs(footerRect.left - frameRect.left) <= 1 &&
        Math.abs(footerRect.right - frameRect.right) <= 1,
    };
  });
  expect(desktopLayout.viewportGap).toBe(0);
  expect(desktopLayout.width).toBeLessThanOrEqual(460);
  expect(desktopLayout.alignsWithFrame).toBe(true);

  for (let turn = 1; turn < 10; turn += 1) {
    await actions.getByRole('button', { name: '几天后', exact: true }).click();
  }
  await expect(page.locator('.inbox-summary strong')).toHaveText('Day 28');
  await expect(page.locator('.game-header__countdown')).toHaveText('离总选结束还剩 2 天');
  await expect(
    messageList
      .locator('.conversation-group--pending')
      .locator('.conversation-row__timing--urgent'),
  ).toHaveCount(0);
  await expect(actions.getByRole('button', { name: '进入总选', exact: true })).toBeVisible();
});

test('multiple pending flips for one fan stay separately visible and actionable', async ({
  page,
}) => {
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  await page.evaluate(() => {
    const key = 'clip-simulator:save:v1';
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('Expected an initialized local save');
    const state = JSON.parse(raw) as { currentDay: number; turn: number };
    state.currentDay = 5;
    state.turn = 2;
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const deadlineDayRow = page
    .locator('.conversation-group--pending')
    .getByRole('button', { name: /第一次被翻到需要什么入河仪式吗/ });
  await expect(deadlineDayRow).toContainText('还有 3 天过期');
  await expect(deadlineDayRow.locator('time')).not.toHaveClass(
    /\bconversation-row__timing--urgent\b/,
  );

  await page.evaluate(() => {
    const key = 'clip-simulator:save:v1';
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('Expected an initialized local save');
    const state = JSON.parse(raw) as {
      currentDay: number;
      turn: number;
      pendingNodeIds: string[];
      unlockedNodeIds: string[];
    };
    state.currentDay = 7;
    state.turn = 3;
    state.pendingNodeIds = [...new Set([...state.pendingNodeIds, 'yuzu-02'])];
    state.unlockedNodeIds = [...new Set([...state.unlockedNodeIds, 'yuzu-02'])];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const pendingGroup = page.locator('.conversation-group--pending');
  const yuzuRows = pendingGroup.getByRole('button', { name: /柚子汽水/ });
  const firstYuzu = pendingGroup.getByRole('button', {
    name: /第一次被翻到需要什么入河仪式吗/,
  });
  const secondYuzu = pendingGroup.getByRole('button', {
    name: /我算了一下，暑假少买几杯奶茶/,
  });
  await expect(yuzuRows).toHaveCount(2);
  await expect(firstYuzu).toContainText('还有 1 天过期');
  await expect(secondYuzu).toContainText('还有 10 天过期');
  await expect(firstYuzu.locator('time')).toHaveClass(/\bconversation-row__timing--urgent\b/);
  await expect(secondYuzu.locator('time')).not.toHaveClass(/\bconversation-row__timing--urgent\b/);
  await expect
    .poll(() => firstYuzu.locator('time').evaluate((timing) => getComputedStyle(timing).color))
    .toBe('rgb(185, 56, 84)');

  await firstYuzu.click();
  await expect(page.getByText(/第一次被翻到需要什么入河仪式吗/)).toBeVisible();
  await page.getByRole('button', { name: /仪式就是/ }).click();
  await page.getByRole('button', { name: /回到工作台/ }).click();

  const remainingYuzu = pendingGroup.getByRole('button', { name: /柚子汽水/ });
  await expect(remainingYuzu).toHaveCount(1);
  await expect(remainingYuzu).toContainText('我算了一下，暑假少买几杯奶茶');
  await expect(remainingYuzu).toContainText('还有 10 天过期');
});

test('an expired inbox row keeps the exact flip preview and the chat names its deadline', async ({
  page,
}) => {
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  await page.evaluate(() => {
    const key = 'clip-simulator:save:v1';
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('Expected an initialized local save');
    const state = JSON.parse(raw) as {
      currentDay: number;
      turn: number;
      pendingNodeIds: string[];
      resolvedNodes: Record<string, string>;
    };
    state.currentDay = 10;
    state.turn = 4;
    state.pendingNodeIds = state.pendingNodeIds.filter((id) => id !== 'yuzu-01');
    state.resolvedNodes['yuzu-01'] = 'expired';
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const expiredRow = repliedGroup(page).getByRole('button', { name: /柚子汽水/ });
  await expect(expiredRow).toContainText(`${DEFAULT_IDOL_NAME}，第一次被翻到`);
  await expect(expiredRow).toContainText('已过期');
  await expect(expiredRow).not.toContainText('已错过回复期限');

  await expiredRow.click();
  await expect(page.getByText('这条翻牌已于第 8 日 24:00 过期')).toBeVisible();
  await expect(page.getByText('当前没有待回复的翻牌')).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: 'artifacts/playtest/game-expired-chat-mobile.png',
    fullPage: true,
  });
});

test('realistic mode hides numeric affinity feedback', async ({ page }) => {
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '营业设置' })).toBeVisible();
  const restartButton = page.getByRole('button', { name: '放弃进度，从头开始' });
  await expect(restartButton).toBeVisible();
  await expect(page.getByText('选择后仍可在设置中修改')).toHaveCount(0);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/playtest/game-member-pocket-settings-sheet.png' });
  await restartButton.scrollIntoViewIfNeeded();
  const restartNote = page.locator('.settings-restart-note');
  const [restartBox, noteBox] = await Promise.all([
    restartButton.boundingBox(),
    restartNote.boundingBox(),
  ]);
  expect((restartBox?.y ?? 0) + (restartBox?.height ?? 0)).toBeLessThanOrEqual(noteBox?.y ?? 0);
  await page.screenshot({ path: 'artifacts/playtest/game-settings-restart-mobile.png' });
  await page.getByRole('button', { name: /拟真模式/ }).click();
  await expect(page.getByRole('button', { name: /拟真模式/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '关闭' }).click();
  await page.reload();
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  await page.getByRole('button', { name: /柚子汽水/ }).click();
  await page.getByRole('button', { name: /仪式就是/ }).click();

  await expect(page.getByText('柚子汽水 好感 +10')).toHaveCount(0);
  await expect(page.getByText('稳定支持')).toBeVisible();
});

test('browser and in-game back controls preserve the inbox and completed replies', async ({
  page,
}) => {
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '营业设置' })).toBeVisible();
  await expect(page).toHaveTitle('营业设置 — 成员口袋');

  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: DEFAULT_IDOL_NAME })).toBeVisible();

  await page.goForward();
  await expect(page.getByRole('heading', { name: '营业设置' })).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  await expect(inboxMessageList(page)).toBeVisible();
  await expect(page).toHaveTitle('翻牌消息 — 成员口袋');

  await page.goBack();
  await expect(page.getByRole('heading', { name: DEFAULT_IDOL_NAME })).toBeVisible();
  await page.goForward();
  await expect(inboxMessageList(page)).toBeVisible();

  await page.getByRole('button', { name: /柚子汽水/ }).click();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toBeVisible();
  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(inboxMessageList(page)).toBeVisible();

  await page.goForward();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toBeVisible();
  await page.getByRole('button', { name: /仪式就是/ }).click();
  await expect(page.getByText('柚子汽水 好感 +10')).toBeVisible();

  await page.goBack();
  await expect(inboxMessageList(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toHaveCount(0);

  await page.goForward();
  await expect(page.getByText('柚子汽水 好感 +10')).toBeVisible();
  await page.getByRole('button', { name: /回到工作台/ }).click();
  await expect(repliedGroup(page).getByRole('button', { name: /柚子汽水/ })).toBeVisible();

  await repliedGroup(page)
    .getByRole('button', { name: /奶茶去冰/ })
    .click();
  await expect(page.getByText('今天吃了吗？')).toBeVisible();
  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(repliedGroup(page).getByRole('button', { name: /奶茶去冰/ })).toBeVisible();

  await page.goForward();
  await expect(page.getByText('奶茶去冰', { exact: true })).toBeVisible();
  await expect(page.getByText('吃了，吃的是经纪人的画饼。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toHaveCount(0);
  await page.goBack();
  await expect(inboxMessageList(page)).toBeVisible();
  await expect(repliedGroup(page).getByRole('button', { name: /奶茶去冰/ })).toBeVisible();
});

test('the fourth takeout triggers the early ending', async ({ page }) => {
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  for (let order = 1; order <= 4; order += 1) {
    await fixedTurnActions(page).getByRole('button', { name: /外卖/ }).click();
    if (order < 4) {
      await fixedTurnActions(page).getByRole('button', { name: '几天后', exact: true }).click();
    }
  }

  await expect(page.getByRole('heading', { name: '被外卖软件签走了' })).toBeVisible();
  await expect(page.getByText(/提前结局/)).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: 'artifacts/playtest/game-takeout-ending-mobile.png',
    fullPage: true,
  });
});

test('keyboard controls operate conversation and fixed action buttons with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const settings = page.getByRole('button', { name: '设置' });
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  const realisticMode = page.getByRole('button', { name: /拟真模式/ });
  await realisticMode.focus();
  await page.keyboard.press('Enter');
  await expect(realisticMode).toHaveAttribute('aria-pressed', 'true');
  const closeSettings = page.getByRole('button', { name: '关闭' });
  await closeSettings.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const flipTool = page.getByRole('button', { name: /翻牌.*待回复/ });
  await flipTool.focus();
  await page.keyboard.press('Enter');
  await expect(inboxMessageList(page)).toBeVisible();

  const conversation = inboxMessageList(page).getByRole('button', { name: /柚子汽水/ });
  await conversation.focus();
  await expect(conversation).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toBeVisible();
  await page.getByRole('button', { name: '返回翻牌消息' }).click();

  const actions = fixedTurnActions(page);
  const takeout = actions.getByRole('button', { name: /外卖/ });
  await takeout.focus();
  await expect(takeout).toBeFocused();
  await page.keyboard.press('Space');
  await expect(actions.locator('.takeout-button')).toBeDisabled();

  const daysLater = actions.getByRole('button', { name: '几天后', exact: true });
  await daysLater.focus();
  await expect(daysLater).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.game-header__countdown')).toHaveText('离总选结束还剩 26 天');
});
