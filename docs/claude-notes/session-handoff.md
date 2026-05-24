# Session Handoff — 对话接续摘要

> **用途**：在新机器 / 新 Claude 会话中 `git clone` 后，读这个文件 + `docs/claude-notes/` 目录就能完整接续工作。
>
> **最后更新**：2026-05-24，v0.1.0 提交后。

## 谁在做

- **用户**：zhanglinjun（GitHub: 0mrrabbit0）
- **项目**：RLinf（开源分布式 RL 训练框架）的二次开发，重点是加 GUI + 未来 HIL-SERL 改造
- **仓库**：`git@github.com:0mrrabbit0/RLinf.git`（个人 fork），upstream 是 RLinf 官方仓库

## 当前进度

### RLinf Studio（桌面 GUI 应用）— 主线任务

| Phase | 状态 | 内容 |
| --- | --- | --- |
| **Phase 1** | ✅ **v0.1.0 已发布** | Tauri 2.x + React + FastAPI 骨架；配置编辑器（Monaco YAML）；模板卡片 + 创建任务向导；后端自启；.deb 打包可用 |
| **Phase 2** | ⬜ **下一步** | XTerm.js 日志终端；WebSocket 日志流推送；任务状态自动刷新；真正跑通一个本地任务 |
| Phase 3 | ⬜ | 节点管理（SSH 注册、GPU 监控）+ 远程执行 |
| Phase 4 | ⬜ | 工作流 DAG 编辑器 + 云边联合 |
| Phase 5 | ⬜ | TensorBoard 嵌入、checkpoint 管理、i18n、自动更新 |

### 文档体系

| 文件 | 用途 |
| --- | --- |
| [gui-plan.md](gui-plan.md) | GUI 完整技术方案（技术栈、架构图、5 阶段计划、模板系统、节点管理） |
| [requirements.md](requirements.md) | 需求记录（GUI 需求条目含 6 项目标） |
| [changelog.md](changelog.md) | 所有变更记录（含部署踩坑、GUI Phase 1 全过程） |
| [issues.md](issues.md) | 11 条踩坑 post-mortem（dockerd 代理、Tauri build、Rust 工具链等） |
| [concepts.md](concepts.md) | 12 节技术答疑（Ray/Hydra/FSDP/Megatron/rollout/SGLang/vLLM/BC/on-off-policy/RL 数学符号） |
| [deployment.md](deployment.md) | Ubuntu + Docker 部署指南（Math + Embodied 双路线） |
| [architecture.md](architecture.md) | RLinf 项目架构速查 |

### HIL-SERL 调研（未动手，信息已沉淀）

- RLinf 现有积木盘点：见 [changelog.md 2026-05-23 HIL-SERL 调研条目](changelog.md)
- 结论：RLinf 已有 SAC + RLPD + SpaceMouse 介入 + demo buffer，缺 intervention buffer 分流
- 详细 off-policy / on-policy / BC 解析：见 [concepts.md §十-§十一](concepts.md)

## 工作约定（让下一个 Claude 照做）

1. **每次有新需求/变更/报错 → 主动回写** `docs/claude-notes/` 对应文件（[claude_notes_workflow.md](memory/claude_notes_workflow.md)）
2. **每次修复 bug → 立即写 issues.md**（[feedback_auto_record_issues.md](memory/feedback_auto_record_issues.md)）
3. **写代码时 → 并行开 review agent** 审计安全/质量/逻辑/最佳实践
4. **git remote**：`origin` = 个人仓库（推送目标），`upstream` = 官方（只读）
5. **不要在代码里加 emoji**（除非用户要求）
6. **用户身份是 zhanglinjun**，不是 wangyichen

## 技术栈速查

| 组件 | 位置 | 技术 |
| --- | --- | --- |
| GUI 前端 | `gui/frontend/` | React 18 + TypeScript + Ant Design 5 + Monaco Editor |
| GUI Rust 壳 | `gui/frontend/src-tauri/` | Tauri 2.x，自动启停 Python backend |
| GUI 后端 | `gui/backend/` | FastAPI + uvicorn，port 18721 |
| RLinf 核心 | `rlinf/` | Python，Ray + Hydra + FSDP/Megatron + SGLang/vLLM |
| 配置 | `examples/*/config/*.yaml` | 272 个 Hydra config |
| 文档 | `docs/source-{en,zh}/` | Sphinx 双语文档 |
| 协作笔记 | `docs/claude-notes/` | 内部开发文档（不进 Sphinx） |

## 新机器上恢复工作环境

```bash
git clone git@github.com:0mrrabbit0/RLinf.git
cd RLinf

# 恢复 Claude memory（让新 Claude 会话读到工作约定）
mkdir -p ~/.claude/projects/-home-$(whoami)-RLinf/memory
cp docs/claude-notes/memory/*.md ~/.claude/projects/-home-$(whoami)-RLinf/memory/

# GUI 开发环境（需要 Node.js 20+ / Rust / 系统库）
cd gui/frontend && npm install
cd ../backend && python3 -m venv .venv && source .venv/bin/activate && pip install -e .

# 开发模式
bash gui/scripts/dev.sh

# 打包
cd gui/frontend && npm run build && npm run tauri build
```
