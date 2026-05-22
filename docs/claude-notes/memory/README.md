# Memory Snapshot

本目录是 Claude 协作记忆（`~/.claude/projects/-home-ubuntu-RLinf/memory/`）的**快照**，提交到仓库以便：

1. 在新机器 / 新环境下重新搭建 Claude 协作上下文。
2. 留档历史决策与协作偏好，便于回溯。

## 文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| [MEMORY.md](MEMORY.md) | 索引 | memory 文件清单（自动加载到 Claude 对话上下文，每行 ~150 字符以内） |
| [claude_notes_workflow.md](claude_notes_workflow.md) | feedback | `docs/claude-notes/` 的回写约定 |

## 同步约定

- **真源**：`~/.claude/projects/-home-ubuntu-RLinf/memory/`（Claude 实际读写位置）
- **快照**：本目录（仅用于版本化备份）
- 当 memory 有重要更新时，手动同步过来再 commit；不追求实时一致。
