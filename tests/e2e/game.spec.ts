import { expect, test, type Page } from '@playwright/test';
import testStoryJson from '../../content/test-story.json' with { type: 'json' };

const inboxMessageList = (page: Page) => page.locator('.inbox-message-list');
const repliedGroup = (page: Page) => page.locator('.conversation-group--replied');
const fixedTurnActions = (page: Page) => page.locator('.turn-actions--fixed');
const DEFAULT_IDOL_NAME = '沈知夏';
const ADAPTED_IDOL_NAMES = new Set(testStoryJson.profileSetup.namePools.adapted);
const YUZU_FAN = testStoryJson.fans.find((fan) => fan.id === 'yuzu');
const TAKEOUT_ENDING = testStoryJson.earlyEndings.find((ending) => ending.id === 'takeout-idol');

if (!YUZU_FAN) {
  throw new Error('The E2E story fixture must include the yuzu core fan.');
}

if (!TAKEOUT_ENDING?.image) {
  throw new Error('The E2E story fixture must include an image for the takeout ending.');
}

const YUZU_DISPLAY_NAME = YUZU_FAN.name.replaceAll('{{idolName}}', DEFAULT_IDOL_NAME);

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
    `你是刚加入${testStoryJson.globalVariables.groupName}的 18 岁新人小偶像。面对粉丝发来的翻牌，你会怎么回复？`,
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
  await expect(page.getByRole('radio')).toHaveCount(6);
  await page.getByRole('radio', { name: '包里小猫' }).check();
  await expect(page.locator('.profile-form__preview img')).toHaveAttribute(
    'src',
    '/assets/avatars/profile-kitten.webp',
  );
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
  const hiiStatusColor = await page.locator('.member-status__team').evaluate((badge) => ({
    background: getComputedStyle(badge).backgroundColor,
    teamColor: getComputedStyle(badge).getPropertyValue('--team-color').trim().toUpperCase(),
  }));
  expect(hiiStatusColor.teamColor).toBe('#F29A61');
  await expect(page.locator('.member-portrait > img')).toHaveAttribute(
    'src',
    '/assets/avatars/profile-kitten.webp',
  );

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
  await page.getByRole('radio', { name: '耳机兔兔' }).check();
  await selectTeam(page, 'Team X');
  await page.getByRole('button', { name: '保存成员资料' }).click();
  await expect(page.getByText('已保存')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('heading', { name: '许朝夕' })).toBeVisible();
  await expect(page.locator('.member-status')).toContainText('X');
  const xStatusColor = await page.locator('.member-status__team').evaluate((badge) => ({
    background: getComputedStyle(badge).backgroundColor,
    teamColor: getComputedStyle(badge).getPropertyValue('--team-color').trim().toUpperCase(),
  }));
  expect(xStatusColor.teamColor).toBe('#68B99A');
  expect(xStatusColor.background).not.toBe(hiiStatusColor.background);
  await expect(page.locator('.member-portrait > img')).toHaveAttribute(
    'src',
    '/assets/avatars/profile-bunny.webp',
  );

  await page.reload();
  await expect(page.getByRole('heading', { name: '许朝夕' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('clip-simulator:player-profile:v1') ?? '{}'),
      ),
    )
    .toEqual({ idolName: '许朝夕', teamId: 'x', avatarId: 'bunny' });

  await page.evaluate(() =>
    localStorage.setItem(
      'clip-simulator:player-profile:v1',
      JSON.stringify({ idolName: '旧档成员', teamId: 'sii' }),
    ),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: '旧档成员' })).toBeVisible();
  await expect(page.locator('.member-portrait > img')).toHaveAttribute(
    'src',
    '/assets/avatars/profile-cafe.webp',
  );
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
  await expect(messageList.getByText('第 0 日', { exact: true })).toHaveCount(0);
  const yuzuPendingRow = messageList
    .locator('.conversation-group--pending')
    .getByRole('button', { name: /柚子汽水/ });
  await expect(yuzuPendingRow).toHaveClass('conversation-row');
  await expect(yuzuPendingRow).toContainText('还有 7 天过期');
  for (const tag of YUZU_FAN.tags) {
    await expect(yuzuPendingRow.locator('.fan-tag-list')).toContainText(tag);
  }
  await expect(repliedGroup(page).getByRole('button', { name: /奶茶去冰/ })).toHaveClass(
    'conversation-row',
  );
  await expect(page.getByText(/NPC/i)).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/playtest/game-workbench-mobile.png' });

  await yuzuPendingRow.click();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toBeVisible();
  for (const tag of YUZU_FAN.tags) {
    await expect(page.locator('.reply-header .fan-tag-list')).toContainText(tag);
  }
  await expect(page.getByText('出道第 18 天', { exact: true })).toBeVisible();
  await expect(page.getByText(/班主任问大家最近有什么开心的事/)).toBeVisible();
  await expect(page.locator('.chat-row--fan .fan-message').last()).toContainText('今天正式放暑假');
  await expect(page.locator('.choice-card__cost').first()).toHaveAttribute(
    'aria-label',
    /消耗 1 点精力，1 点心情/,
  );
  await expect(page.locator('.choice-card__cost').first().locator('svg')).toHaveCount(2);
  const longChoice = page.getByRole('button', { name: /今晚直播记得来支持下我的业务/ });
  await expect(longChoice).toContainText('总选月我最近真的很需要你们');
  // 打开待回复翻牌后，选项区应直接出现在视口内，无需手动滚到底
  await expect(page.locator('.choice-section')).toBeInViewport();
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
  await page.getByRole('button', { name: /计划表本来就是用来放弃的/ }).click();
  await expect(page.getByText(`${YUZU_DISPLAY_NAME} · 好感变化`)).toBeVisible();
  await expect(page.getByRole('heading', { name: '+10' })).toBeVisible();
  await expect(page.locator('.reaction-ticket__change--positive')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: 'artifacts/playtest/game-reply-settlement-mobile.png',
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
  await expect(page.getByText(/今天正式放暑假/)).toBeVisible();
  await expect(page.getByText(/计划表本来就是用来放弃的/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toHaveCount(0);
  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(repliedGroup(page).getByRole('button', { name: /柚子汽水/ })).toBeVisible();

  await ordinaryRow.click();
  await expect(page.getByText('今天吃了吗？')).toBeVisible();
  await expect(page.getByText('吃了，吃的是公司的画饼。')).toBeVisible();
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

  const takeoutAlignment = await actions.locator('.takeout-button').evaluate((button) => {
    const icon = button.querySelector('svg');
    const copy = button.querySelector(':scope > span');
    const buttonRect = button.getBoundingClientRect();
    const iconRect = icon?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    if (!iconRect || !copyRect) return undefined;
    const contentLeft = Math.min(iconRect.left, copyRect.left);
    const contentRight = Math.max(iconRect.right, copyRect.right);
    return {
      justifyContent: getComputedStyle(button).justifyContent,
      centerDelta: Math.abs(
        (contentLeft + contentRight) / 2 - (buttonRect.left + buttonRect.right) / 2,
      ),
    };
  });
  expect(takeoutAlignment?.justifyContent).toBe('center');
  expect(takeoutAlignment?.centerDelta).toBeLessThanOrEqual(1);

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

test('name-linked ordinary fans reveal read-only question-and-answer chatter over time', async ({
  page,
}) => {
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  await page.getByRole('button', { name: '几天后', exact: true }).click();

  const pendingGroup = inboxMessageList(page).locator('.conversation-group--pending');
  await expect(
    pendingGroup.getByRole('button', { name: new RegExp(`${DEFAULT_IDOL_NAME}的狗`) }),
  ).toHaveCount(0);

  const firstTopicRow = repliedGroup(page).getByRole('button', {
    name: new RegExp(`${DEFAULT_IDOL_NAME}的狗.*第 4 日`),
  });
  await expect(firstTopicRow).not.toContainText('话题菜单');
  await firstTopicRow.click();
  await expect(page.getByText(/计算器先申请退河了/)).toBeVisible();
  await expect(page.getByText(/数学竞赛披了件MV外套/)).toBeVisible();
  await expect(page.getByText(/计算器比我先退河/)).toBeVisible();
  await expect(page.locator('.idol-message')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '选个角度聊聊' })).toHaveCount(0);

  await page.getByRole('button', { name: '返回翻牌消息' }).click();

  for (let turn = 0; turn < 4; turn += 1) {
    await page.getByRole('button', { name: '几天后', exact: true }).click();
  }
  const nickname = `${Array.from(DEFAULT_IDOL_NAME).at(-1)?.repeat(2)}的狗（改名版）`;
  const secondTopicRow = repliedGroup(page).getByRole('button', {
    name: new RegExp(`${nickname}.*第 16 日`),
  });
  await expect(secondTopicRow).toBeVisible();
  await secondTopicRow.click();
  await expect(page.getByRole('heading', { name: nickname })).toBeVisible();
  await expect(page.getByText(/400星梦值折0.3作品分/)).toBeVisible();
  await expect(page.getByText(/EP公告还是大型阅读理解/)).toBeVisible();
  await expect(page.getByText(/汪得量力而行/).first()).toBeVisible();
});

test('takeout shows a lightweight receipt with mood recovery', async ({ page }) => {
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  const actions = fixedTurnActions(page);
  const takeoutButton = actions.getByRole('button', { name: /外卖/ });
  await expect(takeoutButton).toContainText(/精力 \+3.*心情 \+3/);
  await page.evaluate(() => {
    Math.random = () => 0.3;
  });
  await takeoutButton.click();

  const receipt = page.getByRole('dialog', { name: /点了一份/ });
  await expect(receipt).toBeVisible();
  const heading = receipt.getByRole('heading');
  await expect(heading).toHaveText('点了一份麻辣烫');
  await expect(receipt).toContainText('精力 +3');
  await expect(receipt).toContainText('心情 +3');
  const foodImage = receipt.getByRole('img');
  await expect(foodImage).toHaveAttribute('src', '/assets/takeout/malatang-takeout.jpg');
  await expect(foodImage).toHaveAttribute('alt', '装在单人外卖碗里的热汤和面食');
  await expect
    .poll(() => foodImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByText('心态', { exact: true })).toHaveCount(0);
  await expect(page.locator('.lucide-brain')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/playtest/game-takeout-receipt-mobile.png' });

  await page.keyboard.press('Escape');
  await expect(receipt).toHaveCount(0);
  await expect(actions.getByRole('button', { name: '几天后', exact: true })).toBeFocused();
});

test('statistics stay off-screen and mirror to a developer-only JSON file', async ({ page }) => {
  const remoteEvents: Array<Record<string, any>> = [];
  await page.route('**/api/statistics', async (route) => {
    remoteEvents.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await expect(page.getByText('统计数据', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();

  const storedStatistics = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clip-simulator:statistics:v1') ?? '{}'),
  );
  const packKey = `${testStoryJson.id}@${testStoryJson.contentVersion}`;
  expect(storedStatistics.packs[packKey].totals.runsStarted).toBe(1);
  expect(storedStatistics.packs[packKey].startedModes.standard).toBe(1);
  expect(JSON.stringify(storedStatistics)).not.toContain(DEFAULT_IDOL_NAME);

  const developerApi = await page.evaluate(() => {
    const api = window.__CLIP_STATS__;
    return {
      filename: api?.filename,
      canRead: typeof api?.read === 'function',
      canReadFile: typeof api?.file === 'function',
      canDownload: typeof api?.download === 'function',
      enumerable: Object.keys(window).includes('__CLIP_STATS__'),
    };
  });
  expect(developerApi).toEqual({
    filename: 'clip-simulator-statistics.json',
    canRead: true,
    canReadFile: true,
    canDownload: true,
    enumerable: false,
  });

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const file = await window.__CLIP_STATS__?.file();
        return file ? await file.text() : '';
      }),
    )
    .toContain('"runsStarted": 1');

  await expect.poll(() => remoteEvents.length).toBe(1);
  expect(remoteEvents[0]).toMatchObject({
    schemaVersion: 1,
    event: 'run_started',
    run: {
      storyPackId: testStoryJson.id,
      contentVersion: testStoryJson.contentVersion,
      mode: 'standard',
    },
  });
  expect(JSON.stringify(remoteEvents[0])).not.toContain(DEFAULT_IDOL_NAME);

  await page.getByRole('button', { name: '返回主菜单' }).click();
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '放弃进度，从头开始' }).click();
  await expect.poll(() => remoteEvents.length).toBe(3);
  expect(remoteEvents[1]).toMatchObject({
    event: 'run_finished',
    run: { id: remoteEvents[0]?.run.id },
    result: { outcome: 'abandoned' },
  });
  expect(remoteEvents[2]).toMatchObject({ event: 'run_started' });
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
    .getByRole('button', { name: /今天正式放暑假/ });
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
    name: /今天正式放暑假/,
  });
  const secondYuzu = pendingGroup.getByRole('button', {
    name: /期末成绩出来了/,
  });
  await expect(yuzuRows).toHaveCount(2);
  await expect(firstYuzu).toContainText('还有 1 天过期');
  await expect(secondYuzu).toContainText('期末成绩出来了');
  await expect(secondYuzu).toContainText('还有 7 天过期');
  await expect(firstYuzu.locator('time')).toHaveClass(/\bconversation-row__timing--urgent\b/);
  await expect(secondYuzu.locator('time')).not.toHaveClass(/\bconversation-row__timing--urgent\b/);
  await expect
    .poll(() => firstYuzu.locator('time').evaluate((timing) => getComputedStyle(timing).color))
    .toBe('rgb(185, 56, 84)');

  await firstYuzu.click();
  await expect(page.getByText(/今天正式放暑假/)).toBeVisible();
  await page.getByRole('button', { name: /计划表本来就是用来放弃的/ }).click();
  await page.getByRole('button', { name: /回到工作台/ }).click();

  const remainingYuzu = pendingGroup.getByRole('button', { name: /柚子汽水/ });
  await expect(remainingYuzu).toHaveCount(1);
  await expect(remainingYuzu).toContainText('期末成绩出来了');
  await expect(remainingYuzu).toContainText('还有 7 天过期');
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
  await expect(expiredRow).toContainText('今天正式放暑假');
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

test('realistic mode hides numeric affinity feedback', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '营业设置' })).toBeVisible();
  const restartButton = page.getByRole('button', { name: '放弃进度，从头开始' });
  await expect(restartButton).toBeVisible();
  await expect(page.getByText('选择后仍可在设置中修改')).toHaveCount(0);
  await page.waitForTimeout(250);
  await page.screenshot({ path: testInfo.outputPath('game-member-pocket-settings-sheet.png') });
  await restartButton.scrollIntoViewIfNeeded();
  const restartNote = page.locator('.settings-restart-note');
  const [restartBox, noteBox] = await Promise.all([
    restartButton.boundingBox(),
    restartNote.boundingBox(),
  ]);
  expect((restartBox?.y ?? 0) + (restartBox?.height ?? 0)).toBeLessThanOrEqual(noteBox?.y ?? 0);
  await page.screenshot({ path: testInfo.outputPath('game-settings-restart-mobile.png') });
  await page.getByRole('button', { name: /拟真模式/ }).click();
  await expect(page.getByRole('button', { name: /拟真模式/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '关闭' }).click();
  await page.reload();
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  await page
    .locator('.conversation-group--pending')
    .getByRole('button', { name: /柚子汽水/ })
    .click();
  await page.getByRole('button', { name: /计划表本来就是用来放弃的/ }).click();

  await expect(page.getByRole('heading', { name: '+10' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '上升' })).toBeVisible();
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

  await page
    .locator('.conversation-group--pending')
    .getByRole('button', { name: /柚子汽水/ })
    .click();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toBeVisible();
  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(inboxMessageList(page)).toBeVisible();

  await page.goForward();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toBeVisible();
  await page.getByRole('button', { name: /计划表本来就是用来放弃的/ }).click();
  await expect(page.getByRole('heading', { name: '+10' })).toBeVisible();

  await page.goBack();
  await expect(inboxMessageList(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toHaveCount(0);

  await page.goForward();
  await expect(page.getByRole('heading', { name: '+10' })).toBeVisible();
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
  await expect(page.getByText('吃了，吃的是公司的画饼。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toHaveCount(0);
  await page.goBack();
  await expect(inboxMessageList(page)).toBeVisible();
  await expect(repliedGroup(page).getByRole('button', { name: /奶茶去冰/ })).toBeVisible();
});

test('the fourth takeout triggers the early ending', async ({ page }) => {
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  for (let order = 1; order <= 4; order += 1) {
    await fixedTurnActions(page).getByRole('button', { name: /外卖/ }).click();
    await expect(page.getByRole('dialog', { name: /点了一份/ })).toBeVisible();
    if (order < 4) {
      await page.getByRole('button', { name: '开吃' }).click();
      await fixedTurnActions(page).getByRole('button', { name: '几天后', exact: true }).click();
    } else {
      await expect(page.getByRole('heading', { name: '胖成一条蛆，耻辱退团' })).toHaveCount(0);
      await page.getByRole('button', { name: '开吃' }).click();
    }
  }

  await expect(page.getByRole('heading', { name: '胖成一条蛆，耻辱退团' })).toBeVisible();
  const endingPost = page.getByRole('img', { name: TAKEOUT_ENDING.image.alt });
  await expect(endingPost).toBeVisible();
  await expect
    .poll(() => endingPost.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByText(/提前结局/)).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: 'artifacts/playtest/game-takeout-ending-mobile.png',
    fullPage: true,
  });

  await page.reload();
  await expect(page.getByRole('heading', { name: '胖成一条蛆，耻辱退团' })).toBeVisible();
  await expect(page.getByRole('button', { name: '回到上一回合' })).toBeEnabled();
  await page.getByRole('button', { name: '回到上一回合' }).click();
  await expect(page.getByRole('heading', { name: '翻牌消息' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '胖成一条蛆，耻辱退团' })).toHaveCount(0);
  const restoredSave = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clip-simulator:save:v1') ?? 'null'),
  );
  expect(restoredSave).toMatchObject({ status: 'playing', turn: 4, takeoutCount: 3 });
  expect(
    await page.evaluate(() => localStorage.getItem('clip-simulator:early-ending-checkpoint:v1')),
  ).toBeNull();
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

  const conversation = inboxMessageList(page)
    .locator('.conversation-group--pending')
    .getByRole('button', { name: /柚子汽水/ });
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
  await expect(page.getByRole('dialog', { name: /点了一份/ })).toBeVisible();
  await page.keyboard.press('Escape');

  const daysLater = actions.getByRole('button', { name: '几天后', exact: true });
  await expect(daysLater).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.game-header__countdown')).toHaveText('离总选结束还剩 26 天');
});

test('a mid-session reload with an outdated save restarts cleanly and stays usable', async ({
  page,
}) => {
  // 先正常回一条，产生已回复会话
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  await inboxMessageList(page)
    .locator('.conversation-group--pending')
    .getByRole('button', { name: /柚子汽水/ })
    .click();
  await page.getByRole('button', { name: /计划表本来就是用来放弃的/ }).click();
  await page.getByRole('button', { name: /回到工作台/ }).click();

  // 模拟内容包升级：存档版本落后 → 加载时应静默重开
  await page.evaluate(() => {
    const key = 'clip-simulator:save:v1';
    const state = JSON.parse(localStorage.getItem(key) as string) as { contentVersion: string };
    state.contentVersion = '0.8.0';
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  // 重开后主页与翻牌入口仍可用
  await expect(page.getByRole('heading', { name: DEFAULT_IDOL_NAME })).toBeVisible();
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();
  await expect(
    inboxMessageList(page)
      .locator('.conversation-group--pending')
      .getByRole('button', { name: /柚子汽水/ }),
  ).toBeVisible();

  // 回一条 → 已回复行可点 → 返回按钮可点
  await inboxMessageList(page)
    .locator('.conversation-group--pending')
    .getByRole('button', { name: /柚子汽水/ })
    .click();
  await page.getByRole('button', { name: /计划表本来就是用来放弃的/ }).click();
  await page.getByRole('button', { name: /回到工作台/ }).click();
  await repliedGroup(page)
    .getByRole('button', { name: /柚子汽水/ })
    .click();
  await expect(page.getByRole('heading', { name: '选择一条回复' })).toHaveCount(0);
  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(inboxMessageList(page)).toBeVisible();
});

test('day-one rows for core fans open their history with or without a pending flip', async ({
  page,
}) => {
  await page.getByRole('button', { name: /翻牌.*待回复/ }).click();

  // Mico_ 第 1 天已有待回复翻牌，从待回复行打开：赛前旧聊天和回复选项都应出现
  await inboxMessageList(page)
    .locator('.conversation-group--pending')
    .getByRole('button', { name: /Mico_/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Mico_' })).toBeVisible();
  await expect(page.getByText('四个月前', { exact: true })).toBeVisible();
  await expect(page.getByText(/你还记得上次握手我说的名字吗/)).toBeVisible();
  await expect(page.locator('.choice-section')).toHaveCount(1);
  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(inboxMessageList(page)).toBeVisible();

  // 椰子饼蛋挞酱第 1 天有待回复翻牌，从待回复行打开，聊天里同样应包含赛前旧聊天
  await inboxMessageList(page)
    .locator('.conversation-group--pending')
    .getByRole('button', { name: /椰子饼蛋挞酱/ })
    .click();
  await expect(page.getByRole('heading', { name: '椰子饼蛋挞酱' })).toBeVisible();
  await expect(page.getByText('出道公演后', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(inboxMessageList(page)).toBeVisible();

  // Blaze火第 1 天只有旧聊天，走已回复区
  await repliedGroup(page)
    .getByRole('button', { name: /Blaze火/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Blaze火' })).toBeVisible();
  await expect(page.getByText('四个月前', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回翻牌消息' }).click();
  await expect(inboxMessageList(page)).toBeVisible();
});
