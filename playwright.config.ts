// 项目级 Playwright 配置：统一环境变量、浏览器项目与失败诊断产物。
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';
import { loadRuntimeConfig } from './src/config/runtime-config';

// 从仓库根目录加载本地配置；CI 环境变量仍可覆盖该文件中的值。
dotenv.config({ path: path.resolve(__dirname, '.env') });

// 在 Playwright 启动 worker 前校验 URL 与并发配置，避免配置错误表现成用例故障。
const runtimeConfig = loadRuntimeConfig(process.env);
const isCI = runtimeConfig.isCI;
const usesBundledDemo = runtimeConfig.appBaseUrl === 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  // 只有使用默认本地目标时才启动 demo，接入外部测试环境不额外占用端口。
  ...(usesBundledDemo ? {
    webServer: {
      command: 'npm run demo',
      url: 'http://127.0.0.1:4173/health',
      reuseExistingServer: !isCI,
      timeout: 15_000,
    },
  } : {}),
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: runtimeConfig.workers ?? (isCI ? 2 : undefined),
  timeout: 60_000,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['list'],
  ],
  use: {
    // 默认地址指向随仓库提供的演示站点，显式配置时才访问用户指定的测试环境。
    baseURL: runtimeConfig.appBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /(?:smoke|dashboard)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // 工作台动态用例单独运行，避免默认 smoke 命令因缺少本地用例而失败。
      name: 'workbench',
      testMatch: /workbench-case\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // AI 用例独立成项目；脚本入口会在启动浏览器前强制检查密钥和模型名。
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
