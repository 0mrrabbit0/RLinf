# RLinf 桌面 GUI 应用设计方案

## Context

RLinf 目前所有操作都是 CLI + 脚本 + YAML（50+ shell 脚本、30+ Python 入口、272 个 YAML config）。zhanglinjun 希望做一个**桌面应用**（非 Web），让用户通过界面点击完成数据采集、训练、推理、评估、集群管理等全部操作。参考智元 AGIBOT 的产品界面（`pics/` 三张截图）。最终部署在真机 Ubuntu 上。

## 技术栈推荐

| 层 | 选型 | 理由 |
| --- | --- | --- |
| **桌面壳** | **Tauri 2.x**（Rust） | 打包小（5-10 MB vs Electron 150 MB+）、省内存（用系统 WebKitGTK）、内建 .deb/.AppImage 打包和自动更新、训练服务器上不浪费资源 |
| **前端 UI** | **React 18 + TypeScript** | 组件生态最丰富（Ant Design 暗色主题、Monaco Editor 做 YAML 编辑、XTerm.js 做日志终端）、强类型适配 RLinf 的复杂 config schema |
| **后端服务** | **FastAPI（Python）** 作为 Tauri sidecar | 直接 import RLinf 的 Python 代码（`ClusterConfig`、`validate_cfg`、`SupportedModel`、OmegaConf），不用重新实现；WebSocket 推送日志 |
| **SSH** | **Paramiko**（Python） | 连接远程训练节点、执行命令、传输配置文件 |
| **本地存储** | **SQLite** | 节点注册、任务历史、模板自定义、app 设置，无需外部数据库 |

## 架构

```
+------------------------------------------------------------------+
|                     用户机器 (Desktop / 训练机)                     |
|                                                                    |
|  +---------------------+      +-------------------------------+   |
|  |   Tauri Shell (Rust) |      |   FastAPI Backend (sidecar)   |   |
|  |   窗口管理 / 打包     |      |   Python 3.10+                |   |
|  |                      | HTTP |                               |   |
|  |  +----------------+  | /WS  |  TemplateService              |   |
|  |  | React Frontend |<-+----->|  ConfigService (OmegaConf)    |   |
|  |  | 任务模板卡片    |  |      |  NodeService (SSH + Ray API)  |   |
|  |  | YAML 编辑器    |  |      |  TaskService (进程管理)        |   |
|  |  | 节点管理面板    |  |      |  LogStreamService (WS 推送)   |   |
|  |  | 日志终端       |  |      |  WorkflowService (DAG 引擎)   |   |
|  |  +----------------+  |      +-------------------------------+   |
|  +---------------------+               |                          |
+------------------------------------------------------------------+
                                          |
                    SSH / Ray Client API  |
          +---------------+---------------+---------------+
          |               |               |               |
     Node 0 (Head)   Node 1          Node 2          Node N
     ray start       ray start       GPU 训练         Franka 机器人
     --head          --address=..    节点              边缘节点
```

**两种模式**：
- **本地模式**：app 装在训练机本机，`ray.init(address="auto")` 直连本地 Ray
- **远程模式**：app 装在笔记本/工作站，SSH 隧道连远程训练机，转发 Ray Dashboard

## 仓库结构

新增 `gui/` 目录在 RLinf 仓库根部：

```
RLinf/
  gui/
    backend/               # FastAPI Python 后端
      main.py              # uvicorn 入口
      api/                 # REST + WebSocket 端点
        templates.py, tasks.py, nodes.py, configs.py, workflows.py, logs.py
      services/            # 业务逻辑
        template_service.py, config_service.py, node_service.py,
        task_service.py, workflow_service.py, log_service.py, ssh_service.py
      models/              # Pydantic 数据模型
      db/                  # SQLite 持久化
    frontend/              # React + Tauri
      src-tauri/           # Tauri Rust 壳
      src/                 # React 源码
        pages/             # Dashboard, Templates, TaskCreate, TaskDetail,
                           # TaskList, NodeManager, Workflows, Settings
        components/        # TaskCard, ConfigEditor, NodeStatusCard,
                           # LogTerminal, WorkflowGraph
        stores/            # Zustand 状态管理
    scripts/               # build-deb.sh, build-appimage.sh, dev.sh
```

## 分阶段交付计划

### Phase 1：骨架 + 配置编辑器（4-6 周）

**交付物**：
- Tauri + React 脚手架（Ant Design 暗色主题 + 底部导航栏）
- FastAPI 后端作为 Tauri sidecar 启动
- **配置浏览器**：文件树展示 `examples/*/config/` 下所有 YAML；点击用 Monaco Editor 打开编辑
- **配置校验**：后端调 `OmegaConf.load()` + `validate_cfg()` 子进程，错误标注到编辑器
- **设置页面**：RLinf 路径、Python 解释器路径、SSH 密钥路径
- `.deb` / `.AppImage` 打包

**关键文件**：
- `rlinf/config.py`（`build_config`、`validate_cfg`、`SupportedModel`、`SupportedEnvType`、`SUPPORTED_TASK_TYPE`）
- `examples/*/config/**/*.yaml`（272 个配置文件）

### Phase 2：任务模板 + 本地任务启动（4-6 周）

**交付物**：
- **模板卡片画廊**：按 category 分组（训练 / 评估 / 数据采集 / SFT / 推理），匹配智元参考图
- **模板注册表**：每个模板关联 entry script + default config + 可配参数列表 + 环境变量
- **创建任务向导**：3 步（基本信息 → 配置覆写 → 审核启动），复刻智元步骤流
- **本地任务启动**：后端 spawn `python {entry} --config-name {cfg} {overrides}` 子进程
- **任务详情页**：运行命令 + PID + 状态 + XTerm.js 实时日志
- **任务列表**：活跃 / 历史任务

**模板 ↔ RLinf 映射**：
- 每个 shell 脚本（`run_embodiment.sh`、`run_main_grpo_math.sh` 等）= 一类模板
- 模板的 preset 列表 = 该目录下所有 `--config-name` 选项
- 模板参数 = YAML 中用户最常改的字段（`model_path`、`num_nodes`、`max_epochs` 等）
- 自动发现：扫描 `examples/` 目录结构 + 解析 `@hydra.main` 入口

### Phase 3：节点管理 + 远程执行（6-8 周）

**交付物**：
- **节点注册**：用户添加节点（IP + SSH 凭据），存 SQLite（加密）
- **节点健康监控**：每 30s SSH 探测（GPU nvidia-smi、CPU/RAM、Ray status、运行中任务）
- **节点状态面板**：卡片网格（IP / GPU 型号+数量+利用率 / 内存 / Ray 状态 / 标签）
- **远程任务执行**：SSH 到 head 节点 → 传配置 → 启动 Ray（如需） → 跑 entry script → 流回日志
- **Ray 集群管理 UI**：一键启动 head + workers（复刻 `ray_utils/start_ray.sh` 逻辑）
- **Ray Dashboard 嵌入**：iframe 或 SSH 隧道转发 `:8265`

**关键文件**：
- `rlinf/scheduler/cluster/config.py`（`ClusterConfig`、`NodeGroupConfig`）
- `rlinf/scheduler/cluster/node.py`（`NodeInfo`、`NodeGroupInfo`、`NodeProbe`）
- `rlinf/scheduler/cluster/cluster.py`（`Cluster` 单例、`get_alive_nodes()`）
- `ray_utils/start_ray.sh`

### Phase 4：工作流引擎 + 云边联合（6-8 周）

**交付物**：
- **工作流 DAG 编辑器**：可视化串联多个任务模板（采集→训练→推理），定义数据/依赖流
- **内置工作流模板**：HIL-SERL（数据采集→SAC/RLPD 训练→评估）、标准 SFT→RL、train+eval
- **工作流执行引擎**：按 DAG 拓扑顺序/并行执行，checkpoint 路径自动传递
- **云边联合任务**：标记任务为"边缘"或"云边联合"（匹配智元参考图），UI 分配组件到 node group
- **组件放置可视化**：actor/rollout/env/reward 在哪个节点组的可视化编辑器
- **工作流监控**：甘特图式进度视图

### Phase 5：打磨 + 监控集成 + 发布（4-6 周）

**交付物**：
- **训练指标看板**：嵌入 TensorBoard / WandB / SwanLab 指标
- **Checkpoint 管理**：浏览 checkpoint、对比指标、一键 resume
- **自动更新**：Tauri 内建 updater 对接 GitHub Releases
- **中英双语 i18n**
- **暗/亮主题**
- **用户手册**：集成帮助页
- **CI/CD**：GitHub Actions 自动构建 .deb / .AppImage

## 验证方式

| 阶段 | 验证 |
| --- | --- |
| Phase 1 | 能打开 .deb 安装的 app → 浏览 RLinf 272 个 config → 编辑 YAML → 看到校验错误 |
| Phase 2 | 从模板卡片创建 `maniskill_ppo_mlp` 训练任务 → 填表单 → 一键启动 → 看到实时日志 |
| Phase 3 | 添加 2 个远程节点 → 看到 GPU 状态 → 远程启动 Ray 集群 → 远程执行训练任务 |
| Phase 4 | 用 HIL-SERL 工作流模板 → 串联数据采集+训练+推理 → 自动传 checkpoint → 全链路跑通 |
| Phase 5 | .deb 安装包一键装 → 自动更新 → 中英切换 → 暗色主题 → 嵌入 TensorBoard 看曲线 |
