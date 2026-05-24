# 新需求记录文档

> 记录每一次对话中提出的新需求，便于追踪从想法到落地的全过程。
>
> 状态约定：`todo` / `in-progress` / `done` / `cancelled`

## 模板

```
### [日期] 需求简述
- **提出人**：
- **背景**：为什么需要
- **目标**：希望达到的效果
- **范围**：涉及的文件 / 模块
- **状态**：todo
- **关联变更**：commit / PR / changelog 条目
```

---

## 需求列表

### [2026-05-22] 建立 Claude 协作笔记体系
- **提出人**：zhanglinjun
- **背景**：希望在 `docs/` 下有一个独立目录存放 Claude 与 zhanglinjun 协作过程的项目笔记，避免污染面向用户的 Sphinx 文档。
- **目标**：在 `docs/claude-notes/` 下沉淀架构、需求、变更、快速开始、问题解决五类文档，并约定后续每次对话都要回写。
- **范围**：`docs/claude-notes/`（新增目录）
- **状态**：done
- **关联变更**：见 [changelog.md](changelog.md) 中 2026-05-22 条目

### [2026-05-24] RLinf 用户界面（桌面应用）
- **提出人**：zhanglinjun
- **背景**：RLinf 目前所有操作都是 CLI + 脚本 + YAML（50+ shell 脚本、30+ Python 入口、272 个 config），没有图形界面。希望做一个桌面应用让用户通过界面点击便捷使用。参考智元 AGIBOT 产品界面（`pics/` 三张截图：任务模板卡片、创建任务向导、任务详情+命令编辑器）。
- **目标**：
  1. **桌面应用**（非 Web）——有安装包（.deb / .AppImage），装到本地 Ubuntu
  2. **GUI 替代 CLI**——数据采集、训练、推理、评估、集群管理全部通过界面完成
  3. **模板系统**——每个功能有各自的任务模板（数据采集 / 训练 / 推理 / 评估 / SFT），选模板→填表单→预填命令→一键启动
  4. **工作流支持**——HIL-SERL 示例：数据采集→训练→推理，每步有模板+一键启动，步骤间自动传 checkpoint
  5. **云边联合 + 多节点管理**——管理多台机器（cloud + edge 节点），任务分配到指定节点，Ray 集群管理 UI
  6. **本地 + 远程双模式**——既能装在训练机本地用，也能装在管理机远程控制训练服务器
- **技术方案**：Tauri 2.x（Rust 壳）+ React 18 + TypeScript（前端）+ FastAPI Python（后端 sidecar）。详见 plan file。
- **参考**：智元 AGIBOT（`pics/创建任务.jpeg` / `pics/任务模板.jpeg` / `pics/输入任务信息.jpeg`）
- **范围**：新增 `gui/` 目录（backend/ + frontend/），不动 RLinf 核心代码
- **分阶段交付**：
  - Phase 1（4-6w）：骨架 + 配置编辑器
  - Phase 2（4-6w）：任务模板 + 本地任务启动
  - Phase 3（6-8w）：节点管理 + 远程执行
  - Phase 4（6-8w）：工作流引擎 + 云边联合
  - Phase 5（4-6w）：打磨 + 监控集成 + 发布
- **状态**：in-progress（Phase 1 启动中）
- **关联变更**：plan file `~/.claude/plans/joyful-meandering-gray.md`；[changelog.md](changelog.md) 2026-05-24 条目
