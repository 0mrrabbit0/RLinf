# Change Log

> 记录由 Claude 协作产生的、对仓库状态有影响的变更。
> 与 git history 互补：commit 记录「做了什么」，本文件记录「为什么这么做、对话上下文是什么」。
>
> 顶部为最新条目。

## 模板

```
## [日期] 变更标题
- **类型**：feat / fix / docs / refactor / chore / test
- **范围**：涉及目录或模块
- **动机**：上下文与目标
- **变更**：实际修改要点
- **后续**：遗留事项 / TODO
```

---

## [2026-05-22] 推送到个人仓库 0mrrabbit0/RLinf
- **类型**：chore
- **范围**：git remote / GitHub
- **动机**：把 `docs/claude-notes/` 及 memory 快照保存到 wangyichen 自己账号下的仓库。
- **变更**：
  - 通过 `gh CLI`（用户本地下载 v2.62.0 到 `~/.local/bin/gh`，使用 fine-grained PAT 含 Account: Administration RW 权限）创建 `github.com/0mrrabbit0/RLinf`（public）。
  - 本地：`origin` 重命名为 `upstream`（保留上游引用以便 `git fetch upstream`），新 `origin` 指向 `git@github.com:0mrrabbit0/RLinf.git`。
  - `git push -u origin main` 推送全部 535+1 commit。
- **后续**：之后所有协作产生的 commit 默认推送到 `origin`（个人仓库）；若需要同步上游更新，使用 `git fetch upstream && git merge upstream/main`。

## [2026-05-22] 纳入 Claude 协作记忆快照
- **类型**：docs
- **范围**：`docs/claude-notes/memory/`
- **动机**：wangyichen 要把对话记忆也提交到仓库，方便换机器/换环境时还原协作上下文。
- **变更**：
  - 新建 `docs/claude-notes/memory/` 目录。
  - 复制 `~/.claude/projects/-home-ubuntu-RLinf/memory/{MEMORY.md, claude_notes_workflow.md}` 进来作为快照。
  - 新增 `memory/README.md` 说明真源与同步约定。
  - 在 `docs/claude-notes/README.md` 文档清单里追加 memory 条目。
- **后续**：memory 在 `~/.claude/` 下会持续变化；后续重要更新需要手动同步到此目录再 commit，不追求实时一致。

## [2026-05-22] quickstart 补充「可视化界面」章节
- **类型**：docs
- **范围**：`docs/claude-notes/quickstart.md`
- **动机**：wangyichen 询问仓库是否自带 GUI；确认无项目专属 GUI 后，把可用的外部可视化工具（Ray Dashboard / TensorBoard / W&B / SwanLab / Sphinx / 环境 viewer）整理成表格写入快速开始文档，避免下次再查。
- **变更**：新增 §6「可视化界面」，原「提交与 PR 规范」从 §6 顺延到 §7。
- **后续**：无。

## [2026-05-22] 建立 `docs/claude-notes/` 笔记体系
- **类型**：docs
- **范围**：`docs/claude-notes/`
- **动机**：wangyichen 希望有一处稳定的位置记录架构、需求、变更、快速开始、问题解决，并约定每次对话回写。
- **变更**：
  - 新建 `docs/claude-notes/` 目录。
  - 新建五份 Markdown：`README.md`、`architecture.md`、`requirements.md`、`changelog.md`、`quickstart.md`、`issues.md`。
  - 架构文档综合 `AGENTS.md` 与 `CLAUDE.md` 的内容做了中文速查梳理。
- **后续**：之后每次对话都要把新需求/新变更/踩坑回写到对应文档。
