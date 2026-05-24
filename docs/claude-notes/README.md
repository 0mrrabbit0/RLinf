# Claude Notes

本目录用于记录与 Claude 协作开发 RLinf 项目过程中产生的内部文档，区别于 `docs/source-en` 与 `docs/source-zh` 中面向用户的 Sphinx 文档。

## 文档清单

| 文档 | 用途 |
| --- | --- |
| [architecture.md](architecture.md) | 项目架构总览与目录速查 |
| [requirements.md](requirements.md) | 新需求记录（来源、目标、状态） |
| [changelog.md](changelog.md) | Claude 协作产生的变更历史 |
| [quickstart.md](quickstart.md) | 快速开始：环境、训练、评估（**通用**） |
| [deployment.md](deployment.md) | RLinf 部署指南（Ubuntu + Docker），可一步步复用 |
| [concepts.md](concepts.md) | 核心概念答疑：Ray / Hydra / FSDP / Megatron-LM / rollout / SGLang / vLLM |
| [gui-plan.md](gui-plan.md) | RLinf Studio 桌面 GUI 应用设计方案（5 阶段交付计划） |
| [session-handoff.md](session-handoff.md) | **对话接续摘要**——新机器/新会话读这个文件恢复全部上下文 |
| [issues.md](issues.md) | 问题与解决方案记录 |
| [memory/](memory/) | Claude 协作记忆快照（来源：`~/.claude/projects/-home-ubuntu-RLinf/memory/`） |

## 维护约定

- 每一次对话中产生的有效信息（需求、变更、问题、踩坑）都应当**及时**写入对应文档。
- 同一类型的条目优先**追加**到既有文件，禁止重复创建文件。
- 条目格式统一为「日期 + 简述 + 详情」，方便后续检索。
- 涉及面向用户的功能变更，仍需同步到 `docs/source-en` 与 `docs/source-zh`。
