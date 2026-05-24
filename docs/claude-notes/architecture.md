# 项目架构文档

> 最后更新：2026-05-23
> 维护者：Claude + zhanglinjun

RLinf 是一个面向 **强化学习 (Embodied / Reasoning / Agent)** 的分布式训练框架，底层使用 **Ray** 调度进程，使用 **Hydra** 管理配置，训练后端支持 **FSDP** 与 **Megatron**，rollout 后端支持 **SGLang** 与 **vLLM**。

## 一、顶层目录

```
RLinf/
├── AGENTS.md / CLAUDE.md / CONTRIBUTING.md   # 协作与贡献规范
├── docker/                                   # 各模型/环境的 Dockerfile 构建阶段
├── docs/                                     # Sphinx 双语文档 (source-en / source-zh)
│   └── claude-notes/                         # ← 本目录，Claude 协作笔记
├── examples/                                 # 入口脚本与 YAML（embodiment/reasoning/agent/sft/...）
├── ray_utils/                                # 多节点 Ray 启动脚本
├── requirements/                             # install.sh 与各 extra 依赖
├── rlinf/                                    # 主包，下文展开
├── tests/                                    # 单元测试与 e2e（embodied/agent/reasoning）
└── toolkits/                                 # checkpoint 转换、评估、自动放置等工具
```

## 二、`rlinf/` 包结构

| 子包 | 职责 |
| --- | --- |
| `agents/` | Agent 推理与工具调用逻辑 |
| `algorithms/` | Advantage / Loss / Reward 注册表（GAE、GRPO、PPO、Reinforce++、SAC 等） |
| `config.py` | Hydra 配置入口；`SupportedModel`、`SupportedEnvType` 枚举与 `validate_cfg` |
| `data/` | embodied / reasoning / agent 数据集 |
| `envs/` | ManiSkill、LIBERO、IsaacLab、CALVIN、MetaWorld、Behavior、RoboCasa、FrankaSim、RealWorld、RoboTwin、Habitat、OpenSora；`get_env_cls()` 路由 |
| `hybrid_engines/` | SGLang / vLLM rollout 引擎集成 |
| `models/` | Embodiment（OpenVLA、OpenVLA-OFT、OpenPI、GR00T、MLP/CNN/Flow/CMA）与 reasoning 模型接线 |
| `runners/` | 训练循环：embodied（sync/async）、reasoning、coding_online_rl、agent、SFT、eval |
| `scheduler/` | Cluster、Worker、WorkerGroup、Channel、Placement、动态调度 |
| `utils/` | logging、placement、distributed、checkpoint、resharding |
| `workers/` | Actor（FSDP/Megatron）、Rollout（HF/server）、Env（sync/async）、Reward、Replay buffer |

## 三、运行模型

1. 用户运行入口脚本（例如 `examples/embodiment/train_embodied_agent.py`）。
2. 脚本构建 **Cluster**（需要 Ray 已经启动）。
3. 根据 YAML 的 `cluster.component_placement` 计算 **组件放置**（actor / rollout / env / reward / agent）。
4. 启动各组件对应的 **Worker 组**（Ray remote actor）。
5. **Runner** 驱动训练循环：`rollout → reward → advantage → actor update`，同时管理推理引擎生命周期。

> 训练后端：FSDP 或 Megatron；Rollout：SGLang 或 vLLM；算法（loss、advantage）通过 `algorithm.loss_type` / `algorithm.adv_type` 在 YAML 中选择，背后是 `rlinf/algorithms/registry.py` 的注册表。

## 四、扩展点速查

| 想新增 | 入口 | 关键修改点 |
| --- | --- | --- |
| Advantage | `rlinf/algorithms/advantages.py` | `@register_advantage("name")` + YAML `algorithm.adv_type` |
| Loss | `rlinf/algorithms/losses.py` | `@register_policy_loss("name")` + YAML `algorithm.loss_type` |
| Reward | `rlinf/algorithms/rewards/<domain>/` | `register_reward("name", Cls)` |
| Embodied Model | `rlinf/models/embodiment/<name>/` | `SupportedModel` 枚举 + 实现 `BasePolicy` + `requirements/install.sh` |
| 环境 | `rlinf/envs/<name>/` | `SupportedEnvType` + `get_env_cls()` 分支 + 可能的 `prepare_actions` 分支 |
| 新任务类型 | `rlinf/runners/` | 新 Runner + 入口脚本 |

## 五、单机 vs 多机

- **单机**：`cluster.num_nodes: 1`，`ray start --head` 后直接 `bash examples/embodiment/run_embodiment.sh <cfg>`。
- **多机**：每节点 `export RLINF_NODE_RANK=<i>` **再** `ray start`；入口脚本只在 head 上运行。
- 异构集群通过 `node_groups` + `component_placement` 实现，CPU/GPU/特殊硬件混合放置。

## 六、配置与可观测性

- **配置**：所有运行时参数都来自 Hydra/YAML（`examples/<task>/config/*.yaml`）。`build_config` 与 `validate_cfg` 是单一入口；禁止在代码中覆盖用户字段。
- **指标**：`MetricLogger`，后端可选 tensorboard / wandb / swanlab；命名空间 `train/`、`eval/`、`env/`、`rollout/`、`time/`。
- **检查点**：每 `runner.save_interval` 步存入 `checkpoints/global_step_<N>/`；恢复通过 `runner.resume_dir`（部分 runner 支持 `auto`）。

## 七、风格与提交

- Google 风格 docstring + 类型注解；Ruff 负责 lint 与 format。
- 日志统一走 `rlinf.utils.logging.get_logger()` 或 Worker 的 `self.log_*`，**不要 `print`**。
- 提交遵循 [Conventional Commits](https://www.conventionalcommits.org/)，每个 commit 必须 `Signed-off-by:`（`git commit -s`）。

## 八、`docs/` 文档系统

面向用户的 Sphinx 文档，发布到 ReadTheDocs。**双语强约束**：`source-en/` 与 `source-zh/` 的文件树、toctree、章节层级**完全一致**（已用 `diff` 验证），改一边几乎都要同步改另一边。

```
docs/
├── README.md                # 文档构建说明
├── Makefile / autobuild.sh  # 入口（autobuild 用 sphinx-autobuild 起本地预览）
├── source-en/               # 英文源（线上 .../en/latest/）
├── source-zh/               # 中文源（线上 .../zh-cn/latest/，conf.py: language=zh）
└── claude-notes/            # ← 本目录，内部协作笔记，不会进 Sphinx 构建
```

**`source-{en,zh}/` 内部结构**（两边相同）：

| 子目录 | 用途 |
| --- | --- |
| `index.rst` | 首页，七个 toctree 串起所有区 |
| `conf.py` | Sphinx 配置：autodoc/autosummary/napoleon/myst_parser，主题 `pydata_sphinx_theme`；`autodoc_mock_imports` 已 mock `sglang/megatron/prismatic/libero/lerobot`（构建文档不必装重型依赖） |
| `navbar.yml` | 顶部导航条 |
| `_static/`, `_templates/` | 静态资源与模板 |
| `rst_source/start/` | 安装 / VLA / LLM 快速开始 / 评估 / 分布式 |
| `rst_source/tutorials/` | 教程：mode / multi_nodes / scheduler / rlalg / extend / advance / user / communication / components / release |
| `rst_source/examples/` | 示例库（embodied / agentic / system） |
| `rst_source/apis/` | API 参考（actor / rollout / env / channel / cluster / placement / worker / data / replay_buffer / embodied_data） |
| `rst_source/blog/` | 博客 |
| `rst_source/publications/` | 论文页（`add-publication-docs` skill 会同步写 EN+ZH 并接 toctree/navbar） |
| `rst_source/faq.rst` | 常见问题 |

**构建流程**：

```bash
export LC_ALL=C.UTF-8 LANG=C.UTF-8
bash requirements/install.sh docs --venv .docs-venv
source .docs-venv/bin/activate
cd docs && bash autobuild.sh zh   # 本地预览，端口 8000；不带参数默认 en
# 或一次性： sphinx-build docs/source-zh docs/build/html
```

`autobuild.sh` 用 `sphinx-build -W ...`，**warning 即 error**，中文文档里的语法警告也会让构建失败。

**改造时的双语同步规则**：

- 涉及**用户可见行为**（新增 model / env、配置键、入口脚本、新算法等）→ 同时改 `source-en` 与 `source-zh`，用 `docs-check` skill 做一致性校验。
- 新论文 → `add-publication-docs` skill；新 example/model/env → `add-example-doc-model-env` skill。
- 纯内部协作笔记 → 只写 `docs/claude-notes/`，**不要污染 `source-*/`**。

