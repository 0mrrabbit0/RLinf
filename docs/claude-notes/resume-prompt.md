# Claude 接续提示词

> **用法**：在新机器上 `git clone` 后，开新 Claude Code 对话，把下面的提示词整段粘贴给它。

---

## 提示词（复制这段）

```
你好，我是 zhanglinjun。你现在接手的是一个正在进行中的项目——我在 RLinf（一个开源分布式 RL 训练框架）上做二次开发，主要工作是给它加一个桌面 GUI 应用（RLinf Studio）。

## 第一步：恢复上下文

请按顺序读以下文件，不要跳过：

1. `docs/claude-notes/session-handoff.md` — 完整的进度摘要（谁在做、做到哪、什么约定、技术栈、下一步）
2. `docs/claude-notes/agent-workflow.md` — 多 agent 协作模式（你必须按这个模式工作：coding agent + review agent + recorder agent 并行）
3. `docs/claude-notes/gui-plan.md` — GUI 的完整技术方案（5 阶段交付计划）
4. `docs/claude-notes/requirements.md` — 需求记录（GUI 需求条目）
5. `docs/claude-notes/changelog.md` — 变更历史（看最近几条就够）
6. `docs/claude-notes/issues.md` — 踩坑记录（前人的教训）

读完后告诉我你了解到了什么、当前进度是什么、下一步该做什么。

## 恢复 memory

如果 `~/.claude/projects/` 下没有 memory 文件，先执行：
```bash
mkdir -p ~/.claude/projects/-home-$(whoami)-RLinf/memory
cp docs/claude-notes/memory/*.md ~/.claude/projects/-home-$(whoami)-RLinf/memory/
```

## 工作约定（非常重要）

1. **每次做完一个功能/修一个 bug → 主动写 changelog.md + issues.md**，不要等我提醒
2. **写代码时必须并行开 3 个 agent**：
   - Coding agent（写功能）
   - Review agent（审计安全/质量/逻辑/最佳实践，只读不改）
   - Recorder agent（把本轮做的事自动记到 changelog.md / issues.md）
3. **git remote**：`origin` = `git@github.com:0mrrabbit0/RLinf.git`（我的个人仓库），所有推送到这里
4. **commit 格式**：Conventional Commits + `Signed-off-by` + `Co-Authored-By: Claude`
5. **代码风格**：不加 emoji；不加多余注释；Google Python style；TypeScript strict
6. **部署目标**：真机 Ubuntu（不是 WSL），文档里不要有 WSL 相关内容
7. **参考设计**：`pics/` 目录下有智元 AGIBOT 的 UI 截图，GUI 风格对标它

## 当前状态

- **Phase 1 已完成** (v0.1.0)：Tauri + React + FastAPI 骨架，配置编辑器，模板卡片，任务创建向导，后端自启，.deb 打包
- **Phase 2 是下一步**：XTerm.js 日志终端 + WebSocket 日志流 + 任务状态自动刷新 + 跑通一个本地任务

准备好了就告诉我，我们继续 Phase 2。
```
