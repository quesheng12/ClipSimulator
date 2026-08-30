import { expect, test } from '@playwright/test';
import testStoryJson from '../../content/test-story.json' with { type: 'json' };

const YUZU_FAN = testStoryJson.fans.find((fan) => fan.id === 'yuzu');

if (!YUZU_FAN) {
  throw new Error('The E2E story fixture must include the yuzu core fan.');
}

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4174');
});

test('filters story lines and edits a selected node', async ({ page }) => {
  await expect(page.getByText('翻牌剧情工作台')).toBeVisible();
  await expect(page.getByText(`${testStoryJson.nodes.length} 个核心翻牌`)).toBeVisible();
  await page.getByText('暑假第一天的作息表', { exact: true }).click();

  const title = page.getByLabel('标题', { exact: true });
  await expect(title).toHaveValue('暑假第一天的作息表');
  await title.fill('暑假第一天的作息表（测试修改）');
  await expect(page.getByText('暑假第一天的作息表（测试修改）', { exact: true })).toBeVisible();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'artifacts/playtest/editor-node-inspector.png' });

  await page.getByRole('checkbox', { name: /柚子汽水/ }).uncheck();
  await expect(page.getByText('暑假第一天的作息表（测试修改）', { exact: true })).toHaveCount(0);
});

test('assigns a recoverable special ending to one reply option', async ({ page }) => {
  await page.getByText('暑假第一天的作息表', { exact: true }).click();
  const endingSelect = page.getByLabel('特殊结局', { exact: true }).first();
  const nextNodeSelect = page.getByLabel('后续节点', { exact: true }).first();

  await expect(endingSelect).toHaveValue('');
  await endingSelect.selectOption('takeout-idol');
  await expect(endingSelect).toHaveValue('takeout-idol');
  await expect(nextNodeSelect).toBeDisabled();
  await expect(page.getByText(/看完结局会恢复到选择这条回复之前/).first()).toBeVisible();
  await expect(page.getByText('剧情结构可用')).toBeVisible();
  await endingSelect.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/playtest/editor-choice-ending.png' });
});

test('configures a downstream flip to appear immediately after a reply', async ({ page }) => {
  await page.getByText('暑假第一天的作息表', { exact: true }).click();
  const timingSelect = page.getByLabel('后续节点出现时机', { exact: true }).first();

  await expect(timingSelect).toBeEnabled();
  await expect(timingSelect).toHaveValue('day-start');
  await timingSelect.selectOption('immediate');
  await expect(timingSelect).toHaveValue('immediate');
  await expect(page.getByText(/发布日期不晚于当前游戏日/).first()).toBeVisible();
  await expect(page.getByText('剧情结构可用')).toBeVisible();
  await timingSelect.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/playtest/editor-choice-timing.png' });
});

test('edits per-reply affinity and popularity values', async ({ page }) => {
  await page.getByText('暑假第一天的作息表', { exact: true }).click();
  const affinityInput = page.getByLabel('当前粉丝好感变化', { exact: true }).first();
  const popularityInput = page.getByLabel('泛人气变化', { exact: true }).first();

  await expect(affinityInput).toHaveValue('10');
  await expect(popularityInput).toHaveValue('0');

  await affinityInput.fill('12');
  await popularityInput.fill('-3');

  await expect(page.getByLabel('效果 JSON').first()).toHaveValue(/"yuzu": 12/);
  await expect(page.getByLabel('效果 JSON').first()).toHaveValue(/"popularity": -3/);
  await expect(page.getByText('剧情结构可用')).toBeVisible();
  await popularityInput.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/playtest/editor-choice-effects.png' });
});

test('creates and safely deletes a node with undo available', async ({ page }) => {
  await page.getByRole('button', { name: /新建节点/ }).click();
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('新的翻牌');
  await page.getByTitle('删除节点').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused();
  await page.screenshot({ path: 'artifacts/playtest/editor-delete-dialog.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.getByTitle('删除节点').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const reopenedDialog = page.getByRole('dialog');
  await reopenedDialog.getByRole('button', { name: '删除节点' }).click();
  await expect(page.getByRole('button', { name: /撤销/ })).toBeEnabled();
});

test('authors extensible day-start node trigger conditions', async ({ page }) => {
  await page.getByText('暑假第一天的作息表', { exact: true }).click();
  const triggerEditor = page.locator('.trigger-editor');
  await expect(triggerEditor.getByText('无额外条件', { exact: false })).toBeVisible();
  await triggerEditor.getByRole('button', { name: '新增触发条件' }).click();

  await triggerEditor.getByLabel('触发条件 1 类型').selectOption('takeout-orders-at-least');
  await triggerEditor.getByLabel('触发条件 1 数量').fill('2');
  await expect(triggerEditor.getByLabel('触发条件 1 数量')).toHaveValue('2');
  const selectedNodeCard = page.getByTestId('rf__node-yuzu-01');
  await expect(selectedNodeCard.locator('.node-trigger-badge')).toContainText('日初 · 全部 1');

  await triggerEditor.getByRole('button', { name: '新增触发条件' }).click();
  await triggerEditor
    .getByLabel('触发条件 2 类型')
    .selectOption('consecutive-replies-delayed-at-least');
  await triggerEditor.getByLabel('触发条件 2 粉丝').selectOption('patron');
  await triggerEditor.getByLabel('触发条件 2 连续次数').fill('2');
  await triggerEditor.getByLabel('触发条件 2 等待回合').fill('2');
  await triggerEditor.getByLabel('多条条件').selectOption('any');
  await expect(selectedNodeCard.locator('.node-trigger-badge')).toContainText('日初 · 任一 2');
});

test('edits global profile data and previews template variables with long-text guidance', async ({
  page,
}) => {
  await page.getByRole('button', { name: '编辑内容包与变量' }).click();
  await expect(page.getByText('内容包与变量', { exact: true })).toBeVisible();
  await expect(page.getByText(/当前仅使用改编姓名/)).toBeVisible();
  const adaptedPool = page.locator('.name-pool-editor').filter({ hasText: '改编姓名' });
  const originalPool = page.locator('.name-pool-editor').filter({ hasText: '原创姓名' });
  await expect(page.getByRole('textbox', { name: '改编姓名 1', exact: true })).toHaveValue(
    '曹可恬',
  );
  await expect(adaptedPool.locator('input')).toHaveCount(70);
  await expect(originalPool.locator('input')).toHaveCount(0);

  await adaptedPool.locator('summary').click();
  await originalPool.locator('summary').click();
  const emptyOriginalPool = page.getByText('暂未使用原创姓名，可以随时从这里添加。');
  await emptyOriginalPool.scrollIntoViewIfNeeded();
  await expect(emptyOriginalPool).toBeInViewport();
  await page.screenshot({ path: 'artifacts/playtest/editor-name-pools.png' });

  await page.locator('#preview-idol-name').fill('测试成员');
  await page.getByRole('combobox', { name: '所属队伍' }).selectOption('nii');
  const cityVariableRow = page.locator('.key-value-row').first();
  await expect(cityVariableRow.locator('input').first()).toHaveValue('cityName');
  await cityVariableRow.locator('input').nth(1).fill('海城');
  await expect(page.getByText('{{idolName}}', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/playtest/editor-content-variables.png' });

  await page.getByText('暑假第一天的作息表', { exact: true }).click();
  const preview = page.locator('.template-preview');
  await expect(preview).toContainText('员员！今天我正式放暑假啦');

  const longReply = page.getByLabel('回复文字').nth(2);
  await expect(longReply).toHaveValue(/今晚直播记得来支持下我的业务/);
  await expect
    .poll(() => longReply.evaluate((field) => Math.round(field.getBoundingClientRect().height)))
    .toBeGreaterThan(60);
  await longReply.fill('长'.repeat(141));
  await expect(page.getByText('141 / 140 字')).toBeVisible();
  await expect(page.getByText('建议精简到 140 字以内；当前多出 1 字。')).toBeVisible();
  await page.screenshot({ path: 'artifacts/playtest/editor-template-preview.png' });
});

test('edits core fan identity, tags, and relationship history without breaking references', async ({
  page,
}) => {
  await page.getByRole('button', { name: '编辑内容包与变量' }).click();
  const adaptedPool = page.locator('.name-pool-editor').filter({ hasText: '改编姓名' });
  if (await adaptedPool.evaluate((element) => element.hasAttribute('open'))) {
    await adaptedPool.locator('summary').click();
  }

  const fanEditor = page.locator('details.core-fan-editor').filter({ hasText: '柚子汽水' });
  await fanEditor.locator('summary').click();
  await expect(fanEditor.getByLabel('稳定 ID')).toHaveValue('yuzu');
  const tagInputs = fanEditor.locator('.core-fan-tag-row input');
  await expect(tagInputs).toHaveCount(YUZU_FAN.tags.length);
  await expect(fanEditor.locator('.core-fan-history-card')).toHaveCount(4);

  await tagInputs.first().fill('学生党');
  await fanEditor.getByRole('button', { name: /新增过往聊天/ }).click();
  await expect(fanEditor.locator('.core-fan-history-card')).toHaveCount(5);

  const stableId = fanEditor.getByLabel('稳定 ID');
  await stableId.fill('yuzu-renamed');
  await stableId.press('Tab');
  await expect(stableId).toHaveValue('yuzu-renamed');
  await expect(page.getByText('剧情结构可用')).toBeVisible();

  await page.getByText('暑假第一天的作息表', { exact: true }).click();
  await expect(page.getByLabel('故事线')).toHaveValue('yuzu-renamed');
  await page.screenshot({ path: 'artifacts/playtest/editor-core-fan-history.png' });
});

test('edits and copies a name-linked ordinary NPC topic round', async ({ page }) => {
  await page.getByRole('button', { name: '编辑内容包与变量' }).click();
  const adaptedPool = page.locator('.name-pool-editor').filter({ hasText: '改编姓名' });
  if (await adaptedPool.evaluate((element) => element.hasAttribute('open'))) {
    await adaptedPool.locator('summary').click();
  }

  const topic = page.locator('details.npc-flip-editor').filter({ hasText: '曹可恬的狗' }).first();
  await topic.locator('summary').click();
  await expect(topic.getByLabel('稳定 contactId')).toHaveValue('idol-dog');
  await expect(topic.getByLabel('互动类型')).toHaveValue('automatic');
  await expect(topic.getByLabel('成员自动回复')).toBeVisible();
  await topic.getByLabel('互动类型').selectOption('chatter');
  await expect(topic.getByLabel(/NPC 连续消息/)).toHaveCount(0);
  await topic.getByRole('button', { name: '新增 NPC 连续气泡' }).click();
  await expect(topic.getByLabel(/NPC 连续消息/)).toHaveCount(1);
  await topic.getByRole('button', { name: '新增 NPC 连续气泡' }).click();
  await expect(topic.getByLabel(/NPC 连续消息/)).toHaveCount(2);

  await topic.getByLabel('NPC 昵称', { exact: true }).fill('{{idolName}}的小狗');
  const editedTopic = page
    .locator('details.npc-flip-editor')
    .filter({ hasText: '曹可恬的小狗' })
    .first();
  await editedTopic.locator('button[title="复制为同一 NPC 的下一轮"]').click();

  const rounds = page.locator('details.npc-flip-editor').filter({ hasText: '曹可恬的小狗' });
  await expect(rounds).toHaveCount(2);
  await expect(rounds.last().locator('summary')).toContainText('第 7 日 · NPC 闲聊');
});
