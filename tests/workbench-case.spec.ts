// 工作台执行器：把界面保存的受限步骤映射为 Playwright 操作和断言。
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('runs a saved workbench case', async ({ page }) => {
  const allCases = JSON.parse(await readFile('.local-test-cases.json', 'utf8'));
  const testCase = allCases.find((item: { id: string }) => item.id === process.env.PLAYWRIGHT_CASE_ID);
  expect(testCase, '请先在用例工作台保存要执行的用例').toBeTruthy();

  for (const step of testCase.steps as Array<{ action: string; selector?: string; value: string }>) {
    // 按受限动作白名单执行，避免把界面输入当作代码或命令求值。
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
});
