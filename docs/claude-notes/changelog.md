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

## [2026-05-24] 后端自启：Tauri 自动管理 Python backend 生命周期
- **类型**：feat
- **范围**：`gui/frontend/src-tauri/src/lib.rs`、`gui/frontend/src-tauri/tauri.conf.json`
- **动机**：用户反馈装完 .deb 后还要手动 `uvicorn` 启后端才能用，不符合"装完点图标就能用"的预期。
- **变更**：
  - `lib.rs`：app 启动时自动 `find_backend_dir()` → `ensure_backend_venv()`（首次启动自动创建 venv + 装依赖）→ `start_backend()`（spawn uvicorn 子进程）。关 app 时 `on_event(ExitRequested|Exit)` 自动 kill 后端进程。
  - `lib.rs`：`find_backend_dir()` 支持 3 种路径发现（dev 相对路径 / .deb 安装路径 `/usr/share/rlinf-studio/backend` / `$HOME/RLinf/gui/backend`）。
  - `tauri.conf.json`：`bundle.resources` 把 `backend/` 的 Python 源码打进 .deb 安装包；`bundle.linux.deb.depends` 声明 `python3 >= 3.10`、`python3-venv`、`python3-pip` 为系统依赖。
  - 新增 `backend_status` Tauri command，前端可查询后端进程状态。
- **用户体验变化**：`sudo dpkg -i rlinf-studio.deb` → 点图标 → app 自动启后端 → 直接可用。首次启动会多等几秒（创建 venv + pip install）。
- **后续**：首次启动的 pip install 耗时可通过在 .deb postinst 脚本里预装依赖来优化。

## [2026-05-24] Phase 1 功能完成 + Review Agent 安全修复
- **类型**：feat + fix
- **范围**：`gui/backend/`、`gui/frontend/`
- **变更**：
  - **ConfigEditor 页面**（新增）：左侧 Ant Design Tree 展示 `examples/` 下所有 YAML 配置文件树，右侧 Monaco Editor 编辑 YAML（vs-dark 主题、语法高亮、行号），「验证」按钮调后端 OmegaConf 校验。文件：`pages/ConfigEditorPage.tsx`、`components/ConfigEditor.tsx`。
  - **Templates + TaskCreate 前后端联调**：修复前后端 Pydantic model / TypeScript interface 全面不匹配的问题（字段名、类型、endpoint 路径）；后端 `template_service.py` 现在正确扫描 `examples/` 发现 50+ 入口脚本和 272 个 config preset；`TaskCreate` 3 步向导能完整走通到提交。
  - **Review Agent 安全修复（5 Critical + 5 Important）**：
    1. 🔴 `task_service.py`：`shell=True` → `shell=False` + list form，消除命令注入
    2. 🔴 `task_service.py`：已加 `preexec_fn=os.setsid`，`os.killpg` 不再杀后端自身
    3. 🔴 `api/configs.py`：`finally: Path(tmp_path).unlink()` 修临时文件泄漏
    4. 🔴 `tauri.conf.json`：CSP 从 `null` → 限制 `connect-src localhost:18721`
    5. 🔴 `config.py`：后端绑定从 `0.0.0.0` → `127.0.0.1`
    6. 🟡 `task_service.py`：`datetime.utcnow()` → `datetime.now(timezone.utc)`
    7. 🟡 `task_service.py`：进程自然结束时自动 close log 文件句柄
    8. 🟡 `api/configs.py`：`config_tree()` 去掉 `async` 让 FastAPI 自动线程池运行
    9. 🟡 `api/templates.py`：template ID 路由用 `{template_id:path}` 支持斜杠
    10. 🟡 `api/tasks.py`：新增 `POST /{task_id}/stop` endpoint 对齐前端
- **工作模式**：首次使用「coding agent × 2 + review agent × 1」并行模式。Review agent 独立审计发现 25 项问题，coding agent 修了 7 项，我手动修了 8 项。
- **后续**：Phase 2 开始前需解决「后端需手动 CLI 启动」问题（应由 Tauri 自动管理 Python sidecar 生命周期）。

## [2026-05-24] RLinf 桌面 GUI 应用方案设计完成，开始 Phase 1
- **类型**：feat（新功能立项）
- **范围**：`gui/`（新增）、`docs/claude-notes/requirements.md`
- **动机**：zhanglinjun 提出要做桌面应用替代 CLI 操作，参考智元 AGIBOT 产品界面。经 codebase 探索（50+ 入口脚本、272 YAML、13 种 runner、22 模型、15 环境）后设计了完整方案。
- **变更**：
  - 完成需求文档：`requirements.md` 新增"RLinf 用户界面（桌面应用）"条目（6 项目标 + 5 阶段交付计划）。
  - 完成技术方案：plan file 含技术栈（Tauri 2.x + React + FastAPI）、架构图、仓库结构、5 阶段交付计划、模板系统设计、节点管理设计、验证方式。
  - 开始 Phase 1：创建 `gui/` 目录脚手架。
- **后续**：Phase 1 目标是 4-6 周交付骨架 + 配置编辑器 + .deb 打包。

## [2026-05-23] concepts.md 加 §十「RL 数学符号速查」（π_θ 系列）
- **类型**：docs
- **范围**：`docs/claude-notes/concepts.md`
- **动机**：zhanglinjun 问 π_θ 是什么——RL 论文公式里的标准记号但前文一直没解释，导致后面 §十一 RL 范式 / HIL-SERL / PPO 公式都看不懂。
- **变更**：
  - 新 §十「RL 数学符号速查」插在原 §十 之前，含 5 段：策略相关 (π / θ / π_θ / π_θ(a|s) / π_θ_old / π_β / π_E / π*) / MDP 基本量 (s, a, r, s', γ, τ) / 回报与价值 (G_t, V^π, Q^π, A^π) / 学习信号 (𝔼, ∇_θ, log π_θ, r_t(θ), D_KL) / 在 RLinf 代码里对照表 + "看公式的小窍门"5 条。
  - 原 §十 「RL 训练范式」→ §十一；原 §十一「不在本文范围」→ §十二。
  - 更新 3 处交叉引用：§五 rollout 表的 on/off-policy 行、§十符号速查内部提示、§十二 RL 算法行都指向新 §十一。
- **设计**：每个符号给"读法 / 含义 / 代码里通常是什么"三栏。比如 π_θ 的代码对应是 `policy = Policy()` 这个 nn.Module 实例。
- **后续**：以后扯到任何 RL 公式直接回指 §十；HIL-SERL / RLPD / PPO / GRPO 论文公式都能套这套符号读。

- **类型**：docs
- **范围**：`docs/claude-notes/concepts.md`
- **动机**：zhanglinjun 问"BC 是什么"以及希望 on-policy / off-policy 不要只是一行带过。
- **变更**：
  - 新 §十 含 10 个子节：坐标轴图 / BC / DAgger 家族 / On-policy RL / Off-policy RL / Offline RL / 混合方案（RLHF/DPO/HIL-SERL/GRPO+SFT）/ RLinf 对照速查表 / 怎么选 / 常见误解 / 进阶阅读。
  - 每个范式都给损失函数 / 数据生命周期 / 优缺点 / **RLinf 真实代码路径**（grep 验证过）：
    - BC = SFT，入口 `examples/sft/`
    - DAgger = `rlinf/workers/actor/{fsdp,async_fsdp}_dagger_policy_worker.py`，config `maniskill_dagger_mlp.yaml` 等
    - SAC / RLPD = `rlinf/workers/actor/{fsdp,async_fsdp}_sac_policy_worker.py` + replay buffer，config `*_sac_*.yaml` / **`realworld_*_rlpd_*.yaml`（RLPD 真有！纠正前文"RLPD 风格"说法）**
    - Offline RL = `rlinf/runners/offline_runner.py` + `d4rl_iql_*.yaml`
  - 进阶阅读链接到 Sutton & Barto / DAgger / PPO / GRPO / SAC / RLPD / IQL / DPO / HIL-SERL / Offline RL Tutorial。
  - §五 rollout 表里 on-policy / off-policy 行加了到 §十 的交叉引用。
  - 原 §十「不在本文范围但相关的术语」改编号 →§十一，其中 RL 算法行精简为指向 §十。
- **重点纠错**：之前调研 HIL-SERL 时说"RLinf 是 RLPD 风格混采"——其实 `realworld_*_rlpd_cnn_async.yaml` 配置直接存在，**RLinf 已显式实现 RLPD**。
- **后续**：跟 HIL-SERL 改造路线衔接更顺——RLPD 这个基座已就位，缺的只是 intervention buffer 分流那一层。

## [2026-05-23] 写核心概念答疑文档 docs/claude-notes/concepts.md
- **类型**：docs
- **范围**：`docs/claude-notes/concepts.md`（新增）+ `README.md` 加条目
- **动机**：zhanglinjun 问 Ray / Hydra / FSDP / Megatron / rollout / SGLang / vLLM 都是什么，深度研究 + 搜索后落成文档。
- **方法**：并行 6 次 WebSearch（Ray、Hydra、FSDP、Megatron、SGLang、vLLM，各拿 2025-2026 最新资料）+ `grep` RLinf 代码看每个东西的实际入口（`rlinf/scheduler/`、`rlinf/hybrid_engines/{fsdp,megatron,sglang,vllm}/`、`rlinf/workers/rollout/`、`@hydra.main` 入口等）。
- **变更**：新增 `concepts.md`，10 节：
  - §〇 为什么这七个一起出现（四层栈：调度/配置/训练后端/rollout 后端）
  - §一-§七 每个概念六段式（一句话定位 / 解决什么问题 / 关键概念 / 在 RLinf 中的角色 + 代码路径 / 常见误解 / 进阶阅读）
  - §八 SGLang vs vLLM 在 RLinf 里怎么选（对比表 + 实际场景建议）
  - §九 一图看清七者在 RLinf 里的关系（ASCII 流程图）
  - §十 不在本文范围但相关的术语（NCCL / DDP / DeepSpeed / TRT-LLM / 算法名词 / VLA 模型名）
- **设计**：每节都给 RLinf 代码具体文件路径（不只讲概念）；每节标"常见误解"避免下次踩坑；每节给 2-4 个进阶链接（含 web 搜索来源）。
- **后续**：若后续讨论里又冒出陌生术语，照同样格式追加到 §十 或新开小节即可。

## [2026-05-23] deployment.md 扩充 Embodied 路线（§十一）
- **类型**：docs
- **范围**：`docs/claude-notes/deployment.md`
- **动机**：zhanglinjun 真正关心的是 Embodied 方向（HIL-SERL 等），Math 镜像是部署演练。文档要把 Embodied 路线也覆盖到。
- **变更**：
  - 顶部介绍改成「两条路线：Math（已实测）+ Embodied（未实测）」。
  - §三-§八 标题加「**Math 路线**」标识。
  - §⚠️ 训练前必须再确认：改成两条路线通用，区分各自的 GPU/output_dir 要点，新增第 6 条指向 §十一.8。
  - §十 「从清理状态接续」追加「若要部署 Embodied」一句指向 §十一。
  - **新增 §十一 Embodied 路线**（§十一.1~§十一.8），含：
    1. 镜像选择表（按环境切，列了官方明确 + 推测的 tag、各自能跑的 yaml、8GB 显存可行性）。
    2. 拉镜像（明确说官方只标了 `agentic-rlinf0.2-maniskill_libero`，其他 tag 用前需 `docker manifest inspect` 确认）。
    3. 资产下载（model + ManiSkill assets dataset repo，**不再加 HF_ENDPOINT** 因为 Math 实测不生效）。
    4. 改 YAML（OpenVLA / OpenVLA-OFT / mlp 三套示例字段）。
    5. 起容器（多 `MUJOCO_GL=egl` / `PYOPENGL_PLATFORM=egl` / `ROBOT_PLATFORM=LIBERO`；**不挂 /root /opt，HOME 别动**）。
    6. 容器内 setup（`source switch_env <name>`、host bind mount 方案下用 symlink 把 `rlinf/envs/maniskill/assets` 指到 host 资产、`link_assets` 何时用）。
    7. 验证（含 EGL 渲染 smoke test）。
    8. ⚠️ Embodied 加项（VLA 显存换算、ManiSkill GPU 仿真额外占用、EGL 必设、ROBOT_PLATFORM 选项、入口脚本是 `run_embodiment.sh`）。
  - **整节都明确标注「未在本机实测」**，避免重复给信心错觉；具体字段/流程都对照 [installation.rst](../source-en/rst_source/start/installation.rst) + [vla.rst](../source-en/rst_source/start/vla.rst) + Dockerfile + `run_embodiment.sh` 实地核验。
- **后续**：以后真在某台机器上跑通 Embodied，及时把 §十一 里的「待 recon 确认」/「（推测，需验证）」标记替换成实测数据，并把跟预测不符的差异回写到 [issues.md](issues.md)。

## [2026-05-23] 决定本机不真跑训练，清理 docker 占用，保留文档与资产
- **类型**：chore
- **范围**：docker / 磁盘 / `docs/claude-notes/deployment.md`
- **动机**：zhanglinjun 看完前一轮部署过程后，决定暂不在当前机器真跑 RLinf 训练（8 GB 显存 + 磁盘空间紧张双重制约，最终部署目标是真机 Ubuntu）。要求"删 docker math 镜像腾空不动别的"。
- **变更**：
  - `docker rm -f rlinf-math`（释放容器写层 5.88 GB）。
  - `docker rmi rlinf/rlinf:math-rlinf0.2-...`（释放镜像 21 GB）。
  - 内部磁盘用量释放 ~25 GB。
  - `deployment.md §十` 改写为「已清理快照」+「从清理状态接续」+「附：vhdx 压缩」三段。
- **保留不动的**：
  - HF 资产 `/home/ubuntu/rlinf-assets/{models,datasets}`（3.4 GB + 73 MB）。
  - `examples/reasoning/config/math/qwen2.5-1.5b-single-gpu-local.yaml`（路径已改 + `process_num: 2`）。
  - `/etc/systemd/system/docker.service.d/http-proxy.conf`（dockerd 代理 systemd drop-in）。
  - 用户原有的 `nvcr.io/nvidia/isaac-sim:5.1.0` 等其他 docker 镜像。
  - 全部 `docs/claude-notes/` 笔记。
- **后续**：暂不跑训练；最终在真机 Ubuntu 上部署时按 `deployment.md` 流程走即可。

## [2026-05-23] Quick Start 部署尝试：拉通到训练启动，因硬件/磁盘问题中止
- **类型**：chore
- **范围**：部署 + 测试（未落到代码改动）
- **动机**：zhanglinjun 想按官方部署方式直接使用 RLinf。选了 Docker + 中国镜像加速 + Quickstart 2（LLM-1.5B-single-gpu）。
- **流程实际走完**（含踩坑）：
  1. 验证 Docker GPU 支持（NVIDIA Container Toolkit 已装好）。
  2. 尝试 `docker.1ms.run/rlinf/rlinf:math-...` mirror → 多次卡死，layer 5/26 后停滞 10+ min。
  3. 换试 `docker.m.daocloud.io` / `docker.1panel.live` / `mirror.ccs.tencentyun.com` → 全部被白名单或区域限制拒绝。
  4. 用户已有 `127.0.0.1:7897` 代理能直连 Docker Hub，让用户配 `/etc/systemd/system/docker.service.d/http-proxy.conf` + 重启 dockerd → 直接拉官方 `rlinf/rlinf:math-rlinf0.2-...`，**4 分钟 21 GB 拉完，72 MB/s**。
  5. `hf download` 下 Qwen-1.5B (3.4 GB) 与 AReaL-boba 数据集 (73 MB) 到 `/home/ubuntu/rlinf-assets/`，期间踩了 SSL EOF + 代理并发限流坑（详见 issues.md）。
  6. Recon 镜像内部：venv 在 `/opt/venv/reason/`，Megatron 在 `/opt/venv/reason/Megatron-LM`（不是脚本期望的 `/opt/Megatron-LM`，做了软链）。
  7. 复制 `qwen2.5-1.5b-single-gpu.yaml` → `qwen2.5-1.5b-single-gpu-local.yaml`，改 4 处路径 + `process_num: 16→2`。
  8. 容器 detach 启动 `rlinf-math`，bind mount `/home/ubuntu/RLinf` 与 `/home/ubuntu/rlinf-assets`。
  9. 第一次跑训练：Ray worker memory monitor 在 14.81/15.54 GB（95%）杀掉 SGLang/Reward worker。
  10. 加 `RAY_memory_usage_threshold=0.98 RAY_memory_monitor_refresh_ms=0` 后重跑：Linux OOM killer 直接 SIGKILL。
  11. 扩系统 RAM 到 29 GB 后重试。
  12. 第三次跑训练：磁盘空间不足导致系统崩溃——训练中间写出 Megatron checkpoint 5.4 GB + Ray spill + logs，撑爆磁盘。
  13. 事后定位：根因是磁盘剩余空间不足（< 20 GB），训练中间产物无法写入。
- **当前留下的资产**（都还在）：
  - Docker image `rlinf/rlinf:math-... (20.9 GB)`，dockerd 代理配置（持久）。
  - 容器 `rlinf-math`（Exited 255，可 `docker start` 复活）。
  - `/home/ubuntu/rlinf-assets/{models,datasets}` 3.4 GB + 73 MB。
  - `examples/reasoning/config/math/qwen2.5-1.5b-single-gpu-local.yaml`（路径已改 + `process_num: 2`）。
  - `/etc/systemd/system/docker.service.d/http-proxy.conf`。
- **决定**：与 zhanglinjun 商量后，**暂停当前机器的训练**。8 GB 显存 + 磁盘空间紧张不适合 RLinf 完整训练栈。最终部署在真机 Ubuntu 上。
- **关联 issues**：[issues.md](issues.md) 三条 2026-05-23 条目（dockerd 代理、RAM 不足、vhdx 撑爆）。
- **复盘 / 下次应该**：
  1. 部署前必查：GPU VRAM、系统 RAM、磁盘 free space、Docker 镜像源情况。
  2. 训练这类需要多 GB 中间产物的负载，先把 output_dir / spill 目录 bind 到 host 大盘，不让 vhdx 扛压力。
  3. Docker run 加 `--memory` 上限，防止 swap → vhdx 灾难。

## [2026-05-23] 调研：RLinf 对 HIL-SERL 的支持现状
- **类型**：docs
- **范围**：调研结论（影响后续改造方向）
- **动机**：zhanglinjun 询问当前 RLinf 是否支持 HIL-SERL，作为后续可能改造方向的输入。
- **结论**：**未作为一等公民 named trainer 实现**；仓库唯一显式提及 HIL-SERL 的是 `rlinf/models/embodiment/reward/resnet_reward_model.py:19` 的 docstring（"similar to the HIL-SERL approach"）。但 HIL-SERL 的关键积木**几乎齐全**：
  - SERL 仓库：通过 `requirements/install.sh:1511-1631` 安装 `serl_franka_controllers`（rail-berkeley）与 fork 的 `franka_sim`（`github.com/RLinf/serl.git -b RLinf/franka-sim`）。
  - SERL 风格 env：`rlinf/envs/frankasim/frankasim_env.py:138` 的 `SERLFrankaEnv`。
  - 视觉硬件：`rlinf/envs/realworld/common/camera/realsense_camera.py:25`「Adapted from SERL's RSCapture」。
  - SAC 算法 + 配置：`examples/embodiment/config/{frankasim_sac_cnn_async,realworld_*_sac_cnn*,maniskill_sac_mlp_resnet_reward_async}.yaml`。
  - ResNet 二分类奖励模型：`rlinf/models/embodiment/reward/resnet_reward_model.py`。
  - 人类介入 wrapper：`SpacemouseIntervention`（`rlinf/envs/realworld/common/wrappers/spacemouse_intervention.py:29`）+ `LeaderFollowerKeyboardIntervention`。
  - Demo+replay 混采（RLPD 风格）：`rlinf/data/embodied_buffer_dataset.py:40-110` 的 `demo_buffer` 与 `batch_size//2` 混采。
  - 介入信号：`rlinf/envs/wrappers/collect_episode.py:602` 在 step info 中记录 human/expert intervention。
  - 同家族范式：`hg-dagger.rst` 已有独立示例。
- **若要补齐为真·HIL-SERL**：(1) 介入 transitions 分流到独立 `intervention_buffer` 与 replay/demo 三路混采；(2) 新增 `franka_hil_serl.yaml` + 双语示例文档；(3) SAC 损失中给介入步加 BC 监督项开关。
- **后续**：等 zhanglinjun 确认是否把"补齐 HIL-SERL 支持"作为正式改造目标；若是，开新 requirements 条目。
- **关联**：[architecture.md §八](architecture.md) 文档系统说明。

## [2026-05-23] 启动「逐步分析项目」工作流，落地 docs/ 系统说明
- **类型**：docs
- **范围**：`docs/claude-notes/architecture.md`
- **动机**：zhanglinjun 要把这个项目一步一步分析透彻，作为后续改造的基础。本轮分析的第一站是 `docs/source-zh/`（中文 Sphinx 文档源）。
- **变更**：
  - 在 `architecture.md` 末尾新增「八、`docs/` 文档系统」一节，沉淀 `source-en`/`source-zh` 双语对齐约束、子目录用途、`conf.py` 关键配置（autodoc/myst/mock_imports）、`autobuild.sh -W` warning 即 error 的坑、双语同步规则与对应的 skill（`docs-check` / `add-publication-docs` / `add-example-doc-model-env`）。
  - 顶部「最后更新」日期改为 2026-05-23。
- **后续**：分析下一块项目结构时继续按「架构演进改 architecture / 新需求进 requirements / 变更进 changelog / 报错进 issues」分流。

## [2026-05-22] 推送到个人仓库 0mrrabbit0/RLinf
- **类型**：chore
- **范围**：git remote / GitHub
- **动机**：把 `docs/claude-notes/` 及 memory 快照保存到 zhanglinjun 自己账号下的仓库。
- **变更**：
  - 通过 `gh CLI`（用户本地下载 v2.62.0 到 `~/.local/bin/gh`，使用 fine-grained PAT 含 Account: Administration RW 权限）创建 `github.com/0mrrabbit0/RLinf`（public）。
  - 本地：`origin` 重命名为 `upstream`（保留上游引用以便 `git fetch upstream`），新 `origin` 指向 `git@github.com:0mrrabbit0/RLinf.git`。
  - `git push -u origin main` 推送全部 535+1 commit。
- **后续**：之后所有协作产生的 commit 默认推送到 `origin`（个人仓库）；若需要同步上游更新，使用 `git fetch upstream && git merge upstream/main`。

## [2026-05-22] 纳入 Claude 协作记忆快照
- **类型**：docs
- **范围**：`docs/claude-notes/memory/`
- **动机**：zhanglinjun 要把对话记忆也提交到仓库，方便换机器/换环境时还原协作上下文。
- **变更**：
  - 新建 `docs/claude-notes/memory/` 目录。
  - 复制 `~/.claude/projects/-home-ubuntu-RLinf/memory/{MEMORY.md, claude_notes_workflow.md}` 进来作为快照。
  - 新增 `memory/README.md` 说明真源与同步约定。
  - 在 `docs/claude-notes/README.md` 文档清单里追加 memory 条目。
- **后续**：memory 在 `~/.claude/` 下会持续变化；后续重要更新需要手动同步到此目录再 commit，不追求实时一致。

## [2026-05-22] quickstart 补充「可视化界面」章节
- **类型**：docs
- **范围**：`docs/claude-notes/quickstart.md`
- **动机**：zhanglinjun 询问仓库是否自带 GUI；确认无项目专属 GUI 后，把可用的外部可视化工具（Ray Dashboard / TensorBoard / W&B / SwanLab / Sphinx / 环境 viewer）整理成表格写入快速开始文档，避免下次再查。
- **变更**：新增 §6「可视化界面」，原「提交与 PR 规范」从 §6 顺延到 §7。
- **后续**：无。

## [2026-05-22] 建立 `docs/claude-notes/` 笔记体系
- **类型**：docs
- **范围**：`docs/claude-notes/`
- **动机**：zhanglinjun 希望有一处稳定的位置记录架构、需求、变更、快速开始、问题解决，并约定每次对话回写。
- **变更**：
  - 新建 `docs/claude-notes/` 目录。
  - 新建五份 Markdown：`README.md`、`architecture.md`、`requirements.md`、`changelog.md`、`quickstart.md`、`issues.md`。
  - 架构文档综合 `AGENTS.md` 与 `CLAUDE.md` 的内容做了中文速查梳理。
- **后续**：之后每次对话都要把新需求/新变更/踩坑回写到对应文档。
