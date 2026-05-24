# 多 Agent 协作模式

> 本文档规定了 Claude 在本项目中使用多 agent 并行工作的模式。**每次编码任务必须遵循此模式**。

## 为什么要多 agent

单 agent 容易：
- 写了代码但没审计安全漏洞（Phase 1 曾发现 5 个 Critical 安全问题）
- 修了 bug 但忘记记录到 issues.md / changelog.md
- 改了前端但后端 type 没对齐（Phase 1 曾 5 处 type 不匹配导致全 422）
- 用了过时 API 或违反最佳实践

多 agent 并行 = 写 + 审 + 记 同时进行，互相补位。

## 标准 3-agent 模式

每次**编码任务**（不是纯讨论 / 纯文档），必须同时启动：

```
┌─────────────────────────────────────────────────────────────┐
│                    主 Claude（你自己）                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Coding Agent  │  │ Review Agent │  │ Recorder Agent   │  │
│  │ (1-2 个)      │  │ (1 个)       │  │ (1 个)           │  │
│  │              │  │              │  │                  │  │
│  │ 写功能代码    │  │ 只读审计     │  │ 写 changelog.md  │  │
│  │ 后台并行      │  │ 后台并行     │  │ 写 issues.md     │  │
│  │              │  │              │  │ 后台并行         │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  等全部完成后：                                              │
│  1. 检查 coding agent 产出                                  │
│  2. 根据 review agent 发现修 bug                            │
│  3. 确认 recorder agent 写的记录准确                        │
│  4. 在最终结果之上做收尾修补                                │
└─────────────────────────────────────────────────────────────┘
```

## 各 Agent 角色定义

### Coding Agent（1-2 个，后台）

**职责**：写功能代码。

**使用场景**：
- 需要改多个文件（前端 + 后端）→ 开 2 个 coding agent 各管一边
- 只改一侧 → 1 个就够

**prompt 要求**：
- 必须说明"先 Read 现有文件再改"
- 必须列出要创建/修改的具体文件路径
- 必须说明期望的用户体验和技术约束
- 必须提醒"保持 dark theme / 中文标签 / TypeScript strict"

**禁止**：
- 不要让两个 coding agent 改同一个文件（会冲突）
- 不要让 coding agent 做审计工作（那是 review agent 的事）

### Review Agent（1 个，后台）

**职责**：只读审计，不改代码。

**审计清单**（每次必查）：
1. **安全**：命令注入（shell=True?）、路径遍历（../..?）、CORS 配置、CSP、绑定地址
2. **类型对齐**：前端 TypeScript interface 与后端 Pydantic model 字段名/类型/required 一致吗？
3. **API 契约**：前端调的 endpoint (method + path + body) 跟后端路由定义匹配吗？
4. **资源泄漏**：文件句柄、临时文件、子进程有没有正确关闭/清理？
5. **React 规范**：hooks 依赖数组完整吗？有没有 useEffect 死循环？有没有未使用的 import？
6. **Python 规范**：async 函数里有没有同步阻塞 IO？deprecated API？Pydantic v2 用法对吗？
7. **缺失功能**：有没有 TODO 忘了做？有没有边界情况没处理？
8. **最新实践**：有没有更好的库/API 可以用？

**输出格式**：
```
🔴 Critical: ...
🟡 Important: ...
🟢 Suggestion: ...
```

**禁止**：
- 不要改代码
- 不要只说"looks good"——必须逐项检查

### Recorder Agent（1 个，后台）

**职责**：自动记录本轮工作到 `docs/claude-notes/`。

**具体做什么**：
1. 读 coding agent 的改动摘要
2. 在 `changelog.md` 顶部追加一条变更记录（类型/范围/变更内容/后续）
3. 如果有 bug fix → 在 `issues.md` 顶部追加条目（现象/根因/解决/复现条件）
4. 如果新需求/目标变化 → 更新 `requirements.md`
5. 如果架构变化 → 更新 `architecture.md`

**prompt 要求**：
- 必须告诉它"读 coding agent 的改动后，写到 changelog.md 和 issues.md"
- 必须提供本轮工作的上下文（做了什么、为什么）
- 必须提醒遵循 [claude_notes_workflow.md](memory/claude_notes_workflow.md) 的格式

**禁止**：
- 不要编造没做过的事（只记实际改动）
- 不要重复已经记过的条目

## 工作流程（每次编码任务的标准流程）

```
1. 用户提出任务
      │
2. 主 Claude 理解需求，拆分子任务
      │
3. 同时启动 3 个 agent（单条消息，多个 tool call）：
   ├── Coding Agent 1: 后端改动
   ├── Coding Agent 2: 前端改动（如果需要）
   ├── Review Agent: 审计现有 + 即将改的代码
   └── Recorder Agent: 准备记录
      │
4. 等全部 agent 完成
      │
5. 主 Claude 检查结果：
   ├── Coding agent 的代码是否正确？
   ├── Review agent 发现了什么问题？
   ├── Recorder agent 记录是否准确？
      │
6. 主 Claude 修复 review 发现的问题
      │
7. 汇报给用户：
   - 做了什么
   - Review 发现了什么 + 怎么修的
   - 记录到了哪些文件
```

## 什么时候不用多 agent

- **纯讨论 / 问答**：不写代码就不需要
- **单文件小改**（改一行 typo、加一个 import）：直接改，不值得开 agent
- **纯文档编写**：主 Claude 自己写就行

## 示例 prompt 模板

### Coding Agent prompt

```
你在 RLinf GUI 项目上工作（Tauri + React + FastAPI）。项目在 /home/ubuntu/RLinf/gui/。

## 任务
[具体要做什么]

## 现有文件
[列出相关文件路径]

## 约束
- 先 Read 现有文件再改，不要覆盖别人的改动
- 保持 Ant Design 5 暗色主题
- 中文 UI 标签
- TypeScript strict，无 any
- Python type hints，Google docstring style

## 不要改的文件
[列出其他 coding agent 在改的文件，避免冲突]
```

### Review Agent prompt

```
你是代码审计 agent。审计 /home/ubuntu/RLinf/gui/ 下的代码。
只读不改。

## 审计范围
[本轮新增/修改的文件列表]

## 审计清单
1. 安全（命令注入、路径遍历、CORS、CSP）
2. 前后端类型对齐（TypeScript interface vs Pydantic model）
3. API 契约（endpoint method + path + body 匹配）
4. 资源泄漏（文件句柄、临时文件、子进程）
5. React 规范（hooks、unused imports）
6. Python 规范（async/sync、deprecated API）
7. 缺失功能 / 边界情况
8. 最新技术实践

## 输出格式
🔴 Critical: ...
🟡 Important: ...
🟢 Suggestion: ...
```

### Recorder Agent prompt

```
你是记录 agent。读完以下改动摘要后，更新 docs/claude-notes/ 的文档。

## 本轮改动
[描述做了什么]

## 要更新的文件
1. changelog.md — 在 ## 历史条目 下方最顶部追加新条目
2. issues.md — 如果有 bug fix，追加条目
3. requirements.md — 如果需求/状态变化，更新对应条目

## 格式约定
- 遵循各文件顶部的模板格式
- 日期用绝对日期（如 2026-05-24）
- changelog 类型用 feat / fix / docs / refactor / chore
- issues 按「现象→根因→解决→复现条件」格式

先 Read 各文件确认当前内容，再 Edit 追加。不要重复已有条目。
```

## 历史教训

| 事件 | 教训 |
| --- | --- |
| Phase 1 首版代码 5 个 Critical 安全漏洞 | **Review agent 不是可选的，是必须的** |
| Phase 1 前后端 5 处 type 不匹配 | Review agent 必须检查 **TypeScript ↔ Pydantic 字段名一致性** |
| Phase 1 功能做完但忘记写 changelog | **Recorder agent 就是为解决这个问题** |
| 后端绑 0.0.0.0 + 命令注入 = RCE | Review agent 安全检查第一条必查 **绑定地址 + shell=True** |
| 临时文件永不删除 | Review agent 必查 **tempfile + delete=False** |
