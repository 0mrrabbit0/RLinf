---
name: claude-notes-workflow
description: RLinf 仓库存在 docs/claude-notes/ 协作笔记目录，每次对话都需要把新信息回写到对应文档
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fae750fa-a807-40f8-8c52-9b5a7a0376f9
---

在 RLinf 仓库下与 zhanglinjun 协作时，所有有效信息必须及时回写到 `docs/claude-notes/` 中的对应文件。

**目录与文件**（2026-05-22 创建）：
- `docs/claude-notes/README.md` — 目录说明 + 维护约定
- `docs/claude-notes/architecture.md` — 项目架构文档
- `docs/claude-notes/requirements.md` — 新需求记录
- `docs/claude-notes/changelog.md` — 由 Claude 协作产生的变更日志
- `docs/claude-notes/quickstart.md` — 快速开始（安装、Ray、训练、评估）
- `docs/claude-notes/issues.md` — 问题与解决方案

**回写规则**：
- 用户每次提新需求 → 追加到 `requirements.md`（含状态：todo/in-progress/done/cancelled）。
- 每次产生代码或文档变更 → 追加到 `changelog.md`（类型、范围、动机、变更、后续）。
- 遇到报错并解决 → 追加到 `issues.md`（现象/根因/解决/复现条件）。
- 架构层面的演进 → 更新 `architecture.md` 对应章节，不要无脑追加。
- 快速开始流程发生变化（安装命令、入口脚本）→ 更新 `quickstart.md`。
- 同一类型条目**优先追加到既有文件**，禁止重复创建文件。
- 条目顶部为最新；每条目带日期（绝对日期，例如 2026-05-22）。

**Why**：zhanglinjun 希望积累一份不被 Sphinx 用户文档污染的内部协作笔记，可在后续对话中追溯每一次决策与踩坑。

**How to apply**：在每次对话结束前、或在完成一个可记录的动作后，主动 Edit/Write 对应文件；不要等用户提醒。涉及面向用户的功能变更，仍要同步 `docs/source-en` 与 `docs/source-zh`。
