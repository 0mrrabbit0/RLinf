---
name: git-remote-setup
description: RLinf 工作副本的 git remote 布局：origin 是 wangyichen 的个人仓库，upstream 是上游
metadata: 
  node_type: memory
  type: project
  originSessionId: fae750fa-a807-40f8-8c52-9b5a7a0376f9
---

`/home/ubuntu/RLinf` 工作副本的 git remote 布局（2026-05-22 起）：

- `origin` → `git@github.com:0mrrabbit0/RLinf.git`（wangyichen 的 public 个人仓库，日常推送目标）
- `upstream` → 上游 RLinf 官方仓库（只读，仅用于 `git fetch upstream` 同步更新）

**Why**：wangyichen 希望工作改动落到自己账号下，避免污染上游；同时保留对上游的引用，方便偶尔合并上游更新。

**How to apply**：
- 默认 `git push` 推到 `origin`（个人仓库），不要 `git push upstream`。
- 同步上游：`git fetch upstream && git merge upstream/main`（或 rebase）。
- 提到「我的仓库 / 我自己的仓库」时，指 `0mrrabbit0/RLinf`。
- `gh CLI` 已装在 `~/.local/bin/gh`（v2.62.0），认证账户 `0mrrabbit0`，token 协议 SSH。

相关：[[claude-notes-workflow]]。
