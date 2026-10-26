// 工作台执行器：重放已保存的语义描述或受限步骤，并将语义动作交给 Midscene。
import { expect, test } from '@playwright/test';
import { PlaywrightAgent, type PageAgent } from '@midscene/web';

test('runs saved workbench cases in the requested composition order', async ({ page }) => {
  // 批次顺序来自工作台选择顺序；兼容旧环境变量，便于已有本地调用继续执行。
  const ids = process.env.PLAYWRIGHT_CASE_IDS
    ? JSON.parse(process.env.PLAYWRIGHT_CASE_IDS) as string[]
    : [process.env.PLAYWRIGHT_CASE_ID];
  const casesSnapshot = process.env.PLAYWRIGHT_CASES_JSON ? JSON.parse(process.env.PLAYWRIGHT_CASES_JSON) : [];
  const testCases = ids.map((id) => casesSnapshot.find((item: { id: string }) => item.id === id));
  expect(testCases.length, '请先在用例工作台选择至少一个用例').toBeGreaterThan(0);
  expect(testCases.every(Boolean), '组合中的用例必须已保存').toBeTruthy();

  for (const testCase of testCases) {
    if (testCase.mode === 'semantic') {
      // 语义用例只保存用户意图；每次重放都由 Midscene 基于当前页面规划动作。
      // Web 1.16 的 PlaywrightAgent 类型声明未完整继承核心 Agent 方法，运行时对象仍实现这些 API。
      const agent = new PlaywrightAgent(page) as unknown as Pick<PageAgent, 'aiAct' | 'aiAssert' | 'destroy'>;
      try {
        await agent.aiAct(testCase.prompt);
        await agent.aiAssert(`The requested scenario was completed: ${testCase.name}`);
      } finally {
        await agent.destroy();
      }
      continue;
    }

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
