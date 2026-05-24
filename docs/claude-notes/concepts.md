# 核心概念答疑

> 把 RLinf 架构里反复出现的术语一次说清楚：Ray / Hydra / FSDP / Megatron-LM / rollout / SGLang / vLLM。
>
> 写法：每个概念 6 段——一句话定位 / 解决什么问题 / 关键概念 / **在 RLinf 中扮演什么角色（带代码路径）** / 常见误解 / 进阶阅读。
>
> 最后两节是「**SGLang vs vLLM 选哪个**」和「**一图看清七者在 RLinf 里的关系**」。

---

## 〇、为什么这七个一起出现

RLinf 是 **强化学习训练系统**，它的工作循环是：

```
            ┌─────────────────────────────────────────────┐
            │                                             │
            ▼                                             │
       数据 (prompt / state) ─────▶ rollout ──▶ 经验 (response/action, reward)
                                    ▲                     │
                                    │                     ▼
                                    │              advantage 计算
                                    │                     │
                                    │                     ▼
                                    └───── actor 梯度更新 ◀┘
```

要把这套循环工程化到能上百卡跑，技术栈天然分四层：

| 层 | 干什么 | RLinf 用的 |
| --- | --- | --- |
| **进程调度** | 起多机多卡的 worker、管 actor 之间的消息 | **Ray** |
| **配置** | 几千行 YAML 怎么组合 / 命令行覆写 | **Hydra** |
| **训练后端**（梯度计算 + 反传） | 把大模型分片到多卡训得起 | **FSDP** 或 **Megatron-LM**（YAML 二选一） |
| **rollout 后端**（生成 / 推理） | 让 actor 用当前权重快速生成大量回合 | **SGLang** 或 **vLLM**（YAML 二选一） |

`rollout` 不是工具，是 **RL 里的概念**——actor 在环境里"展开一段轨迹"。RLinf 把它实现为一个独立的 worker 组，挂上 SGLang/vLLM 当推理后端。

---

## 一、Ray

### 一句话定位
**通用的 Python 分布式调度框架**，把"一个函数 / 一个对象"变成可以在远程节点上跑的"任务 / 演员（actor）"。

### 解决什么问题
- 原生 Python 的 `multiprocessing` 跨机器很难用、没自动容错、没 actor 抽象。
- 训练系统里要同时管几十种角色（actor、rollout、reward、env、buffer、logger……），每种角色有自己的状态和生命周期，**actor 模型**比无状态任务自然得多。
- 对象在不同 worker 间传输需要零拷贝共享内存，否则上 TB 的数据搬来搬去会拖死系统。

### 关键概念
| 名词 | 含义 |
| --- | --- |
| **Task** | 用 `@ray.remote` 装饰的**无状态函数**。调用返回 `ObjectRef`（future）。 |
| **Actor** | 用 `@ray.remote` 装饰的**有状态类**。`Cls.remote(...)` 创建一个远程实例，方法调用返回 future。 |
| **Object Store** | 跨节点的分布式对象存储（Plasma + shared-memory），同节点零拷贝。 |
| **GCS (Global Control Store)** | 集群元数据中心，存 actor 注册、任务 lineage 用于容错。 |
| **Placement Group** | 把多个 task/actor 绑到同一组资源（如同一组 GPU）的机制。 |
| **Ray Dashboard** | `ray start --head` 后的 `http://<head>:8265`，看 actor 状态/资源/日志。 |

### 在 RLinf 中扮演什么角色
RLinf 的整个 [`rlinf/scheduler/`](../../rlinf/scheduler/) 包就是包在 Ray 之上的：

- [`rlinf/scheduler/cluster/`](../../rlinf/scheduler/cluster/) 抽象 ClusterConfig + 节点
- [`rlinf/scheduler/worker/`](../../rlinf/scheduler/worker/) 包装 Ray actor，加上日志、错误处理
- [`rlinf/scheduler/channel/channel.py`](../../rlinf/scheduler/channel/channel.py) Ray actor 之间传 prompt/response 的 channel 抽象
- [`rlinf/scheduler/placement/`](../../rlinf/scheduler/placement/) 把 actor / rollout / env / reward 放到指定 GPU/节点

每次跑 RLinf，**入口脚本只在 head 节点跑一次**；它通过 `ray.init()` 接到现成的 Ray 集群，然后 schedule worker 到各节点。所以你**必须先 `ray start --head`**（单机也一样）。

`(MegatronActor pid=...)`、`(RolloutGroup(rank=0) pid=...)`、`(raylet)` 这些日志前缀就是 Ray actor 的身份印。

### 常见误解
- **Ray ≠ Ray Train / RLlib**。Ray 是底层框架；Ray Train 是基于 Ray 的训练库，RLlib 是 RL 库。RLinf 只用了 **Ray Core**（task + actor），**没用** RLlib。
- Ray actor 不是"演员" angles，它就是 Python 的"远程对象"。

### 进阶阅读
- 论文：[Ray: A Distributed Framework for Emerging AI Applications](https://arxiv.org/abs/1712.05889)
- [Ray 官网](https://www.ray.io/) · [Anyscale Docs - What is Ray](https://docs.anyscale.com/get-started/what-is-ray)
- 入门博客：[How to Write Your First Distributed Python Application with Ray](https://www.anyscale.com/blog/writing-your-first-distributed-python-application-with-ray)

---

## 二、Hydra

### 一句话定位
**Facebook 开源的层次化配置框架**，专为"一个大项目有几十种实验组合"的场景设计。RLinf 的所有 YAML 都被 Hydra 管。

### 解决什么问题
ML 项目的配置三大痛：
1. **重复**：100 个实验只差几个超参，复制 100 份 YAML 不行。
2. **覆写**：想临时改一个参数，不能改源文件，要在命令行覆写。
3. **组合**：模型 × 数据集 × 优化器 × 集群配置正交，希望按"块"拼。

Hydra 用 **defaults list + override 语法** 一次解决这三件事。

### 关键概念
| 名词 | 含义 |
| --- | --- |
| **DictConfig / OmegaConf** | Hydra 用的配置对象，类似 `dict` 但带类型推断和插值（如 `${actor.model.precision}`）。 |
| **`@hydra.main`** | Python 入口装饰器，自动加载 yaml + 命令行参数。 |
| **`defaults` list** | yaml 顶部的 `defaults: [- env/maniskill, - algorithm/grpo]`，把多个子 config 拼成一个完整 config。 |
| **Override 语法** | `python main.py algorithm.kl_beta=0.01 actor.model.precision=bf16` 直接命令行改。 |
| **`+key=value`** | 强制新增（key 原本不在 config 里）。 |
| **`++key=value`** | 强制覆写（覆盖已有 OR 新增）。 |
| **Multirun (`--multirun`)** | 一行命令跑多个超参组合：`python main.py -m algorithm.kl_beta=0.0,0.01,0.1`。 |

### 在 RLinf 中扮演什么角色
- 所有训练入口（[examples/reasoning/main_grpo.py](../../examples/reasoning/main_grpo.py)、[examples/embodiment/train_embodied_agent.py](../../examples/embodiment/train_embodied_agent.py)、[examples/sft/train_vla_sft.py](../../examples/sft/train_vla_sft.py)）都是 `@hydra.main` 装饰的。
- yaml 在 `examples/<task>/config/` 下，按 task 分目录；`defaults` 拼装 cluster / env / algorithm / model 模块。
- [`rlinf/config.py`](../../rlinf/config.py) 的 `build_config` + `validate_cfg` 是 Hydra config 的统一处理入口：先合并 defaults、再做语义校验（比如 `loss_type == "actor_critic"` 时必须有 critic 字段）。
- 我们在 [deployment.md §五](deployment.md) 里改 `qwen2.5-1.5b-single-gpu-local.yaml` 那 5 处字段，就是改 Hydra config。

### 常见误解
- **Hydra 不是 schema 验证库**——它不强制 yaml 结构。校验是 RLinf 自己在 `validate_cfg` 里做的。
- yaml 里 `${var.path}` 是 OmegaConf 插值，**不是 bash 变量**——`${runner.experiment_name}` 会替换成 config 里 `runner.experiment_name` 的值。
- 命令行覆写后，Hydra 还会自动在 `outputs/<日期>/<时间>/` 下生成一份**完整 merged config 副本**——可以拿来复盘。

### 进阶阅读
- 官方仓库：[facebookresearch/hydra](https://github.com/facebookresearch/hydra) · [intro 文档](https://github.com/facebookresearch/hydra/blob/main/website/docs/intro.md)
- PyTorch 博客：[Hydra — A fresh look at configuration for ML projects](https://medium.com/pytorch/hydra-a-fresh-look-at-configuration-for-machine-learning-projects-50583186b710)
- 模板：[lightning-hydra-template](https://github.com/ashleve/lightning-hydra-template) （Hydra + PyTorch Lightning 的标杆用法）

---

## 三、FSDP（Fully Sharded Data Parallel）

### 一句话定位
**PyTorch 原生的"把模型权重/梯度/优化器状态分片到多卡"机制**，对标 Microsoft DeepSpeed 的 ZeRO Stage 3。

### 解决什么问题
- 一张 H100 80GB 装不下 70B 模型（fp16 至少 140 GB），多卡数据并行又会**每张卡复制一份完整模型**——还是装不下。
- ZeRO/FSDP 的核心思路：**模型状态切片散在多卡**，需要某层计算时再 all-gather 到一张卡上、用完即丢。
- 把 100% 重复变成 1/N 重复，N 张卡就能合起来装下 N 倍大的模型。

### 关键概念
| 概念 | 含义 |
| --- | --- |
| **Sharding** | 把张量按 0 维切 N 份，每张卡只持有 1/N。 |
| **`FULL_SHARD`** | 参数 + 梯度 + 优化器状态全切（= ZeRO-3，省内存最多，通信最多）。 |
| **`SHARD_GRAD_OP`** | 仅梯度 + 优化器切，参数复制（= ZeRO-2）。 |
| **`NO_SHARD`** | 不切（≈ 普通 DDP，= ZeRO-1）。 |
| **`HYBRID_SHARD`** | 单机内全切，机器间复制（兼顾节点内大模型、节点间通信少）。 |
| **All-gather / Reduce-scatter** | 前向时 all-gather 把切片合起来；反向时 reduce-scatter 把梯度散回去。 |
| **Wrapping policy** | 决定模型按什么粒度切 FSDP unit。**粒度太细 → kernel launch overhead；太粗 → 大 unit 装不下 OOM**。 |
| **CPU offload** | 把 sharded 参数继续推到 CPU RAM，进一步省 GPU 显存（换通信代价）。 |
| **FSDP2** | 2024 重写的 API，新增 implicit prefetching（all-gather 与计算重叠），`torch.compile` 友好。 |

### 在 RLinf 中扮演什么角色
RLinf 的 **训练后端二选一**之一（另一个是 Megatron-LM）：

- [`rlinf/hybrid_engines/fsdp/`](../../rlinf/hybrid_engines/fsdp/) 整个目录是 FSDP 适配层
  - [`strategy/fsdp.py`](../../rlinf/hybrid_engines/fsdp/strategy/fsdp.py) 实现 sharding 策略
  - [`fsdp_model_manager.py`](../../rlinf/hybrid_engines/fsdp/fsdp_model_manager.py) 管模型加载/保存
- yaml 里 `actor.training_backend: fsdp` 选 FSDP，`actor.fsdp_config.sharding_strategy: FULL_SHARD` 等等。
- RLinf 文档把 FSDP 路线定位为"**初学者友好、原型快**"路线，对标 Megatron 的"**性能极致**"路线。

### 常见误解
- **FSDP 不是数据并行的替代**——它就是"加了分片的"数据并行。多卡上仍然每张卡处理一份不同数据，只是参数被分散保管。
- 它**不解决 batch size 过大的问题**（那是 gradient accumulation 的事），它解决的是"模型本身装不下"。
- FSDP ≠ DeepSpeed。算法等价（FULL_SHARD ↔ ZeRO-3），但 FSDP 是 PyTorch 原生、不用装 DeepSpeed；DeepSpeed 多一些 ZeRO-Infinity（NVMe offload）这类高级功能。

### 进阶阅读
- [PyTorch FSDP2 官方教程](https://docs.pytorch.org/tutorials/intermediate/FSDP_tutorial.html) · [API 文档](https://docs.pytorch.org/docs/stable/fsdp.html)
- 论文（VLDB 2023）：[PyTorch FSDP: Experiences on Scaling Fully Sharded Data Parallel](https://www.vldb.org/pvldb/vol16/p3848-huang.pdf)
- 对比 ZeRO 的实战分析：[FSDP: Sharding Strategies vs ZeRO](https://mbrenndoerfer.com/writing/fsdp-fully-sharded-data-parallel-sharding-strategies-zero)

---

## 四、Megatron-LM

### 一句话定位
**NVIDIA 开源的大模型训练框架**，独到之处是把 Transformer 按"**张量并行 + 流水并行**"的方式切到几千张卡上，仍能保持高 MFU。

### 解决什么问题
当模型大到**一层都装不下一张卡**（比如 70B 的某个 MLP 中间维度），仅靠 FSDP-style 的层间切分还不够，需要：

- **张量并行 (TP)**：把**单个矩阵乘**切到多张卡上，每卡算自己的列/行，结果用 NCCL all-reduce 合。
- **流水并行 (PP)**：把模型按**层范围**切给不同 GPU stage，前向/反向走流水线（GPipe / 1F1B / interleaved 调度）。
- **序列并行 (SP)** / **上下文并行 (CP)**：把超长序列的激活按时间维度切。
- **专家并行 (EP)**：MoE 模型把不同 expert 放不同卡。

这些方法叠加在数据并行之上，叫 "3D / 4D / 5D parallelism"。

### 关键概念
| 名词 | 含义 |
| --- | --- |
| **TP (Tensor Parallel)** | 切单层矩阵。需要高带宽（NVLink 内）。`ColumnParallelLinear` / `RowParallelLinear`。 |
| **PP (Pipeline Parallel)** | 切层范围。每个 stage 算一段，激活通过 P2P 传给下一 stage。GPipe / 1F1B / VPP（interleaved）三种调度。 |
| **DP (Data Parallel)** | 经典数据并行，每个 replica 处理不同数据。 |
| **EP (Expert Parallel)** | MoE 专家分布。 |
| **SP (Sequence Parallel)** / **CP (Context Parallel)** | 序列维度切分，省激活内存。 |
| **公式** | `DP_size = WorldSize / (TP × PP × CP)` |
| **Megatron-Core** | 把 Megatron 的核心算子做成可复用库，单独发布。RLinf 用的就是这个。 |
| **Megatron Bridge** | 把 Hugging Face checkpoint 双向转 Megatron 格式的桥。**我们 deployment 跑训练时那个 5.4 GB 的 "Megatron checkpoint"** 就是 Bridge 转出来的。 |

### 在 RLinf 中扮演什么角色
RLinf 的**另一个训练后端**：

- [`rlinf/hybrid_engines/megatron/`](../../rlinf/hybrid_engines/megatron/) 适配层
- yaml 里 `actor.training_backend: megatron` 选 Megatron，配 `actor.model.tensor_model_parallel_size`、`actor.model.pipeline_model_parallel_size` 等。
- [`rlinf/utils/train_utils.py`](../../rlinf/utils/train_utils.py)、[`rlinf/utils/initialize.py`](../../rlinf/utils/initialize.py) 包了 Megatron 的初始化逻辑。
- 镜像里 Megatron-LM 源码在 `/opt/venv/reason/Megatron-LM`（我们 deployment.md §七 软链到了脚本期望的 `/opt/Megatron-LM`）。
- **HF→Megatron 转换**：[deployment.md §⚠️](deployment.md#-训练前必须再确认) 里那个 `process_num` 参数就是控制 Megatron Bridge 转 checkpoint 的并行进程数（默认 16，我们改成了 2 防 OOM）。

### 常见误解
- **Megatron 不是 PyTorch 替代**——它是 PyTorch 上的并行库 + 一堆 fused kernel。
- **TP size 必须能整除 num_attention_heads**——否则 attention 切不动会报错。
- **Megatron 优化器 state 是 fp32**（即使 fp16 训练），1.5B 模型的 Adam state 就是 12 GB。这就是为什么 RL 训练 RAM 压力比 SFT 大。

### 进阶阅读
- [NVIDIA/Megatron-LM 仓库](https://github.com/NVIDIA/Megatron-LM)
- [Megatron-Core 开发者指南](https://docs.nvidia.com/megatron-core/developer-guide/latest/)
  - [tensor_parallel package](https://docs.nvidia.com/megatron-core/developer-guide/latest/api-guide/tensor_parallel.html)
  - [pipeline_parallel package](https://docs.nvidia.com/megatron-core/developer-guide/latest/api-guide/pipeline_parallel.html)
- [NeMo Megatron Bridge - Parallelisms Guide](https://docs.nvidia.com/nemo/megatron-bridge/0.2.0/parallelisms.html)（最全的 TP/PP/SP/CP/EP 解释）

---

## 五、rollout（不是工具，是 RL 概念）

### 一句话定位
**让 actor（策略）跟环境互动一段时间，收集出 `(state, action, reward, next_state)` 轨迹的过程**。RLinf 把它实现为独立的 worker 组。

### 解决什么问题
强化学习的训练数据**不是预先给定的数据集**，是 actor 用**当前权重**实时生成的：

```
当前策略 π_θ ──▶ rollout（生成一批轨迹）──▶ 计算 reward/advantage ──▶ 更新 θ ──▶ 新策略 π_θ' ──▶ rollout ──▶ ...
```

每次更新前都要 rollout 一批，所以 rollout 的速度 = RL 的瓶颈之一。

LLM 时代的 rollout = **用当前模型 generate 一批 response**：
- prompt 来自数据集
- response 是 LLM 自回归采样出来的（top-k、temperature 那一套）
- reward 来自 reward model 或规则函数（math 判答案、code 跑测试用例）

### 关键概念
| 名词 | 含义 |
| --- | --- |
| **Rollout** | 一次"展开"——从初始状态 / prompt 出发，跑完一段轨迹 / 生成完整 response。 |
| **Rollout buffer** | 存这批轨迹的容器，给训练循环消费。 |
| **On-policy** | 用最新策略生成的 rollout 训当前策略（PPO/GRPO/Reinforce++ 都属于此）。要求 rollout 频繁更新权重。**详见 [§十一 RL 训练范式](#%E5%8D%81%E4%B8%80rl-%E8%AE%AD%E7%BB%83%E8%8C%83%E5%BC%8Fbc--on-policy--off-policy--%E6%B7%B7%E5%90%88%E6%96%B9%E6%A1%88)**。 |
| **Off-policy** | rollout 来自旧策略 / 别人的策略（SAC / Q-learning / RLPD / HIL-SERL）。**详见 [§十一](#%E5%8D%81%E4%B8%80rl-%E8%AE%AD%E7%BB%83%E8%8C%83%E5%BC%8Fbc--on-policy--off-policy--%E6%B7%B7%E5%90%88%E6%96%B9%E6%A1%88)**。 |
| **Async rollout** | rollout 与训练异步并行（一边生成、一边更新），常配 importance sampling 修正。 |
| **Rollout engine** | 负责高吞吐生成 response 的推理引擎。LLM 场景就是 SGLang / vLLM。 |

### 在 RLinf 中扮演什么角色
- **概念上**：`runner` 主循环里的 "生成阶段"——见 [`rlinf/runners/reasoning_runner.py`](../../rlinf/runners/reasoning_runner.py) `rollout_handle = self.rollout.rollout(...)`。
- **实现上**：rollout 是一个 worker 组，跑在它自己的 GPU/进程上：
  - [`rlinf/workers/rollout/`](../../rlinf/workers/rollout/) 是 rollout worker 包
  - [`rlinf/workers/rollout/server/server_rollout_worker.py`](../../rlinf/workers/rollout/server/server_rollout_worker.py) — server 模式（SGLang/vLLM 起 HTTP server）
  - [`rlinf/workers/rollout/hf/async_huggingface_worker.py`](../../rlinf/workers/rollout/hf/async_huggingface_worker.py) — HF transformers 模式（小模型用）
  - [`rlinf/workers/rollout/vllm/vllm_worker.py`](../../rlinf/workers/rollout/vllm/vllm_worker.py) — vLLM 直接 in-process
- **yaml 里**：`rollout.rollout_backend: sglang` 或 `vllm`；`rollout.gpu_memory_utilization` 决定推理引擎占 GPU 多少；`rollout.tensor_parallel_size` 决定推理 TP 切几张卡。
- **生命周期**：每个 RL step 开始前，actor **同步权重给 rollout**（`self.rollout.sync_model_from_actor()`，[reasoning_runner.py:428](../../rlinf/runners/reasoning_runner.py#L428)），保证 on-policy。

### 常见误解
- **rollout ≠ inference**。inference 是"输入 prompt 输出 response"；rollout 是 RL 训练循环里**为产数据而做的**一批 inference，再加上跟 reward/env/buffer 的协作。
- **rollout 跟 training 不能用同一份权重副本**：actor 在反传时权重在更新中、不一致；rollout 用快照副本，每 step 同步一次。这就是为什么 RL 训练显存压力比 SFT 大——actor 和 rollout 各占一份模型 GPU 副本。RLinf 通过 actor offload 到 CPU + 共享 GPU 的方案省显存（见 [deployment.md](deployment.md) 的 fp16 + 全 offload 配置）。
- **rollout 的吞吐 = RL 整体吞吐的上限**。所以选 SGLang/vLLM 不是为了"省成本"，是真的决定训练速度。

### 进阶阅读
- 经典 RL 入门：[Sutton & Barto - Reinforcement Learning: An Introduction](http://incompleteideas.net/book/the-book-2nd.html) ch.5
- RLHF/PPO 论文：[Schulman et al. - Proximal Policy Optimization (2017)](https://arxiv.org/abs/1707.06347)
- GRPO 论文（DeepSeek-Math）：[Shao et al. - DeepSeekMath (2024)](https://arxiv.org/abs/2402.03300)
- LLM RL 在线训练框架最新综述：搜 "verl"、"OpenRLHF"、"AReaL"、"slime" 这些跟 RLinf 同类的项目

---

## 六、SGLang

### 一句话定位
**LMSYS 出的高性能 LLM 推理服务框架**，独门绝技是 **RadixAttention**——用基数树（radix tree / trie）智能复用 KV cache 前缀。

### 解决什么问题
LLM 推理三大痛：
1. **KV cache 重复算**：多个 request 有共同前缀（system prompt、few-shot、agent 工具描述）也每次重算，浪费。
2. **GPU 空转**：CPU 准备 batch 的时候 GPU 闲着。
3. **结构化输出难**：让模型严格按 JSON schema 输出 → 需要约束解码，朴素实现很慢。

SGLang 在这三方面都领先。

### 关键概念
| 名词 | 含义 |
| --- | --- |
| **RadixAttention** | KV cache 按 token 序列存在 **基数树（radix tree, trie）** 里。新 request 进来走树匹配，已存在的前缀**完全跳过 prefill**，只算后缀。命中率实测 50–99%，吞吐最高提升 6.4×。 |
| **多级前缀共享** | 树状不是一维——A 和 B 共享前 100 token，C 与 A 又共享前 200 token，**都自动共享**。 |
| **Fork-and-branch** | 一个 prompt 采样多个 completion（self-consistency、beam）时，子分支自动共享父节点 KV，**省一份大头**。 |
| **Zero-overhead CPU scheduler** | CPU 准备下一 batch 与 GPU 跑当前 batch 重叠，GPU 利用率接近 100%。 |
| **Cache-aware scheduling** | 按"跟已有缓存匹配前缀长度"排优先级，让大命中先跑。 |
| **PD disaggregation** | Prefill (P) 和 Decode (D) 分到不同节点/GPU 跑（prefill 是 compute-bound，decode 是 memory-bound）。 |
| **结构化输出** | 用压缩有限状态机做 constrained decoding，比 outlines/lm-format-enforcer 快几倍。 |
| **OpenAI-compat API** | 跟 OpenAI / Anthropic / Ollama API 兼容，client 不用改代码。 |

### 在 RLinf 中扮演什么角色
RLinf 的 **rollout 后端二选一**之一：

- [`rlinf/hybrid_engines/sglang/`](../../rlinf/hybrid_engines/sglang/) 整个目录是 SGLang 适配层
  - [`common/sgl_engine.py`](../../rlinf/hybrid_engines/sglang/common/sgl_engine.py) 引擎封装
  - [`common/sgl_scheduler.py`](../../rlinf/hybrid_engines/sglang/common/sgl_scheduler.py) RL 风格的调度
  - [`common/tokenizer_manager.py`](../../rlinf/hybrid_engines/sglang/common/tokenizer_manager.py)、[`detokenizer_manager.py`](../../rlinf/hybrid_engines/sglang/common/detokenizer_manager.py)
- yaml 里 `rollout.rollout_backend: sglang` 启用；`rollout.sglang.attention_backend: triton` / `flashinfer`、`use_torch_compile` 等可调。
- **SGLang 自承是"主流后训练框架的 rollout backend"**：官方 README 明列 "verl、AReaL、slime、Tunix、Miles 等"——RLinf 同属一类。
- 我们 Math 路线启动时日志里那个 `RolloutGroup(rank=0) pid=2441 sglang server_args=ServerArgs(...)` 就是 SGLang 在初始化它内部的 server。

### 常见误解
- **SGLang 不是 SGLang 语言**。早期它是个"Python 嵌入式 DSL"用于结构化生成，**但现在大多数人当它纯 inference engine 用**（OpenAI 兼容 API）。
- **SGLang ≠ vLLM 的全面替代**：SGLang 在前缀共享场景（多轮对话、agent、RAG）远胜 vLLM；纯单 prompt 单 response 时差距不大。
- **RadixAttention 不"自动"省所有内存**——需要 prompt 真有重叠。如果你的 100 个 request 完全没共享 prefix，跟 vLLM 没差别。

### 进阶阅读
- 仓库 + 文档：[sgl-project/sglang](https://github.com/sgl-project/sglang) · [sgl-project.github.io](https://sgl-project.github.io/)
- [SGLang Wikipedia](https://en.wikipedia.org/wiki/SGLang)
- 实战 deep-dive：[Inside SGLang: Anatomy of a High-Performance Structured LLM Inference System](https://blog.sugiv.fyi/inside-sglang-anatomy-high-performance-structured-llm-inference-system)
- [SGLang in Production: Structured Generation, RadixAttention, and Multi-Step LLM Pipelines](https://www.runpod.io/articles/guides/blog-sglang-production-llm-pipelines)

---

## 七、vLLM

### 一句话定位
**UC Berkeley Sky Computing Lab 出的高吞吐 LLM 推理服务引擎**，独门绝技是 **PagedAttention**——把 KV cache 按"页"管理，借鉴 OS 虚拟内存的思路。

### 解决什么问题
传统 LLM 推理为每个 request 预留**连续大块 KV 显存**：
- 长度未知 → 按最坏情况预留 → 内部碎片严重
- 显存装不下多少并发 request → 吞吐低

PagedAttention 把 KV cache 切成固定大小 block（一般 16 token / 块），逻辑顺序与物理位置解耦，**跟 OS 虚拟内存一个套路**。

### 关键概念
| 名词 | 含义 |
| --- | --- |
| **PagedAttention** | KV cache 按"页"组织，逻辑→物理映射表（block table）管理。不再要求连续显存，碎片消除，最多并发数翻几倍。 |
| **Continuous batching** | 新 request 不用等 batch 跑完就能插队加入。 |
| **Automatic Prefix Caching (APC)** | 类似 SGLang 的 RadixAttention 但是单层（不带分叉），prompt 完全相同前缀复用 KV。 |
| **Chunked prefill** | 长 prompt 的 prefill 切片塞进 decode batch，防止长 prompt 卡住短 prompt 解码。 |
| **CUDA / HIP graphs** | 把推理过程编译成图，省 kernel launch 开销。 |
| **Tensor / Pipeline parallelism** | 多 GPU 推理，跟训练一样切张量/层。 |
| **vLLM V1 engine** | 2025 重写的内部架构（`vllm>=0.6`），默认开启，去掉旧 SamplerOutput 流水线。 |

### 在 RLinf 中扮演什么角色
RLinf 的**另一个 rollout 后端**：

- [`rlinf/hybrid_engines/vllm/vllm_0_8_5/`](../../rlinf/hybrid_engines/vllm/vllm_0_8_5/) 是为 vLLM 0.8.5 写的适配
  - [`weight_loader.py`](../../rlinf/hybrid_engines/vllm/vllm_0_8_5/weight_loader.py) 处理 actor → rollout 的权重同步（不走文件，直接 in-GPU 拷贝/广播）
  - [`worker.py`](../../rlinf/hybrid_engines/vllm/vllm_0_8_5/worker.py) vLLM worker 进程
- [`rlinf/workers/rollout/vllm/vllm_worker.py`](../../rlinf/workers/rollout/vllm/vllm_worker.py) Ray actor 包一层 vLLM
- yaml 里 `rollout.rollout_backend: vllm` 启用；`rollout.vllm.attention_backend: FLASH_ATTN`、`enable_chunked_prefill`、`enable_prefix_caching` 都能调。

### 常见误解
- **vLLM 不是只能服务，也能 in-process embed**——RLinf 用 in-process 模式直接当 Python 模块调。
- **PagedAttention 不解决"前缀共享"**（那是 APC 做的事）——它解决的是"KV cache 显存碎片"。
- **vLLM 的 throughput 优势主要在高并发**——单 request 跟 SGLang 差距不大；100+ 并发时 PagedAttention + continuous batching 的红利才显现。

### 进阶阅读
- 仓库 + 官网：[vllm-project/vllm](https://github.com/vllm-project/vllm) · [docs.vllm.ai](https://docs.vllm.ai/en/latest/)
- 原论文（SOSP'23）：[Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/pdf/2309.06180)
- 实战指南：[vLLM Tutorial 2026: PagedAttention LLM Inference Guide](https://weavai.app/blog/en/2026/04/24/vllm-tutorial-2026-pagedattention-llm-inference-guide/)
- 生产部署：[vLLM Production Deployment: Complete 2026 Guide](https://www.sitepoint.com/vllm-production-deployment-guide-2026/)

---

## 八、SGLang vs vLLM：在 RLinf 里怎么选

两个都是 RLinf 一等公民 rollout 后端，配置切换一行 yaml 就行（`rollout.rollout_backend: sglang | vllm`）。对比如下：

| 维度 | SGLang | vLLM |
| --- | --- | --- |
| **核心 trick** | RadixAttention（前缀共享，树状） | PagedAttention（KV 分页，省碎片） |
| **前缀共享** | ★★★ 多级 + 分叉，命中 50–99% | ★ APC 只单层、不带分叉 |
| **结构化输出** | ★★ 压缩 FSM，业内领先 | ★ outlines/xgrammar |
| **OpenAI API 兼容** | ✅ | ✅ |
| **PD disaggregation** | ✅ 内建 | 试验中 |
| **硬件支持广度** | NVIDIA、AMD、Intel、Ascend、TPU | NVIDIA、AMD、TPU、Gaudi、Spyre、Apple Silicon 等 200+ 模型 |
| **吞吐**（H100，benchmark） | 16k tok/s | 12k tok/s（同条件 SGLang +29%） |
| **生态** | 大模型新发布常 day-0 支持 | 老牌、社区最大、文档最全 |
| **RLinf 适配文件** | [`rlinf/hybrid_engines/sglang/`](../../rlinf/hybrid_engines/sglang/) | [`rlinf/hybrid_engines/vllm/`](../../rlinf/hybrid_engines/vllm/) |

**RL 训练场景下的实际选择**：
- **rollout 的 prompt 大量共享 system prompt / few-shot / 工具描述**（math、agent、code 都属于）→ **优先 SGLang**，吞吐红利明显。
- **prompt 没什么共享**（多 task 完全不同 prompt）→ 两者差距小，看你熟哪个。
- **要支持很多家硬件 / 很奇怪的模型** → **vLLM**，社区最广。
- **要做 PD 分离的大规模异步训练** → **SGLang** 内建更完善。

我们 Math 路线的 [`qwen2.5-1.5b-single-gpu-local.yaml`](../../examples/reasoning/config/math/qwen2.5-1.5b-single-gpu-local.yaml) 默认用 SGLang——因为 math reasoning prompt 都有标准 system prompt 头部，正合 RadixAttention 胃口。

---

## 九、一图看清这七者在 RLinf 里的关系

```
                         ┌───────────────────────────────────────────────────────────────┐
                         │                       Hydra                                    │
                         │  examples/*/config/*.yaml + 命令行覆写 → DictConfig            │
                         └─────────────────────────────┬─────────────────────────────────┘
                                                       │ build_config + validate_cfg
                                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                       Ray                                                 │
│   ray.init() → 起 actor 进程；rlinf/scheduler 把 actor / rollout / reward / env 放到 GPU  │
└──────┬────────────────────────────┬────────────────────────┬────────────────────────────┘
       │                            │                        │
       ▼                            ▼                        ▼
┌─────────────┐            ┌──────────────────┐    ┌───────────────────────────────┐
│ Actor 组    │            │ Rollout 组       │    │ Env / Reward / Buffer ...     │
│ (训练后端)  │ ──同步权重→ │ (rollout 后端)   │    │                               │
│             │            │                  │    │                               │
│ FSDP        │            │ SGLang           │    │ ManiSkill / LIBERO / Gym /    │
│  ‐or‐       │            │  ‐or‐            │    │ math reward / code reward ...  │
│ Megatron-LM │            │ vLLM             │    │                               │
└─────────────┘            └──────────────────┘    └───────────────────────────────┘
   反传/优化器                  生成 response                 计算 reward / 提供数据
       ▲                            │                        │
       │                            ▼                        ▼
       │                       ┌──────────────────────────────────────────┐
       └───────── advantage ◀──│  rollout buffer + advantage computation  │
                               └──────────────────────────────────────────┘
                                            ▲
                                            │
                                       这一圈就是 "rollout" 概念
```

**一句话总结**：
- **Hydra** 决定要跑什么实验
- **Ray** 把这个实验拆成进程跑在多卡上
- **FSDP / Megatron** 让大模型训得起
- **SGLang / vLLM** 让大模型生成得快
- **rollout** 是 RL 循环里的"生成阶段"，靠后两者实现

---

## 十、RL 数学符号速查（看公式用）

> 后面 §十一 RL 训练范式、PPO/GRPO/SAC 论文、HIL-SERL 论文都用这套符号。这一节是工具箱，不读公式可以跳过。

### 策略相关

| 符号 | 读法 | 含义 | 代码里通常是 |
| --- | --- | --- | --- |
| **π** | "pi" | **policy（策略）**：state → action 的函数 | `class Policy(nn.Module)` 这个网络本身 |
| **θ** | "theta" | **parameters（参数）**：在深度 RL 里就是神经网络全部权重 | `policy.parameters()` |
| **π_θ** | "pi-theta" | 用参数 θ 实例化的策略——**当前神经网络** | `policy = Policy()` 这个实例 |
| **π_θ(a\|s)** | "pi-theta of a given s" | 在 state s 下采取 action a 的**概率**（连续动作是概率密度） | `policy(state)[a]` 或 `policy(state).log_prob(a).exp()` |
| **π_θ_old** | "pi-theta-old" | 上一次 rollout 用的策略（PPO 用它当基准） | rollout 时拷贝下来的 policy 副本 |
| **π_β** | "pi-beta" | **behavior policy（行为策略）**：采集数据的那个策略，**off-policy 才有的区别** | replay buffer 里数据来自的那个旧 policy |
| **π_E** | "pi-E" / "expert" | 专家策略（BC / DAgger 的人类老师） | 人类录的演示 |
| **π*** | "pi-star" | 最优策略（理论极限） | 训练目标，但实际拿不到 |

### Markov Decision Process (MDP) 基本量

| 符号 | 含义 |
| --- | --- |
| **s**, **s'** | state（当前 / 下一个）。LLM 里 = prompt + 已生成 token 前缀 |
| **a** | action。LLM 里 = 下一个要生成的 token；机器人里 = 末端速度/关节角 |
| **r** 或 **r(s, a)** | reward。一步即时奖励 |
| **γ** | gamma，discount factor（折扣率），通常 0.99 |
| **τ** | tau，**trajectory（轨迹）**：(s_0, a_0, r_0, s_1, a_1, r_1, …) 一整段 |

### 回报与价值函数

| 符号 | 公式 | 含义 |
| --- | --- | --- |
| **G_t** 或 **R_t** | `r_t + γr_{t+1} + γ²r_{t+2} + …` | **return（回报）**：从 t 时刻开始的折扣总奖励 |
| **V^π(s)** | `𝔼_{π}[G_t \| s_t = s]` | **state-value**：在策略 π 下从 s 出发的期望 return |
| **Q^π(s, a)** | `𝔼_{π}[G_t \| s_t = s, a_t = a]` | **action-value (Q 函数)**：先在 s 执行 a，之后跟 π，期望 return |
| **A^π(s, a)** | `Q^π(s, a) - V^π(s)` | **advantage**："这个动作比平均好多少"——actor 学的就是它 |

### 学习信号常见构造

| 符号 / 写法 | 含义 |
| --- | --- |
| **𝔼** | expectation（期望）。`𝔼_{π}[X]` = "X 在 π 诱导的轨迹分布上的均值" |
| **∇_θ** | 对 θ 求梯度。`∇_θ log π_θ(a\|s)` = 改 θ 让"在 s 选 a"概率上升的方向 |
| **log π_θ(a\|s)** | log 概率，**policy gradient 公式的核心**：`∇J(θ) = 𝔼[∇_θ log π_θ(a\|s) · A]` |
| **r_t(θ)** = `π_θ(a_t\|s_t) / π_θ_old(a_t\|s_t)` | **importance ratio**（重要性比值）。PPO 的 clip 就在这上面卡 |
| **D_KL(π_θ \|\| π_ref)** | KL 散度，"新策略离参考策略多远"。GRPO、RLHF 里用作正则项 |
| **α** | entropy 系数（SAC `r + α H(π)` 里那个 α） / 或 learning rate / 或 reward 系数（看上下文） |
| **β** | KL 系数（RLHF 里 KL penalty 那个 β） / 或 GAE 的 λ（写法多） |

### 在 RLinf 代码里对照

| 概念 | RLinf 字段 |
| --- | --- |
| π_θ 的网络权重 θ | `actor.model.*`（model_path 加载权重） |
| π_θ_old 的快照 | rollout worker 持有的权重副本（每 step `sync_model_from_actor` 同步） |
| γ | `algorithm.gamma`（GAE 用） |
| GAE λ | `algorithm.lam` |
| importance ratio clip ε | `algorithm.ratio_clip_eps`（PPO/GRPO 的 0.2） |
| KL 系数 β | `algorithm.kl_beta` |
| Q 函数 | SAC config 里的 critic 网络（actor_critic loss 的 value head） |
| advantage | `algorithm.adv_type` 选 `gae` / `grpo` / `reinpp` 算出来的张量 |
| 损失 `L(θ)` 的对 θ 反传 | `loss.backward()` → optimizer.step()，FSDP/Megatron 自动分片 |

### 看公式的小窍门

- 看到 `π_θ` 想"**当前网络**"，看到 `π_θ_old` 想"**rollout 时那一份快照**"。
- 看到下标 `t` 想"**轨迹中的时间步**"，下标 `θ` 想"**关于参数 θ**"。
- 看到 `𝔼_{τ ~ π_θ}[…]` 想"**在 π_θ 跑出来的所有轨迹上求平均**"——实际就是 batch mean。
- 看到 `argmax_a Q(s, a)` 想"**选 Q 最高的动作**"——这是 Q-learning 的 greedy policy 提取。
- 看到 `∇_θ` 想"**这个东西要被反传**"。

---

## 十一、RL 训练范式：BC / on-policy / off-policy / 混合方案

> 本节是回到「**算法是怎么从数据里学的**」这层的全景图。前 §一-§九 关心"工程怎么做"；这一节关心"学习信号从哪来"。
>
> 用这节回答：BC 是什么、on-policy 与 off-policy 到底差在哪、HIL-SERL / RLHF / GRPO / SAC 分别属于哪一类、RLinf 都实现了哪些。

### 〇、一张图先定坐标轴

```
                                 数据从哪来
                          ┌─────────────────────┐
                          │  当前 π_θ 现采的    │  ◀─── on-policy
              是 RL ──────┤                     │
              （有 reward）│  任意来源的旧数据   │  ◀─── off-policy
                          │（演示/历史/介入）    │
                          └─────────────────────┘
                                  │
                                  │
            不是 RL ───── 监督学习 (state, action) 配对
            （没 reward）       │
                                ├──── BC          （单次拟合演示）
                                └──── DAgger 家族 （迭代拟合，含 HG-DAgger）
```

四个区分轴：
- **有没有 reward** —— 没有 reward 的"模仿型"全是监督（BC / DAgger）。
- **数据来源** —— on-policy 必须自己当前策略产，off-policy 可以来自任何地方。
- **要不要环境交互** —— 完全不交互叫 **offline RL**（IQL 等），用固定数据集。
- **是否人在回路** —— 跟前三轴正交，DAgger / HIL-SERL / RLHF 都是"人在回路"，但所属范式不同。

### 一、BC（Behavior Cloning，行为克隆）

#### 一句话定位
**把 (state, action) 当成 (input, label) 用监督学习训一个 policy**——这就是 RL 圈对监督学习的称呼。

#### 损失函数
- 离散动作（语言模型 next-token）：`cross_entropy(policy(s), a_expert)`
- 连续动作（机器人末端速度）：`MSE(policy(s), a_expert)` 或 NLL 拟合高斯
- 这就是普通的监督训练，**完全没用到环境 reward**。

#### 优点
- 简单、稳，跟训分类器一样
- 不需要环境交互，不需要 reward 函数
- 跟 SFT (Supervised Fine-Tuning) 本质同源——LLM 的 SFT 阶段就是 BC

#### 致命缺点：covariate shift（分布偏移）
- 训练时 state 分布 = 专家走过的 state
- 部署时 state 分布 = **模型自己走出来的** state——偶尔出错就跑到训练分布外
- 跑到训练分布外 → 模型预测不可靠 → 错更多 → 更偏 → 越走越离谱
- 这是 BC 的根本缺陷，**DAgger 就是为修这个而生**

#### 在 RLinf 里
- [`examples/sft/`](../../examples/sft/) 整个目录 = **BC for VLA**（`train_vla_sft.py`、`train_vlm_sft.py`）
- 任何 SFT checkpoint（包括我们 deployment 用的 DeepSeek-R1-Distill-Qwen-1.5B）都是 BC 产物（在 R1 的 CoT 输出上 BC）
- VLA 训练通用流程：**BC 预训练（SFT）→ RL 微调（PPO/GRPO/SAC）**

#### 常见误解
- **BC 不是 RL** —— 严格说它是监督学习，只是因为输出空间是"动作"才被 RL 圈关心。
- **BC 不需要 reward** —— 这同时是它的优点（不用设计 reward）和缺点（无法超越专家）。
- **BC 的"专家"也可以是模型** —— LLM 的 distillation（教师模型生成数据，学生 BC 学）本质也是 BC。

### 二、DAgger 家族（BC 的迭代版，仍属监督）

- **DAgger (Dataset Aggregation, Ross 2011)**：
  - 让 student 在环境里跑（用当前 student policy）
  - 遇到新 state → 问 expert "你会怎么做"
  - 把这些 (state, expert_action) 加进数据集
  - 重新 BC，循环
  - **修了 covariate shift**：student 自己走出来的 state 全有 label。
- **HG-DAgger (Human-Gated DAgger)**：人不全程标注，只在觉得"危险/错误"时介入并标注。**HIL 但**不是** RL**。
- **在 RLinf 里**：
  - [`rlinf/workers/actor/fsdp_dagger_policy_worker.py`](../../rlinf/workers/actor/fsdp_dagger_policy_worker.py)、`async_fsdp_dagger_policy_worker.py`
  - 配置 [`maniskill_dagger_mlp.yaml`](../../examples/embodiment/config/maniskill_dagger_mlp.yaml)、[`libero_spatial_dagger_openpi.yaml`](../../examples/embodiment/config/libero_spatial_dagger_openpi.yaml)、[`realworld_pnp_dagger_openpi.yaml`](../../examples/embodiment/config/realworld_pnp_dagger_openpi.yaml)
  - 示例文档 [`docs/source-en/rst_source/examples/embodied/{dagger,hg-dagger}.rst`](../source-en/rst_source/examples/embodied/dagger.rst)

### 三、On-policy RL

#### 一句话定位
**训练数据必须来自当前策略 π_θ 自己产**。每次更新前都要让 π_θ 现 rollout 一批。

#### 为什么"必须"
On-policy 损失里有个 **importance ratio** `π_θ(a|s) / π_θ_old(a|s)`：
- PPO 的 clip：`min( ratio * adv, clip(ratio, 1-ε, 1+ε) * adv )`
- 这个 ratio 只有在 `π_θ ≈ π_θ_old` 时（即数据足够新鲜）才数值上有意义
- 一旦 ratio 偏离 1 太远（数据过时），PPO 就 clip 掉，梯度变 0 → **过期数据**学不动

#### 代表算法
- **REINFORCE**：直接用 policy gradient，最朴素
- **A2C / A3C**：加 advantage，多 worker 并行
- **PPO (Proximal Policy Optimization)**：clip ratio 保证稳定，业界主力
- **GRPO (Group Relative Policy Optimization)**：DeepSeek-Math 提的简化版 PPO，**用同 prompt 多 sample 的 reward 相对值代替 critic**，省一个 value model
- **Reinforce++**：REINFORCE 的工程改良版

#### 数据生命周期
```
[t=1]  当前权重 θ_1 ──rollout──▶ 一批新数据 D_1
                                 │
                                 ▼
                              用 D_1 训几步 → 权重变 θ_2
                                 │
                                 ▼
                              D_1 立即作废（不再 on-policy）

[t=2]  当前权重 θ_2 ──rollout──▶ 一批新数据 D_2
                                 │ ...
```

**数据用完即弃**——这就是为什么 on-policy RL 的 rollout 速度 = 训练速度的天花板。SGLang/vLLM 就是为让这一步快才存在。

#### 优缺点
| 优点 | 缺点 |
| --- | --- |
| 训练稳定（数据始终新鲜，理论保证好） | 数据效率极低（一批数据可能就用 1-4 步就丢） |
| reward 信号灵活（任何 reward 函数都行） | rollout 慢 → 训练慢 |
| Critic / advantage 容易设计 | 真机 rollout 极贵的场景不实用 |

#### 在 RLinf 里
- 损失：[`rlinf/algorithms/losses.py`](../../rlinf/algorithms/losses.py) 注册 `actor_critic` (PPO)、`actor` (GRPO)、`decoupled_actor_critic`
- Advantage：[`rlinf/algorithms/advantages.py`](../../rlinf/algorithms/advantages.py) 注册 `gae`、`grpo`、`grpo_dynamic`、`reinpp`、`raw`
- yaml `algorithm.loss_type` + `algorithm.adv_type` 选
- 典型 config：所有 `examples/reasoning/config/math/*.yaml`、`maniskill_ppo_*.yaml`、`libero_*_grpo_*.yaml`

### 四、Off-policy RL

#### 一句话定位
**训练数据可以来自任何策略**（历史的当前的、人类演示的、随机的）。通过学一个 **Q 函数** 来评判"任意 state-action 的价值"，与生成数据的策略无关。

#### 核心机制
- 维护一个 **replay buffer**（容量百万级 transitions）
- 每步把新 transition 塞进 buffer
- 每步从 buffer 里 **随机采** 一个 batch（可能是几个 episode 之前的旧数据）
- 用 Bellman 方程更新 Q：`Q(s, a) ← r + γ * max Q(s', a')`（DQN）或 `r + γ * E[Q(s', a') - α log π(a'|s')]`（SAC）
- 策略 π 通过 Q 来改进：选 Q 高的 action

#### 代表算法
- **Q-learning / DQN**：离散动作，学 Q 表 / Q 网络
- **DDPG / TD3**：连续动作，加确定性 policy
- **SAC (Soft Actor-Critic)**：连续动作的事实标准。加了 entropy 项鼓励探索 (`r + α H(π)`)
- **RLPD (Reinforcement Learning with Prior Data, Ball 2023)**：SAC + 三个改造（高 UTD、demo+replay 50/50 混采、critic LayerNorm）。HIL-SERL 用的就是这个。

#### 数据生命周期
```
buffer:  [..., transition_old1, ..., transition_recent, ...]
              ▲                                              ▲
              │                                              │
              │           随机采 batch                       │
              ▼                                              │
        训练 step  ─────────────────────────────────────────│
              │                                              │
              ▼                                              │
        新 transition ─────────────────────────────────────▶│
```

**一份数据可被反复采** —— 数据效率 vs on-policy 高几个数量级。

#### 优缺点
| 优点 | 缺点 |
| --- | --- |
| 数据效率高（一批数据用千万次） | 不稳定（"the deadly triad"：function approximation + bootstrapping + off-policy 容易爆 Q） |
| 真机 rollout 极慢也能跑 | reward 必须设计得合理，否则 Q 学不出来 |
| 自然接纳演示 / 介入数据 | 超参敏感（UTD ratio、target update freq、entropy 系数等） |

#### 在 RLinf 里
- [`rlinf/workers/actor/fsdp_sac_policy_worker.py`](../../rlinf/workers/actor/fsdp_sac_policy_worker.py) (sync) + [`async_fsdp_sac_policy_worker.py`](../../rlinf/workers/actor/async_fsdp_sac_policy_worker.py) (async)
- replay buffer：[`rlinf/data/embodied_buffer_dataset.py`](../../rlinf/data/embodied_buffer_dataset.py)、[`rlinf/data/replay_buffer.py`](../../rlinf/data/replay_buffer.py)
- 典型 config：`examples/embodiment/config/` 下所有 `*_sac_*.yaml`、`*_rlpd_*.yaml`、`*_crossq_*.yaml`
- **RLPD（即 SAC + demo buffer 混采，HIL-SERL 的核心范式）**：[`realworld_peginsertion_rlpd_cnn_async.yaml`](../../examples/embodiment/config/realworld_peginsertion_rlpd_cnn_async.yaml) 等，配置 `actor: 4090 节点` + `env: franka 节点` 双节点异步训练

### 五、Offline RL（off-policy 的特殊情形：完全不交互）

- **定义**：完全不与环境交互，只从**固定数据集**学策略。比 off-policy 还激进。
- **挑战**：数据外的 state-action 上 Q 函数估值不可靠，会"幻觉"出一个过度乐观的策略，部署时翻车。
- **代表算法**：BCQ、CQL、**IQL (Implicit Q-Learning)**、Decision Transformer。
- **在 RLinf 里**：
  - [`rlinf/runners/offline_runner.py`](../../rlinf/runners/offline_runner.py)
  - 配置 [`d4rl_iql_antmaze.yaml`](../../examples/embodiment/config/d4rl_iql_antmaze.yaml)、[`d4rl_iql_kitchen_adroit.yaml`](../../examples/embodiment/config/d4rl_iql_kitchen_adroit.yaml)、[`d4rl_iql_mujoco.yaml`](../../examples/embodiment/config/d4rl_iql_mujoco.yaml) —— 用 D4RL benchmark 跑 IQL
  - 示例文档 [`iql_d4rl.rst`](../source-en/rst_source/examples/embodied/iql_d4rl.rst)

### 六、混合方案（业界最常用）

#### RLHF (Reinforcement Learning from Human Feedback)
ChatGPT/Claude 类 LLM 的训练流程，**三阶段**：
1. **SFT (BC)**：先在人类示范的对话数据上 BC，得到合格的 base policy
2. **Reward Model**：人给一对 response 打偏好，训一个 RM 预测 "哪个更好"
3. **PPO (on-policy RL)**：用 RM 当 reward 函数，PPO 优化 policy

→ 所以 RLHF 是 BC + 监督 RM + on-policy RL 的拼装。

#### DPO (Direct Preference Optimization)
- 跳过显式 RM 和 PPO，直接用偏好对 (chosen, rejected) 做监督
- 在数学上等价于 RLHF 的某种简化，**但本质是监督学习**
- 比 RLHF 简单稳，工业界 fine-tune 越来越多用 DPO

#### HIL-SERL（参考 [HIL-SERL 答疑](#)）
- **off-policy RL**（SAC + RLPD）+ **三个 buffer 混采**（demo / replay / intervention）+ 真机 RL
- 关键 trick：人类介入数据**不当 BC 学**（HG-DAgger 那样），而是当 transitions 喂给 Q 函数 → 可能超过人类

#### GRPO + RL on top of SFT（DeepSeek-R1 风格）
- 先 SFT 得到一个会做 CoT 的模型
- 用 GRPO（on-policy）在 math / code 上继续 RL，提升 reasoning
- **我们 deployment 用的 DeepSeek-R1-Distill-Qwen-1.5B + AReaL-boba + GRPO 就是这条路线**

### 七、在 RLinf 里的对照速查

| 范式 | 代表算法 | RLinf 入口 | 典型 config |
| --- | --- | --- | --- |
| **BC (SFT)** | cross-entropy / MSE on (state, action) | [`examples/sft/{train_vla_sft.py,train_vlm_sft.py}`](../../examples/sft/) | `examples/sft/config/` |
| **DAgger** | 迭代 BC + 当前 policy 采样 + expert 标注 | [`rlinf/workers/actor/{fsdp,async_fsdp}_dagger_policy_worker.py`](../../rlinf/workers/actor/) | `maniskill_dagger_mlp.yaml`、`libero_spatial_dagger_openpi.yaml` |
| **On-policy RL** | PPO / GRPO / Reinforce++ | [`rlinf/algorithms/{losses,advantages}.py`](../../rlinf/algorithms/) 注册表 | `examples/reasoning/config/math/*.yaml`、`maniskill_ppo_*.yaml`、`libero_*_grpo_*.yaml` |
| **Off-policy RL** | SAC / CrossQ / **RLPD** | [`rlinf/workers/actor/{fsdp,async_fsdp}_sac_policy_worker.py`](../../rlinf/workers/actor/) | `*_sac_*.yaml`、`*_rlpd_*.yaml`、`maniskill_crossq_mlp.yaml` |
| **Offline RL** | IQL | [`rlinf/runners/offline_runner.py`](../../rlinf/runners/offline_runner.py) | `d4rl_iql_*.yaml` |
| **RLHF / 偏好** | PPO with RM、DPO | 通过 `algorithm.loss_type=actor_critic` + reward model | （reasoning + reward model 自定义） |
| **HIL-SERL（待补齐）** | SAC + RLPD + 人类介入 buffer | 现有 SAC worker + `SpacemouseIntervention` + `demo_buffer`，**缺独立 intervention_buffer 与混采分流** | `realworld_*_rlpd_cnn_async.yaml` 系列已部分实现 |

### 八、怎么选

| 你的场景 | 推荐范式 |
| --- | --- |
| 有大量专家示范，不需要超越，不想搞 reward 函数 | **BC (SFT)** |
| BC 部署时遇到分布偏移而失败 | 升级到 **DAgger / HG-DAgger** |
| 有 reward 函数 + rollout 便宜（仿真器） | **on-policy RL（PPO/GRPO）** |
| 有 reward 函数 + rollout 贵（真机） + 有少量演示 | **off-policy RL（SAC + RLPD 风格演示混采）** |
| 完全没法跟环境交互，只有 logged 数据 | **offline RL（IQL）** |
| 大语言模型对齐 | **RLHF (SFT + RM + PPO)** 或 **DPO** |
| 机器人真机训练 + 人类可介入 | **HIL-SERL (off-policy RL + 三 buffer)** |
| LLM CoT/Math reasoning 提升 | **GRPO on top of SFT'd model** |

### 九、常见误解

- **"on-policy 数据可以稍微旧一点也行" —— 错。** 一旦数据过时，PPO 的 clip 让梯度归零，实际就是没在学。
- **"off-policy 比 on-policy 好，因为数据效率高" —— 不对。** off-policy 的"高数据效率"以"训练不稳定 + 超参极敏感"为代价。LLM RL 现在主流仍是 on-policy（PPO/GRPO），因为 reward signal 稀疏 + 模型大、训练稳定性优先。
- **"BC 比 RL 简单所以更好" —— 看场景。** BC 上限就是专家水平，且 covariate shift 严重；如果任务真需要超越示范，必须上 RL。
- **"DAgger 是 RL" —— 不是。** DAgger 仍是监督学习（每步问 expert，仍是用 expert action 做 label），只是 state 分布来自 student。
- **"HIL-SERL 是 on-policy（因为'human-in-the-loop'听起来很 online）" —— 错。** HIL-SERL 是 **off-policy**（SAC + RLPD 底层），人类介入数据反而**正是**因为 off-policy 才能直接喂进 buffer 训练。

### 十、进阶阅读

- 教科书：[Sutton & Barto - Reinforcement Learning: An Introduction (2nd)](http://incompleteideas.net/book/the-book-2nd.html) ch.5（蒙特卡洛/on-policy/off-policy 的概念奠基）
- BC + DAgger：[Ross et al. - A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning (AISTATS 2011)](https://arxiv.org/abs/1011.0686)
- PPO：[Schulman et al. - Proximal Policy Optimization (2017)](https://arxiv.org/abs/1707.06347)
- GRPO：[Shao et al. - DeepSeekMath (2024)](https://arxiv.org/abs/2402.03300)
- SAC：[Haarnoja et al. - Soft Actor-Critic (2018)](https://arxiv.org/abs/1801.01290)
- RLPD：[Ball et al. - Efficient Online Reinforcement Learning with Offline Data (ICML 2023)](https://arxiv.org/abs/2302.02948)
- IQL：[Kostrikov et al. - Offline RL with Implicit Q-Learning (ICLR 2022)](https://arxiv.org/abs/2110.06169)
- DPO：[Rafailov et al. - DPO (2023)](https://arxiv.org/abs/2305.18290)
- HIL-SERL：[Luo et al. - Precise and Dexterous Robotic Manipulation via HIL-RL (2024)](https://hil-serl.github.io/static/hil-serl-paper.pdf)
- 综述（offline RL）：[Levine et al. - Offline RL: Tutorial Review (2020)](https://arxiv.org/abs/2005.01643)

---

## 十二、不在本文范围但相关的术语

为了不喧宾夺主，下面这些只列定位，需要再展开告诉我：

| 术语 | 一句话 |
| --- | --- |
| **NCCL** | NVIDIA Collective Communications Library，GPU 间 all-reduce / all-gather 等通信原语。FSDP / Megatron / SGLang / vLLM 跨 GPU 都靠它。 |
| **DDP** | PyTorch `DistributedDataParallel`，最朴素的数据并行，每卡复制完整模型。FSDP 是它的"分片版"。 |
| **DeepSpeed / ZeRO** | Microsoft 出的，FSDP 的对家。ZeRO-1/2/3 跟 FSDP 的三种 sharding 一一对应。 |
| **TRT-LLM** | NVIDIA TensorRT-LLM，闭源高性能推理引擎，比 vLLM/SGLang 快但黑盒、绑 NVIDIA。 |
| **PPO / GRPO / DPO / RLHF / SAC / RLPD / IQL** | 各种 RL 算法。展开见 [§十一 RL 训练范式](#%E5%8D%81%E4%B8%80rl-%E8%AE%AD%E7%BB%83%E8%8C%83%E5%BC%8Fbc--on-policy--off-policy--%E6%B7%B7%E5%90%88%E6%96%B9%E6%A1%88)。 |
| **OpenVLA / OpenPI / GR00T** | 三款主流 VLA 模型，embodied RL 训练对象。 |
| **MuJoCo / EGL / ManiSkill** | 仿真器与渲染后端，embodied 训练栈底层。 |
