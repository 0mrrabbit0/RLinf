# 快速开始

> 面向「拿到机器、想第一时间跑起来」的场景，覆盖单机安装、Ray 启动、训练/评估三类常见入口。
> 更完整的官方说明见 [Installation](https://rlinf.readthedocs.io/en/latest/rst_source/start/installation.html) 与 [VLA quickstart](https://rlinf.readthedocs.io/en/latest/rst_source/start/vla.html)。

## 1. 安装

两种方式二选一：

### 方式 A：Docker（推荐，环境完全隔离）
```bash
# 各模型/环境对应的 Dockerfile 阶段在 docker/ 下，使用 add-install-docker-ci-e2e 维护
docker build -f docker/<task>/Dockerfile -t rlinf:<tag> .
```

### 方式 B：脚本安装
```bash
export REPO_PATH=/home/ubuntu/RLinf
# 示例：安装 embodied 的 openvla + maniskill 组合
bash requirements/install.sh embodied --model openvla --env maniskill
```

> 不同 `--model` / `--env` 组合可能需要额外资源路径，按脚本提示设置。

## 2. 启动 Ray

### 单机
```bash
ray start --head
# 或在 examples 脚本里让其自启
```

### 多机
在 **每个节点** 上、**`ray start` 之前** 先设置好节点序号：
```bash
export RLINF_NODE_RANK=<0..N-1>          # 必须唯一
export RLINF_COMM_NET_DEVICES=<可选>      # 指定 RDMA / IB 设备
```
然后：
```bash
# Head
ray start --head --port=6379 --node-ip-address=<head_ip>
# Worker
ray start --address=<head_ip>:6379
```
也可以直接用 `bash ray_utils/start_ray.sh`。

## 3. 训练

### Embodied（单机示例）
```bash
export MUJOCO_GL=egl
export ROBOT_PLATFORM=<your_platform>
bash examples/embodiment/run_embodiment.sh <config_name>
# 或：
python examples/embodiment/train_embodied_agent.py --config-name <config_name>
```

配置位于 `examples/embodiment/config/*.yaml`，关键字段：
- `cluster.num_nodes`、`cluster.component_placement`
- `algorithm.adv_type`、`algorithm.loss_type`
- `actor.*`、`rollout.*`、`env.*`、`runner.*`

### Reasoning / Agent / SFT
入口分别位于 `examples/reasoning/`、`examples/searchr1/`、`examples/wideseek_r1/`、`examples/sft/`，启动模式同上：

```bash
python examples/reasoning/<entry>.py --config-name <cfg>
```

## 4. 评估

### Embodied 独立评估
```bash
bash examples/embodiment/eval_embodiment.sh <eval_config_name>
```
详见 [VLA evaluation](https://rlinf.readthedocs.io/en/latest/rst_source/start/vla-eval.html)。

### Reasoning / LLM 评估
详见 [LLM evaluation](https://rlinf.readthedocs.io/en/latest/rst_source/start/llm-eval.html)。

## 5. 常见 OOM 调优

| 维度 | 字段 |
| --- | --- |
| 环境侧 | `env.train.total_num_envs`、`env.train.group_size` |
| Rollout 侧 | `rollout.*` 的 batch/seq、`gpu_memory_utilization`、`enable_offload` |
| Actor 侧 | `actor.*` 的 `micro_batch_size`、`global_batch_size`、`gradient_checkpointing`、`enable_offload` |

更多 SGLang/显存相关坑见 [FAQ](https://rlinf.readthedocs.io/en/latest/rst_source/faq.html) 与本目录的 [issues.md](issues.md)。

## 6. 可视化界面

RLinf **本身不带项目专属的 GUI / Web 前端**，所有图形化能力都来自外部依赖：

| 工具 | 启用方式 | 用途 |
| --- | --- | --- |
| Ray Dashboard | `ray start --head` 后访问 `http://<head_ip>:8265` | 查看 Worker/Actor 状态、资源、日志 |
| TensorBoard | `runner.logger.logger_backends: [tensorboard]` | 训练曲线（`train/`、`eval/`、`env/`、`rollout/`、`time/`） |
| W&B | `runner.logger.logger_backends: [wandb]` | 云端训练监控 |
| SwanLab | `runner.logger.logger_backends: [swanlab]` | 国内可用的训练监控 |
| Sphinx 文档 | `cd docs && make html` | 本地浏览静态文档 |
| 环境 viewer | ManiSkill / LIBERO / IsaacLab 等环境自带 | 机器人仿真画面，需要 `MUJOCO_GL=egl` 等 |

需要训练监控时，推荐组合 **Ray Dashboard + TensorBoard/W&B/SwanLab**；相关 logger 详细配置见 [logger tutorial](https://rlinf.readthedocs.io/en/latest/rst_source/tutorials/advance/logger.html)。

## 7. 提交与 PR 规范（速记）

```bash
git commit -s -m "feat(scope): 简短描述"  # 必须带 -s 以生成 Signed-off-by
```
- 标题遵循 Conventional Commits，约 72 字符以内。
- 新行为需要单元测试或 e2e 测试；e2e 若依赖 GPU/硬件，需在 CI 中合理跳过。
- 完整流程见仓库根目录 [CONTRIBUTING.md](../../CONTRIBUTING.md)。
