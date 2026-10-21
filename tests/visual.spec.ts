// 视觉测试只验证模型能力，独立于无密钥即可运行的 smoke 项目与报告统计。
import { expect, test } from '@playwright/test';
import { DashboardPage } from '../src/pages/dashboard.page';

test('dashboard visual state is verified by Midscene', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Automation Demo Dashboard' })).toBeVisible();
  await new DashboardPage(page).verifyDashboardState();
});
