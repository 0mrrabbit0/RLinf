---
name: feedback-auto-record-issues
description: 每次修复问题后必须主动追加到 docs/claude-notes/issues.md，不等用户提醒
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 64cf1bb2-424d-46f8-9624-f1ef269789f4
---

每次修复一个报错/问题后，立即将该问题追加到 `docs/claude-notes/issues.md`，不要等用户提醒。

**Why:** 用户明确要求"每次修好自己主动自动记录"，希望踩坑记录实时更新，不遗漏。

**How to apply:** 在完成修复的同一轮回复中，用 Edit 工具将新条目追加到 `issues.md` 的 `## 历史条目` 下方（最新在最前），格式遵循 [[claude-notes-workflow]]。
