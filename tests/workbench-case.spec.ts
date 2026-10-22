// 工作台执行器：把界面保存的受限步骤映射为 Playwright 操作和断言。
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('runs saved workbench cases in the requested composition order', async ({ page }) => {
  const allCases = JSON.parse(await readFile('.local-test-cases.json', 'utf8'));
  // 批次顺序来自工作台选择顺序；兼容旧环境变量，便于已有本地调用继续执行。
  const ids = process.env.PLAYWRIGHT_CASE_IDS
    ? JSON.parse(process.env.PLAYWRIGHT_CASE_IDS) as string[]
    : [process.env.PLAYWRIGHT_CASE_ID];
  const testCases = ids.map((id) => allCases.find((item: { id: string }) => item.id === id));
  expect(testCases.length, '请先在用例工作台选择至少一个用例').toBeGreaterThan(0);
  expect(testCases.every(Boolean), '组合中的用例必须已保存').toBeTruthy();

  for (const testCase of testCases) {
    for (const step of testCase.steps as Array<{ action: string; selector?: string; value: string }>) {
      // 每个用例继续执行同一动作白名单，组合只改变顺序，不增加可执行能力。
      if (step.action === 'goto') {
        await page.goto(step.value);
      } else if (step.action === 'click') {
        await page.locator(step.selector!).click();
      } else if (step.action === 'fill') {
        await page.locator(step.selector!).fill(step.value);
      } else if (step.action === 'assertVisible') {
        await expect(page.locator(step.selector!)).toBeVisible();
      } else if (step.action === 'assertText') {
        await expect(page.locator(step.selector!)).toContainText(step.value);
      } else {
        throw new Error(`不支持的步骤：${step.action}`);
      }
    }
  }
});
