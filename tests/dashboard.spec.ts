// 本地演示 E2E 覆盖 iframe、canvas 与结构化表格，始终不依赖模型密钥。
import { expect, test } from '@playwright/test';
import { DashboardPage } from '../src/pages/dashboard.page';

test('dashboard uses native Playwright for iframe, canvas, and table data', async ({ page }) => {
  await page.goto('/dashboard');
  const dashboard = new DashboardPage(page);

  await dashboard.fillSecureIframeForm('automation-pipeline@example.com');
  await expect(page.frameLocator('iframe.secure-vendor-frame').locator('#corporate-email'))
    .toHaveValue('automation-pipeline@example.com');
  await dashboard.selectCanvasChartSegment(0.65, 0.5);

  const transactions = await dashboard.getAllTransactionRows();
  expect(transactions).toEqual([
    { date: '2026-10-20', status: 'Completed' },
    { date: '2026-10-19', status: 'Pending' },
  ]);
});
