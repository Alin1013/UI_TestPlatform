# Enterprise UI Automation Framework

可直接运行的 Playwright + Midscene 混合式 UI 自动化框架。仓库自带本地演示站点，因此安装浏览器后，确定性 smoke 不需要业务 URL、账号或模型密钥；接入真实系统时再覆盖环境配置和页面对象。

## 环境与首次运行

- Node.js 20 或更新版本
- npm 与 Playwright Chromium

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
```

`npm test` 自动启动本地演示站点、运行 iframe/canvas/表格分页路径并生成 HTML、JUnit 和失败诊断。也可单独启动演示站点：`npm run demo`，访问 `http://127.0.0.1:4173/dashboard`。

## 常用命令

```sh
npm run test:smoke   # 无模型凭据的确定性用例
npm run test:ai      # 独立视觉项目；执行前要求 OPENAI_API_KEY 和 MIDSCENE_MODEL_NAME
npm run test:debug   # headed 调试
npm run test:report  # 查看 HTML 报告
npm run clean        # 清理报告与测试产物
```

配置通过 `.env` 或进程环境传入，`.env.example` 是无秘密模板：

- `APP_BASE_URL`：目标应用根地址；默认 `http://127.0.0.1:4173`，不会猜测或访问生产站点。
- `APP_ALLOWED_HOSTS`：外部目标必填的精确主机 allowlist（逗号分隔）；不在列表中的主机在 Playwright 启动前拒绝。
- `PLAYWRIGHT_WORKERS`：可选正整数并发上限；CI 未指定时使用 2。
- `OPENAI_API_KEY`、`MIDSCENE_MODEL_NAME`：仅 AI 用例需要。`OPENAI_BASE_URL` 用于组织批准的兼容网关。

AI 项目显式通过 `npm run test:ai` 启动，不会因缺少凭据而静默跳过。模型供应商、模型名和网关配置应在组织策略批准后设置；不要将 `.env`、认证状态或真实敏感数据提交/发送给未经批准的外部模型。

## 接入被测应用

将 `APP_BASE_URL` 指向获准的测试环境，按目标站点的真实语义改造 `src/pages/` 页面对象和 `tests/` 场景。优先使用 Playwright role/label/test id 与业务状态等待；标准 HTML 表格由 DOM 完整读取，视觉模型只用于 DOM 无法表达的判断。示例中的 iframe、canvas、路由和数据仅定义本地演示契约。

## CI 与诊断

Jenkinsfile 默认执行 typecheck 和无 AI smoke，模型检查可通过 `RUN_VISUAL` 参数启用；该路径需要 Jenkins 凭据 `OPENAI_API_KEY`、`MIDSCENE_MODEL_NAME`，并可选提供 `OPENAI_BASE_URL`。流水线始终尝试发布 JUnit 和 HTML/trace 等报告，测试退出码仍决定构建成败。所有 Playwright 诊断产物位于忽略的报告目录，不应跨构建复用认证状态。

更完整的分层、治理和演进说明见 [docs/TECHNICAL_SOLUTION.md](docs/TECHNICAL_SOLUTION.md)。
