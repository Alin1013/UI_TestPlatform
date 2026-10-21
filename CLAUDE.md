# Claude Code 项目入口

本文件为 Claude Code 提供项目级规范入口；Codex/通用代理规范继续由 `AGENTS.md` 管理。

## Agent skills

### Issue tracker

本仓库使用 GitHub Issues 跟踪需求与问题，操作方式见 `docs/agents/issue-tracker.md`。

### Triage labels

使用 `needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix` 五个默认标签，详见 `docs/agents/triage-labels.md`。

### Domain docs

采用单上下文布局：术语表按需记录在根目录 `CONTEXT.md`，架构决策放在 `docs/adr/`；消费规则见 `docs/agents/domain.md`。
