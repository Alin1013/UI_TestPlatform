# 企业级混合式 UI 自动化平台技术方案

> 本文以仓库当前的 TypeScript、Playwright、Midscene.js 与 Jenkins 骨架为基础，定义从本地运行到 CI 交付的可实施方案。示例站点、路由、iframe、canvas 选择器均为占位契约，接入真实业务前必须替换。

## 1. 目标与边界

### 1.1 目标

- 用确定性浏览器自动化覆盖可访问性良好、结构稳定的核心业务路径。
- 仅在 DOM 语义不足时使用视觉模型，处理布局级断言、视觉定位辅助和非结构化内容理解。
- 在本地与 Jenkins 中复用相同的测试、配置、报告和诊断产物。
- 失败时保留足以复现问题的 trace、截图、视频、JUnit 和 HTML 报告；模型输入和密钥遵守数据治理要求。
- 提供从示例项目演进到多业务域、多环境和受控模型调用的分阶段路径。

### 1.2 非目标

- 不以 AI 代替所有 Playwright locator、断言或业务 API 检查。
- 不在未经授权的生产环境执行写操作、支付、删除等破坏性场景。
- 不把视觉模型输出视为唯一的业务正确性证据；金额、权限、状态变更等关键结果必须有 DOM、API 或数据库层面的确定性验证。
- 当前方案不包含 Slack/Teams 通知、测试数据服务、设备云或跨浏览器矩阵的具体企业接入；这些作为后续扩展点。

## 2. 设计原则

### 2.1 80/20 混合自动化

“80/20”是架构预算而非硬性配额：大多数步骤应由 Playwright 控制，Midscene 只负责 DOM 难以表达的视觉或语义任务。禁止为了满足比例而在不需要时调用模型。

| 场景 | 首选工具 | 说明 |
| --- | --- | --- |
| 导航、登录、表单、菜单、弹窗、上传、下载 | Playwright | 使用 role、label、test id 等语义定位器；断言用户可见结果 |
| iframe 内标准控件 | Playwright | 使用 `frameLocator`；跨域不会阻止浏览器自动化访问可操作 DOM |
| Canvas 图表 | 应用测试接口 / Playwright 坐标 | 优先让应用暴露可测语义或数据接口；坐标仅用于确实不可访问的图形区域 |
| 排版重叠、视觉完整性、自然语言描述的视觉状态 | Midscene | 低频调用；使用明确、有限、可验证的提示和超时 |
| 标准 HTML 数据表与分页 | Playwright | 读取行、点击下一页并验证页码/结束状态；AI 不应替代结构化提取 |
| 图片、扫描件或无语义内容 | Midscene | 输出后通过 schema、范围和业务不变量校验，必要时与 API 数据交叉核对 |

### 2.2 测试可靠性优先

- 定位策略按 `getByRole` / `getByLabel` / `getByPlaceholder` / 稳定 `data-testid` / CSS 选择器的优先顺序选择。
- 等待具体业务条件（元素可见、请求完成、状态文本改变），不把固定 sleep 当同步手段。
- 不默认等待 `networkidle`：长轮询、分析脚本和 WebSocket 会使它不稳定。页面模型应等待实际业务信号。
- 用例必须隔离数据与浏览器上下文；并行数需由环境容量和目标系统限流共同决定。
- 失败重试只用于隔离偶发环境波动，不得通过重试掩盖产品缺陷或断言错误。

## 3. 总体架构

```text
Jenkins / 本地 CLI
        │ 配置、凭据、目标环境
        ▼
Playwright Test Runner ── fixtures / hooks / reporters
        │                         │
        │ Page / BrowserContext   └── trace、截图、视频、JUnit、HTML
        ▼
Page Objects / Domain Flows
        ├── Native Playwright Adapter：locator、frame、下载、网络等待
        └── Midscene Adapter：视觉断言、受约束的视觉查询
                    │
                    └── OpenAI 或企业兼容模型网关
```

### 3.1 模块职责

- `tests/`：按业务能力组织 E2E 场景；描述用户行为和外部可见结果，不放通用定位细节。
- `src/pages/`：页面对象封装页面级操作；只暴露稳定业务动作，不泄露模型客户端或底层选择器。
- `src/flows/`（建议阶段二增加）：跨页面业务流程，例如创建、审批、查询；避免测试中重复编排。
- `src/fixtures/`（建议阶段二增加）：认证状态、测试数据、API 客户端和日志等生命周期管理。
- `src/config/`（建议阶段二增加）：经校验的环境配置；密钥不进入仓库或日志。
- Playwright 配置：浏览器项目、超时、并发、重试、reporter 与失败诊断。
- Jenkinsfile：固定 Node 镜像、依赖缓存策略、浏览器安装、测试执行、JUnit 发布和产物归档。

页面对象基类应只承担共享上下文和少量通用同步能力。Midscene 能力可经单独 adapter/fixture 延迟初始化，使纯 DOM 用例不需要模型密钥或模型调用。若 Midscene 当前版本要求从 `@midscene/web` 导出 `PlaywrightPage`，应在锁定依赖版本后以官方 API 校验其构造及方法签名。

### 3.2 建议目录

```text
.
├── docs/TECHNICAL_SOLUTION.md
├── src/
│   ├── config/                 # 环境变量解析与校验
│   ├── fixtures/               # Playwright fixtures 与认证状态
│   ├── pages/                   # 页面对象
│   ├── flows/                   # 跨页面业务流程（按需）
│   └── support/                 # 日志、数据校验、模型适配器
├── tests/
│   ├── smoke/                   # 快速部署门禁
│   ├── regression/              # 核心业务回归
│   └── visual/                  # 有明确模型预算的视觉场景
├── playwright.config.ts
├── Jenkinsfile
├── package.json
├── package-lock.json
└── .env.example
```

## 4. 运行时配置与凭据

### 4.1 环境变量契约

| 变量 | 必需 | 用途 | 示例/策略 |
| --- | --- | --- | --- |
| `APP_BASE_URL` | 是 | 被测环境根 URL | 测试环境域名，不默认指向生产 |
| `OPENAI_API_KEY` | 仅 AI 用例 | 模型认证凭据 | 本地 `.env` 或 Jenkins Secret Text |
| `OPENAI_BASE_URL` | 否 | OpenAI 兼容网关地址 | 仅在组织代理要求时设置；不要写入代码 |
| `MIDSCENE_MODEL_NAME` | AI 用例 | 网关支持的模型名 | 按网关能力配置；不要假定所有服务都接受 `gpt-4o` |
| `CI` | CI | 开启 CI 限制和重试策略 | Jenkins 设置为 `true` |
| `PLAYWRIGHT_WORKERS` | 否 | 控制并发上限 | 按目标环境容量调优 |

配置在进程启动时校验：缺少 `APP_BASE_URL` 应直接报清晰配置错误；仅含 Playwright 的测试可不要求 AI key；标记为视觉/AI 的项目在缺少 key 时应显式跳过或由 CI 配置校验失败，避免绿色构建实际没有执行目标用例。敏感值不得打印，错误消息只报告变量名及缺失状态。

### 4.2 凭据与数据安全

- `.env`、认证 state、下载文件、trace、视频和模型请求快照加入忽略规则；只提交不含密钥的 `.env.example`。
- Jenkins 使用凭据管理器绑定 Secret Text；凭据只注入执行测试的 stage，并限制有权限读取 job 配置和日志的人员。
- 禁止把密钥拼接到命令行参数、测试标题、URL、截图文字或日志。对模型 SDK 的调试日志默认关闭或脱敏。
- 发送给模型的数据遵循最小化：优先只发送当前视口截图和任务必需上下文；不得把真实客户数据、个人信息、token、内部管理页面截图发往未经审批的外部模型。
- 使用企业网关时，为 AI 请求配置域名白名单、配额、超时、调用审计与供应商数据保留策略；不支持的自定义变量不应被误认为 Midscene 一定会读取。
- 对测试账号使用合成数据；认证状态文件仅在短期 CI workspace 内保存，不归档、不跨构建复用。

## 5. 测试设计

### 5.1 分层与标签

- **Smoke**：少量、无模型或低模型依赖的关键可用性检查；每次部署执行。
- **Regression**：关键用户旅程、权限、错误路径和数据一致性；合并或定时执行。
- **Visual/AI**：布局与非结构化理解；单独标记、限制调用频率与成本、在模型/网关不稳定时清晰报告。
- **Cross-browser**：初期以 Chromium 为基准；Firefox/WebKit 在兼容性需求与 CI 容量确定后增加。

建议通过 Playwright tags 或 projects 选择测试集，保证 `npm test` 的默认含义明确。CI 不应在关键用例全被 skip 时仍报告成功；可为 smoke/AI 子集增加执行数量检查。

### 5.2 页面对象与等待

- 页面对象方法使用业务动作命名，例如 `fillSecureIframeForm`、`selectCanvasChartSegment`；返回有意义的状态或继续由调用者断言。
- 画布坐标使用 0–1 归一化比例时，入口验证坐标有限且在 `[0,1]` 内；点击前重新读取可见元素 bounding box，并等待业务加载完成。
- 画布点击后等待预期图表状态/请求，而非泛化 `networkidle`。
- iframe 操作在 frame 内通过语义 locator 验证存在、可见和可编辑；对第三方 iframe 记录供应商契约与环境差异。
- Midscene 调用应配置任务级超时、有限重试（建议 0–1 次，仅处理明确的暂时性网关错误）、结构校验以及清楚的失败原因。断言失败不可重试成通过。

### 5.3 AI 查询的输出约束

AI 查询用于语义理解，不是数据库读取。每次查询都应：

1. 只要求测试断言所需字段，字段类型明确（例如日期字符串、枚举状态）。
2. 检查输出存在、类型正确、记录数合理，并验证业务不变量。
3. 对分页表，优先通过 DOM 读取所有页；若单页内容确实无结构化 DOM，逐页采集并附加页码/来源，再由代码合并去重。
4. 对关键字段与应用 API、下载报表或已知测试数据交叉验证，避免模型幻觉造成假通过。
5. 在日志中保留请求关联 ID、耗时、模型名、token/费用指标（若供应商提供），不记录敏感截图或完整提示词中的秘密。

### 5.4 测试数据与身份

- 每个 worker 使用独立测试账号或唯一数据命名空间，避免并行互相污染。
- 优先用受控 API fixture 准备和清理数据；浏览器 E2E 专注用户交互，不承担大量数据建模。
- 登录状态通过 Playwright `storageState` 复用时，要按环境与角色隔离并在每次 job 生成；不将个人登录状态提交到 Git。
- 清理逻辑放在 `finally`/fixture teardown，并对清理失败单独报告；对有副作用的测试设立明确 allowlist。

## 6. Playwright 配置与报告

当前配置方向合理，落地时补充以下控制：

- `baseURL` 必须来自显式环境配置，不用貌似真实的默认生产域名。
- CI 使用 `forbidOnly: true`、受控 `workers`、有限 retries、统一 timeout；本地可使用 `--headed` 和调试命令。
- 保留失败 trace、失败截图和必要视频；报告不得无限增长，使用 Jenkins build retention 清理。
- 同时输出 HTML 与 JUnit：JUnit 供 Jenkins 测试趋势/门禁使用，HTML/trace 供人工排障使用。
- reporter 目录应在测试前可写；报告缺失时不能阻止原始测试结果可见。
- 建议为 smoke 和 AI 场景配置不同 Playwright project/use 配置，以便独立执行和统计。

## 7. Jenkins 流水线

### 7.1 推荐阶段

1. **Checkout**：检出锁文件和提交 SHA；输出不含秘密的构建元信息。
2. **Validate configuration**：检查 `APP_BASE_URL`、凭据绑定和目标环境 allowlist；拒绝意外生产地址。
3. **Install**：使用 `npm ci`；使用固定 Node LTS 容器，并缓存 npm 下载缓存（不缓存不兼容的 `node_modules`）。
4. **Install browser**：使用 `npx playwright install --with-deps chromium` 或经验证的 Playwright 官方 Docker 镜像；Playwright 包版本与浏览器镜像版本保持兼容。
5. **Static checks**：运行 `npm run typecheck` 与 lint（项目增加 lint 后）。
6. **Smoke / regression / AI tests**：分阶段执行并设置阶段超时；AI 套件通过单独凭据和标签运行。
7. **Publish results**：无论成功失败均发布 JUnit，归档报告、失败 trace 与截图；按保留策略清理。
8. **Notify（可选）**：后续接入 Slack/Teams 时仅发送结果、构建链接和报告链接，不附带密钥或敏感截图。

### 7.2 失败语义

- E2E 失败必须使流水线整体失败；不要用 `catchError(buildResult: 'SUCCESS', ...)` 把红色测试转为成功构建。
- 使用 Jenkins `post { always { ... } }` 发布测试结果与诊断产物，`post` 的执行不改变失败语义。
- 即使测试进程失败，也尽力发布现有 JUnit/报告；通过 `allowEmptyResults`/`allowEmptyArchive` 仅处理“报告文件可能未生成”，不能吞掉测试退出码。
- 失败通知应区分应用缺陷、测试脚本缺陷、基础设施/模型网关超时和配置错误，避免把它们统一标为 flaky。

### 7.3 Jenkins 参数与资源

- 镜像应采用明确版本或 digest，Node、Playwright 和系统依赖保持可复现；不使用无效镜像地址或未验证的 `--network=host`。
- 默认网络隔离；只有确实需要访问受控内网时，才由运维按最小权限开放网络。
- 设定全局与 stage timeout、buildDiscarder、workspace 清理和并发构建策略。
- AI 调用设置每次构建预算/配额，并记录模型、测试数、总耗时和失败原因；避免高并行造成限流。

## 8. 依赖与版本治理

- `package-lock.json` 纳入版本控制，CI 只用 `npm ci`；不在流水线运行 `npm install` 更新依赖。
- Playwright 与其浏览器二进制需同版本安装；Midscene 与 Playwright 的兼容矩阵以当前官方文档和锁文件实际安装结果为准。
- 初次落地选取经过验证的稳定版本并锁定；定期通过独立升级 PR 更新依赖、跑 smoke/regression 和 AI 契约检查。
- 示例中旧版 Midscene/Playwright 版本、`OPENAI_BASE_URL` 默认地址和 Docker 镜像写法不能直接作为企业生产配置；以对应版本官方文档为准。
- 在启用新模型/网关前做最小集成验证：鉴权、模型名、视觉输入、超时、速率限制、响应 schema 与数据出境审查。

## 9. 可观测性与故障处理

| 故障 | 分类与检测 | 处理策略 |
| --- | --- | --- |
| 页面加载/应用接口失败 | Playwright 网络事件、console、trace | 确认目标环境健康；等待具体业务条件；失败保留 trace，不盲目增加 sleep |
| Canvas 点击不稳定 | bounding box、视口、缩放、截图及点击后的状态断言 | 等待尺寸稳定；控制 viewport/deviceScaleFactor；优先增加应用提供的可访问/测试接口 |
| Midscene 超时/限流 | 模型请求耗时、状态码、关联 ID | 控制并发和上下文大小；有限退避；AI suite 与 DOM suite 分离；网关故障不伪装成业务通过 |
| AI 结果错误/幻觉 | schema/范围/业务不变量与独立来源不一致 | 令测试失败并保留脱敏诊断；缩小任务与截图；关键业务改用确定性断言 |
| Jenkins 没有报告 | reporter 路径/权限、流水线 post 状态 | 保证报告发布逻辑在 always 阶段；归档允许空但保留原始测试 exit code |
| 并行数据冲突 | 测试数据唯一键、账号共享和清理日志 | worker 隔离账号/数据；降低并发；API 创建独立数据集 |

建议至少记录：commit SHA、环境名、测试套件、用例总数/通过/失败/跳过、重试数、总耗时、AI 调用数与耗时、失败分类。禁止记录密钥、认证 Cookie 和完整个人数据。

## 10. 分阶段实施计划

### 阶段 0：确认目标系统契约

- 确认被测应用 URL、测试账号/角色、可操作环境和数据准备方式。
- 为每个示例 selector 找到真实页面语义；明确 iframe/canvas 是否有可访问 DOM 或测试 API。
- 确认模型供应商、网关、数据出境政策、预算与 Jenkins 凭据名称。
- 产出：环境契约、核心用户旅程、允许的测试数据与风险清单。

### 阶段 1：可复现的确定性基线

- 固定依赖并提交锁文件；添加配置校验、稳定 locator、认证/fixture 基础。
- 选 1–3 条无 AI 的 smoke 路径跑通本地和 Jenkins。
- 建立 JUnit/HTML/trace 归档与失败门禁。
- 出口条件：缺失配置时快速失败；用例真实执行而非全部跳过；失败产物可下载。

### 阶段 2：引入受控 AI 能力

- 单独封装 Midscene adapter；将视觉用例放入独立标签/project。
- 只实现一条视觉断言和一条非结构化抽取用例；记录模型耗时与费用。
- 验证模型错误、网关超时、限流时流水线明确失败或按策略隔离，绝不默认为通过。
- 出口条件：通过 schema/不变量校验，AI 故障可归因且调用预算可见。

### 阶段 3：扩展业务覆盖与规模

- 引入按业务域的 fixtures/flows、数据隔离、标签和跨浏览器矩阵。
- 增加定时回归、失败分类仪表盘、模型版本评估与升级流程。
- 评估接入通知、测试数据服务和视觉基线治理。
- 出口条件：并发稳定、误报率可量化、维护成本和 AI 成本可接受。

## 11. 验收标准

- 新开发者按 README 可在不接触生产密钥的情况下安装依赖并运行 typecheck。
- 未配置 `APP_BASE_URL` 时不会访问任意默认站点；缺少 AI key 不影响纯 Playwright smoke。
- 核心业务通过稳定 Playwright locator 和用户可见状态断言验证。
- 所有 AI 输出均有类型/范围/业务校验；分页 HTML 表格优先由 DOM 遍历完整读取。
- CI 使用 `npm ci`，Playwright 浏览器版本匹配；测试失败会使 job 失败。
- Jenkins 无论成功失败均尝试发布 JUnit 和诊断产物，且报告按策略保留。
- 密钥不在 Git、测试源码、命令行、构建日志或归档认证状态中。
- canvas、iframe、模型网关异常均能通过 trace、截图和分类日志定位。
- 视觉测试跳过、配置错误、应用缺陷与模型/网络故障能够明确区分。

## 12. 当前骨架与方案的差距清单

1. 将通用 `networkidle` 等待替换为页面状态/响应条件，避免长连接场景挂起。
2. 将标准数据表抽取和多页 Next 遍历改为确定性 DOM 实现；AI 只用于无语义数据源。
3. 在环境配置层做必需变量、URL allowlist、模型配置和坐标比例校验。
4. 拆分无需模型的 smoke 与需要模型凭据的 AI 用例，检查 CI 是否意外全跳过。
5. 增加锁文件、lint、测试标签/项目、认证 fixture 和运行指标。
6. 检查 Jenkins 的凭据作用域、浏览器依赖镜像、报告发布和失败退出码；确保没有成功吞错逻辑。
7. 为 AI 请求设定超时、配额、最小化上下文与敏感信息规则。
8. 接入真实应用前替换示例域名、路由、邮箱、iframe/canvas selector 与视觉断言。

## 13. 参考资料

上线前应按锁定的依赖版本复核官方文档和兼容矩阵：

- [Playwright Test 文档](https://playwright.dev/docs/intro)
- [Playwright 配置参考](https://playwright.dev/docs/test-configuration)
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [Midscene.js 文档](https://midscenejs.com/)
- [Jenkins Pipeline 文档](https://www.jenkins.io/doc/book/pipeline/)
- [OpenAI API 文档](https://platform.openai.com/docs/)
