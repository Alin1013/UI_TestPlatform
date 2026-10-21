// E2E 示例覆盖 iframe 表单、canvas 坐标交互与 Midscene 视觉校验/抽取的组合流程。
import { expect, test } from '@playwright/test';
import { DashboardPage } from '../src/pages/dashboard.page';

test.describe('Hybrid dashboard automation example', () => {
  // 此示例绑定方案中的特定 DOM 结构；没有目标站点或 AI 密钥时跳过而非误测任意网站。
  test.skip(
    !process.env.APP_BASE_URL || !process.env.OPENAI_API_KEY,
    'Set APP_BASE_URL and OPENAI_API_KEY to run the app-specific dashboard example.',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('handles iframe, canvas, visual assertions, and table extraction', async ({ page }) => {
    const dashboard = new DashboardPage(page);

    await dashboard.fillSecureIframeForm('automation-pipeline@example.com');
    await dashboard.selectCanvasChartSegment(0.65, 0.5);
    await dashboard.verifyDashboardState();

    const transactions = await dashboard.getTransactionRows();
    expect(transactions.length).toBeGreaterThan(0);
    expect(transactions[0]).toHaveProperty('status');
  });
});
