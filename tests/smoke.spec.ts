// 浏览器运行时 smoke 用例不依赖被测站点或模型凭据，确保默认测试命令确实执行检查。
import { expect, test } from '@playwright/test';

test('Playwright can render and interact with a semantic control', async ({ page }) => {
  // 内嵌文档让框架安装/浏览器启动验证可在没有业务环境时完成。
  await page.setContent('<main><button type="button">Ready</button></main>');
  await page.getByRole('button', { name: 'Ready' }).click();
  await expect(page.getByRole('button', { name: 'Ready' })).toBeVisible();
});
