import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4174');
});

test('filters story lines and edits a selected node', async ({ page }) => {
  await expect(page.getByText('翻牌剧情工作台')).toBeVisible();
  await expect(page.getByText('22 个核心翻牌')).toBeVisible();
  await page.getByText('入河仪式', { exact: true }).click();

  const title = page.getByLabel('标题');
  await expect(title).toHaveValue('入河仪式');
  await title.fill('入河仪式（测试修改）');
  await expect(page.getByText('入河仪式（测试修改）', { exact: true })).toBeVisible();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'artifacts/playtest/editor-node-inspector.png' });

  await page.getByRole('checkbox', { name: /柚子汽水/ }).uncheck();
  await expect(page.getByText('入河仪式（测试修改）', { exact: true })).toHaveCount(0);
});

test('creates and safely deletes a node with undo available', async ({ page }) => {
  await page.getByRole('button', { name: /新建节点/ }).click();
  await expect(page.getByLabel('标题')).toHaveValue('新的翻牌');
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
  await page.getByText('入河仪式', { exact: true }).click();
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

  await page.getByText('入河仪式', { exact: true }).click();
  const preview = page.locator('.template-preview');
  await expect(preview).toContainText('测试成员，第一次被翻到');
  await expect(preview).toContainText('Team NII');

  const longReply = page.getByLabel('回复文字').nth(2);
  await expect(longReply).toHaveValue(/先按自己的节奏认识我/);
  await expect
    .poll(() => longReply.evaluate((field) => Math.round(field.getBoundingClientRect().height)))
    .toBeGreaterThan(60);
  await longReply.fill('长'.repeat(141));
  await expect(page.getByText('141 / 140 字')).toBeVisible();
  await expect(page.getByText('建议精简到 140 字以内；当前多出 1 字。')).toBeVisible();
  await page.screenshot({ path: 'artifacts/playtest/editor-template-preview.png' });
});
