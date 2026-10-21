// 浏览器运行时 smoke 用例不依赖被测站点或模型凭据，确保默认测试命令确实执行检查。
import { expect, test } from '@playwright/test';

test('local demo dashboard exposes a usable deterministic smoke path', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Automation Demo Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Ready' }).click();
  await expect(page.getByRole('button', { name: 'Ready' })).toBeVisible();
});
