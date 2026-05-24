# RLinf 部署指南（Ubuntu + Docker）

> 适用：在 Ubuntu 机器（物理机或虚拟机）上**部署** RLinf 官方 Docker 镜像、把训练所需的模型 + 数据集 + 配置都准备到「按下回车就能开训」的状态。最终部署目标是**真机 Ubuntu**。
>
> **本文档只覆盖部署**。是否真的启动训练、训练能不能跑得动，见 [§⚠️ 训练前必须再确认](#-训练前必须再确认) 一节。
>
> RLinf 镜像分两条路线，本文都覆盖：
> - **Math（reasoning）路线** — §三 ~ §九，Math 路线已实测可复现到容器 ready 状态。
> - **Embodied 路线** — §十一，依据 RLinf 官方 [installation.rst](../source-en/rst_source/start/installation.rst) + [vla.rst](../source-en/rst_source/start/vla.rst) + Dockerfile / 镜像 recon 整理。
>
> §一 / §二 / §六（部分） / §⚠️ 是两条路线共用的前置与红线。
>
> 初次编写：2026-05-23。

## 〇、硬件与软件基线（按实际机器调整）

| 项 | 最低要求 | 备注 |
| --- | --- | --- |
| GPU | NVIDIA GPU，8 GB+ VRAM | 7B VLA 需 24 GB+；小策略 MLP/CNN 8 GB 可用 |
| Driver / CUDA | NVIDIA Driver 535+，CUDA 12.4+ | `nvidia-smi` 可见 |
| RAM | **24 GB+** 物理内存 | Megatron + SGLang 初始化峰值 18–25 GB |
| 磁盘 | 50 GB+ 可用空间 | 镜像 21–35 GB + 模型 + checkpoint |
| OS | Ubuntu 22.04 / 24.04 | 推荐真机 Ubuntu；Docker 需 NVIDIA Container Toolkit |
| Docker | 20.10+，`nvidia` runtime 已注册 | `docker info | grep -i runtimes` 应含 `nvidia` |
| 网络 | 能访问 Docker Hub + HuggingFace | 大陆网络需代理，见 §二 |

## 一、部署前置检查（**先做完再往下走，否则白搭**）

### 1. 系统内存

```bash
free -h
```

至少要有 **24 GB+ 物理内存**。Megatron + SGLang 同 GPU 共存初始化时，CPU 端峰值会到 18–25 GB。

### 2. 磁盘可用空间

```bash
df -h /var/lib/docker /home
```

Docker 镜像 + 训练中间产物 + checkpoint 需要 **50 GB+ 可用空间**。如果磁盘快满了，训练写中间数据时会导致容器崩溃。

### 3. Docker GPU 支持

```bash
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```

看到你的 NVIDIA GPU 即通。`docker info | grep -i runtimes` 应显示 `nvidia`。

### 4. 代理可达性

```bash
# 你的代理监听端口
curl -sI --max-time 10 https://huggingface.co | head -3       # 200 即通
curl -sI --max-time 10 https://registry-1.docker.io/v2/ | head -3   # 401 即通（unauth 正常）
```

环境变量必须有 `HTTPS_PROXY` 和 `HTTP_PROXY`（注意 `HTTPS_PR0XY` 的 0 是数字，**经常被打错**）。

## 二、让 dockerd 走代理（**绕不开的一步**）

公共 CN docker mirror（`docker.1ms.run` / `docker.m.daocloud.io` / `docker.1panel.live` / `mirror.ccs.tencentyun.com` 都试过）要么把 RLinf 镜像挡在白名单外，要么连接不稳定。**唯一稳定路径是让 dockerd 走你已经能用的 HTTP 代理直连 Docker Hub**。

dockerd 是 systemd 服务，**不读** user shell 的 `HTTPS_PROXY`。必须用 systemd drop-in：

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d

sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf <<'EOF'
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:7897"
Environment="HTTPS_PROXY=http://127.0.0.1:7897"
Environment="NO_PROXY=localhost,127.0.0.1,::1"
EOF

sudo systemctl daemon-reload && sudo systemctl restart docker
```

验证：

```bash
docker info | grep -i proxy
# 应看到：
#  HTTP Proxy: http://127.0.0.1:7897
#  HTTPS Proxy: http://127.0.0.1:7897
#  No Proxy: localhost,127.0.0.1
```

**回滚**：`sudo rm /etc/systemd/system/docker.service.d/http-proxy.conf && sudo systemctl daemon-reload && sudo systemctl restart docker`。

## 三、拉镜像（**Math 路线**）

> Embodied 路线的镜像看 [§十一.1](#%E5%8D%81%E4%B8%80math-%E8%B7%AF%E7%BA%BFembodied-%E8%B7%AF%E7%BA%BF%E5%85%A8%E6%B5%81%E7%A8%8B%E6%9C%AA%E5%9C%A8%E6%9C%AC%E6%9C%BA%E5%AE%9E%E6%B5%8B)。

```bash
docker pull rlinf/rlinf:math-rlinf0.2-torch2.6.0-sglang0.4.6.post5-vllm0.8.5-megatron0.13.0-te2.1
```

镜像 ~21 GB。走代理实测 72 MB/s，~4 分钟。

期间监控（另起 shell）：

```bash
# layer 进度
docker images | grep rlinf
```

## 四、准备 host 侧资产目录（**Math 路线**）

模型、数据集存到 host，**不要放进容器或 RLinf 仓库里**（避免被 git/rebuild 误删，也方便复用）：

```bash
mkdir -p /home/ubuntu/rlinf-assets/{models,datasets}
```

### 4.1 下载模型（DeepSeek-R1-Distill-Qwen-1.5B，3.4 GB）

```bash
# 修 hf cli 权限（如果是 pip 装的，二进制可能没 +x）
chmod +x ~/.local/bin/hf ~/.local/bin/huggingface-cli

# 直接下，走你环境里的 HTTPS_PROXY（**不要**加 HF_ENDPOINT=hf-mirror.com，实测不生效且会回落 huggingface.co）
hf download deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B \
  --local-dir /home/ubuntu/rlinf-assets/models/DeepSeek-R1-Distill-Qwen-1.5B
```

### 4.2 下载数据集（AReaL-boba，73 MB）

```bash
# 多并发会被代理限流，加 --max-workers 2
hf download inclusionAI/AReaL-boba-Data --repo-type=dataset \
  --local-dir /home/ubuntu/rlinf-assets/datasets/boba --max-workers 2
```

## 五、改 YAML（**Math 路线**，保留官方原 config，做副本）

```bash
cp examples/reasoning/config/math/qwen2.5-1.5b-single-gpu.yaml \
   examples/reasoning/config/math/qwen2.5-1.5b-single-gpu-local.yaml
```

在新副本里改 **4 处路径** + **1 处 RAM 调优**：

| 行 | 字段 | 改成 |
| --- | --- | --- |
| 88 | `rollout.model.model_path` | `/workspace/assets/models/DeepSeek-R1-Distill-Qwen-1.5B/` |
| 139 | `data.train_data_paths` | `["/workspace/assets/datasets/boba/AReaL-boba-106k.jsonl"]` |
| 140 | `data.val_data_paths` | `["/workspace/assets/datasets/boba/AReaL-boba-106k.jsonl"]` |
| 221 | `actor.tokenizer.tokenizer_model` | `/workspace/assets/models/DeepSeek-R1-Distill-Qwen-1.5B/` |
| 243 | `actor.megatron.ckpt_convertor.process_num` | `2`（原 `16`，16 个并行进程在小 RAM 上会炸） |

> 注：`/workspace/...` 是**容器内**路径，由 §六 的 bind mount 提供。

## 六、起容器（**Math 路线**，detach，留着给后续 exec）

```bash
docker rm -f rlinf-math 2>/dev/null

docker run -d \
  --gpus all \
  --shm-size 4g \
  --net=host \
  -e NVIDIA_DRIVER_CAPABILITIES=all \
  -v /home/ubuntu/RLinf:/workspace/RLinf \
  -v /home/ubuntu/rlinf-assets:/workspace/assets \
  -w /workspace/RLinf \
  --name rlinf-math \
  rlinf/rlinf:math-rlinf0.2-torch2.6.0-sglang0.4.6.post5-vllm0.8.5-megatron0.13.0-te2.1 \
  sleep infinity
```

**关键 flag 解释**：

| flag | 为什么这个值 |
| --- | --- |
| `--shm-size 4g` | 官方文档建议 `100g`。如果你的机器 RAM 充裕（128 GB+），可以给更大值（如 `32g`）。Ray object store / NCCL 用 shm，单 GPU 时 4 G 够用。 |
| `--net=host` | Ray dashboard / SGLang 端口都在 127.0.0.1 上，host 网络省去端口映射。 |
| `-e NVIDIA_DRIVER_CAPABILITIES=all` | 让容器内能调用渲染等扩展能力（embodied 训练需要，math 用不上但加着没坏处）。 |
| 不挂 `/root` 和 `/opt` | 官方文档强调**不要覆盖**这两个目录，里面是 venv 和 asset。 |
| `sleep infinity` | 容器进程级保持运行，后续 `docker exec` 进去；不用每次 `docker run`。 |

## 七、容器内一次性 setup（**Math 路线**）

```bash
docker exec rlinf-math bash -c '
# 1) 修脚本期望的 Megatron 路径（脚本硬编码 /opt/Megatron-LM，但镜像里在 /opt/venv/reason/）
ln -sf /opt/venv/reason/Megatron-LM /opt/Megatron-LM

# 2) 激活 reason venv（python / ray / sglang / megatron 都在这里）
source switch_env reason
which python ray
python --version
'
```

**镜像内部布局参考**（不用动，记一下方便排错）：

| 路径 | 是什么 |
| --- | --- |
| `/opt/venv/reason/` | 数学推理任务的 Python 3.11 venv |
| `/opt/venv/reason/Megatron-LM` | Megatron 源码（路径与官方脚本期望不一致，故 §七 软链） |
| `/opt/venv/reason/bin/{python,ray}` | venv 里的 python / ray |
| `/opt/venv/reason/lib/python3.11/site-packages/sglang` | SGLang |
| `/usr/local/bin/switch_env` | 切 venv 的脚本（`source switch_env <name>`） |
| `/root/`, `/opt/nvidia/` | 别动 |

## 八、验证部署完成（**Math 路线，不启动训练**）

```bash
docker exec rlinf-math bash -c '
source switch_env reason
echo "=== GPU ==="; nvidia-smi --query-gpu=name,memory.used,memory.free --format=csv | head -2
echo "=== venv ==="; python --version; ray --version
echo "=== mounts ==="
ls /workspace/RLinf | head -3
ls /workspace/assets/models/DeepSeek-R1-Distill-Qwen-1.5B/ | head -3
ls /workspace/assets/datasets/boba/ | head -3
echo "=== local yaml ==="
grep -E "model_path:|train_data_paths|tokenizer_model|process_num" \
  /workspace/RLinf/examples/reasoning/config/math/qwen2.5-1.5b-single-gpu-local.yaml
'
```

预期输出：GPU 名称对、Python 3.11.14、Ray 2.47.1、三个挂载目录都列出文件、yaml 里 4 处路径都是 `/workspace/...` 开头、`process_num: 2`。

到这里**部署就完成了**。

## 九、容器日常生命周期（两条路线通用）

```bash
# 暂停（保留状态）
docker stop rlinf-math

# 恢复（保留容器写过的文件，比如已经做过的 Megatron symlink）
docker start rlinf-math

# 进交互 shell
docker exec -it rlinf-math bash
# 进去后第一件事：source switch_env reason

# 看容器写了多少数据
docker ps -s --filter name=rlinf-math

# 彻底卸了（重新做 §六 §七 即可重建）
docker rm -f rlinf-math
```

## ⚠️ 训练前必须再确认（两条路线通用）

如果你（或未来的我）**真的要按下训练**，**不要直接 `bash examples/reasoning/run_main_grpo_math.sh ...` / `bash examples/embodiment/run_embodiment.sh ...`**，必须先：

1. **再次检查磁盘 free space ≥ 50 GB**（`df -h /var/lib/docker /home`）。训练会写 GB 级中间数据（Math 路线 Megatron checkpoint ~5 GB，Embodied 路线 ManiSkill 仿真缓存 + ckpt 同量级），磁盘满会导致容器崩溃。
2. **把 `runner.output_dir` / 日志目录配到 bind-mounted 的 host 目录**（让 checkpoint / log 落到 host 磁盘，不进容器写层）。
   - Math yaml 默认 `runner.output_dir: ../results` 会落到容器写层。改成 `/workspace/RLinf/results` 即可（host bind mount）。
   - Embodied 用 `run_embodiment.sh` 默认日志写到 `${REPO_PATH}/logs/...` 即 `/workspace/RLinf/logs/...`，已经在 bind mount 里，**这一项 embodied 默认就是对的**。
3. **显式设 Ray spill 目录到 host 大盘**：

   ```bash
   export RAY_object_spilling_config='{"type":"filesystem","params":{"directory_path":"/workspace/assets/ray-spill"}}'
   ```

4. **docker run 加内存上限**（防 OOM 拖垮整机）：

   ```bash
   docker run ... --memory 24g --memory-swap 24g ...
   ```

5. **GPU 8 GB 是硬上限**。
   - **Math 路线**：1.5B 仍然紧（actor + SGLang 共享 GPU 0，配置已用 fp16 + 全 offload），可能首步就 OOM。如果 OOM，调 `rollout.gpu_memory_utilization`（默认 0.55）往下到 0.40 试试。
   - **Embodied 路线**：OpenVLA/OpenPI/GR00T 7B+ **全部装不下**；只跑 `maniskill_ppo_mlp` / `maniskill_sac_mlp` / `libero_spatial_0_grpo_mlp` 这类小策略 from-scratch RL。同时 ManiSkill GPU 仿真额外占 1-2 GB 显存。

6. **Embodied 还有额外几条**（EGL 渲染、ROBOT_PLATFORM、入口脚本不同），见 [§十一.8](#%E5%8D%81%E4%B8%80-8-%E2%9A%A0%EF%B8%8F-%E8%AE%AD%E7%BB%83%E5%89%8D%E5%BF%85%E9%A1%BB%E5%86%8D%E7%A1%AE%E8%AE%A4embodied-%E5%8A%A0%E9%A1%B9)。

更多踩坑与失败现象见 [issues.md](issues.md) 三条 2026-05-23 条目。

## 十、快速重新部署

如果 Docker 镜像或容器被清理过，重新部署只需：

```bash
# 1. 确保 dockerd 代理仍在（§二，只需配一次）
docker info | grep -i proxy

# 2. 拉镜像
docker pull rlinf/rlinf:math-rlinf0.2-torch2.6.0-sglang0.4.6.post5-vllm0.8.5-megatron0.13.0-te2.1

# 3. 下资产（§四）
mkdir -p /home/ubuntu/rlinf-assets/{models,datasets}
hf download deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B \
  --local-dir /home/ubuntu/rlinf-assets/models/DeepSeek-R1-Distill-Qwen-1.5B
hf download inclusionAI/AReaL-boba-Data --repo-type=dataset \
  --local-dir /home/ubuntu/rlinf-assets/datasets/boba

# 4. 起容器（§六）
docker run -d --gpus all --shm-size 4g --net=host \
  -e NVIDIA_DRIVER_CAPABILITIES=all \
  -v /home/ubuntu/RLinf:/workspace/RLinf \
  -v /home/ubuntu/rlinf-assets:/workspace/assets \
  -w /workspace/RLinf --name rlinf-math \
  rlinf/rlinf:math-rlinf0.2-torch2.6.0-sglang0.4.6.post5-vllm0.8.5-megatron0.13.0-te2.1 \
  sleep infinity

# 5. 容器内 setup（§七）
docker exec rlinf-math bash -c 'ln -sf /opt/venv/reason/Megatron-LM /opt/Megatron-LM'

# 6. 按 §八 验证，按 §⚠️ 谨慎开训练
```

**若要部署 Embodied 路线**，整体流程见 [§十一](#%E5%8D%81%E4%B8%80embodied-%E8%B7%AF%E7%BA%BF%E5%85%A8%E6%B5%81%E7%A8%8B%E6%9C%AA%E5%9C%A8%E6%9C%AC%E6%9C%BA%E5%AE%9E%E6%B5%8B)。§一 / §二 不变，§三~§八 改走 §十一.1~§十一.7。

---

## 十一、Embodied 路线（**全流程未在本机实测**）

> ⚠️ **本节的命令未在本机跑过**——本机选了 Math 路线（[issues.md](issues.md) 解释了为什么）。下面的步骤、字段、踩坑预测都基于：
> 1. 官方文档 [installation.rst](../source-en/rst_source/start/installation.rst) §"Installation Method 1: Docker Image" + [vla.rst](../source-en/rst_source/start/vla.rst)。
> 2. 仓库 [docker/Dockerfile](../../docker/Dockerfile) 的 build stage 列表（embodied 按环境切镜像）。
> 3. 仓库 [examples/embodiment/run_embodiment.sh](../../examples/embodiment/run_embodiment.sh) + 各 yaml 字段。
> 4. Math 路线的实测经验（dockerd 代理、bind mount、RAM、可视化端口等"环境层"完全通用）。
>
> 实际跑下来若与本节出入，**及时回写到 [issues.md](issues.md)**。

### 十一.1 选环境与对应镜像

Embodied 镜像**按环境切，不按模型**。同一镜像里多个 venv 对应不同模型（`source switch_env <name>` 切换）。

| 环境 | 镜像 tag | 镜像里的 venv | 主要 config 例子 | 8 GB GPU 现实 |
| --- | --- | --- | --- | --- |
| `maniskill_libero` | `rlinf/rlinf:agentic-rlinf0.2-maniskill_libero` | `openvla` / `openvla-oft` / `openpi` | `maniskill_ppo_openvla_quickstart.yaml`、`maniskill_ppo_openvlaoft_quickstart.yaml`、`libero_spatial_ppo_openpi_quickstart.yaml` | VLA 7B 全部装不下；只能跑 `maniskill_ppo_mlp.yaml`、`maniskill_sac_mlp.yaml`、`maniskill_crossq_mlp.yaml`、`libero_spatial_0_grpo_mlp.yaml` 这些小策略 |
| `frankasim` | `rlinf/rlinf:agentic-rlinf0.2-frankasim`（推测，需验证） | 待 recon | `frankasim_ppo_mlp.yaml`、`frankasim_sac_cnn_async.yaml` | **8 GB 可跑**；最贴近 HIL-SERL 改造路线 |
| `metaworld` / `calvin` / `robocasa` / `isaaclab` / `behavior` / `robotwin` / `opensora` / `wan` / `libero(plus/pro)` / `embodichain` / `roboverse` | `rlinf/rlinf:agentic-rlinf0.2-<env>`（按 Dockerfile stage 命名规律） | 各异，需 recon | 各有 yaml | 大多绑 VLA 模型，8 GB 装不下；`embodichain_ppo_cart_pole.yaml` 是个 toy，能跑 |
| `franka`（真机） | 独立 `ubuntu:20.04` base | 待 recon | `realworld_*` 系列 yaml | 需要真 Franka 机械臂硬件，不在本机讨论 |

> 官方明确给出的 embodied 镜像 tag **只有 `rlinf/rlinf:agentic-rlinf0.2-maniskill_libero` 一个**（见 [installation.rst](../source-en/rst_source/start/installation.rst#L82)）。其他环境的 tag 是按 Dockerfile stage 命名规律推测的（`base-image-embodied-<env>`），用之前先确认存在：`docker manifest inspect rlinf/rlinf:agentic-rlinf0.2-<env>`。

### 十一.2 拉镜像（**Embodied**）

```bash
# ManiSkill + LIBERO（官方明确支持）
docker pull rlinf/rlinf:agentic-rlinf0.2-maniskill_libero
```

镜像预计 25-35 GB（embodied 比 math 大，因为带仿真器+渲染栈）。**拉之前必查磁盘 free space ≥ 50 GB**（[§一第 2 步](#2-磁盘可用空间)）。

`§二` 的 dockerd 代理配置对 Embodied 同样适用，仍然走官方 tag + 代理是最稳的。

### 十一.3 资产下载（**Embodied**）

Embodied 比 Math 多一项 **ManiSkill 仿真资产**（关卡 mesh、物体模型、贴图等），是 dataset repo：

```bash
mkdir -p /home/ubuntu/rlinf-assets/{models,datasets}

# 1) 模型（按选哪个 model 二选一，或全下）

# 1a) OpenVLA-7B（quickstart 用的）
hf download gen-robot/openvla-7b-rlvla-warmup \
  --local-dir /home/ubuntu/rlinf-assets/models/openvla-7b-rlvla-warmup

# 1b) OpenVLA-OFT + LoRA（quickstart-oft 用的）
hf download RLinf/Openvla-oft-SFT-libero10-trajall \
  --local-dir /home/ubuntu/rlinf-assets/models/Openvla-oft-SFT-libero10-trajall
hf download RLinf/RLinf-OpenVLAOFT-ManiSkill-Base-Lora \
  --local-dir /home/ubuntu/rlinf-assets/models/oft-sft/lora_004000

# 2) ManiSkill 资产（**两条 quickstart 都要**，是 dataset repo）
hf download --repo-type dataset RLinf/maniskill_assets \
  --local-dir /home/ubuntu/rlinf-assets/maniskill_assets
```

> 注意官方文档让你把 maniskill_assets 下到 `<RLinf>/rlinf/envs/maniskill/assets`。我们用 bind mount 方案，**放到 host 的 `rlinf-assets/maniskill_assets` 更干净**，然后容器内 §十一.6 用 symlink 让 `/workspace/RLinf/rlinf/envs/maniskill/assets` 指过去。
>
> 不要再加 `HF_ENDPOINT=https://hf-mirror.com`——Math 路线实测它不生效（[issues.md 2026-05-23 HF 条目](issues.md)），直接走你 shell 的 `HTTPS_PROXY`。

### 十一.4 改 YAML（**Embodied**）

跟 Math 一样：**复制官方 quickstart yaml** 改路径，不动原文件。

**OpenVLA 7B**（`maniskill_ppo_openvla_quickstart.yaml`，本机跑不动，仅留示例）：

```bash
cp examples/embodiment/config/maniskill_ppo_openvla_quickstart.yaml \
   examples/embodiment/config/maniskill_ppo_openvla_quickstart-local.yaml
```

改 2 处路径（行号见原 yaml）：

| 字段 | 改成 |
| --- | --- |
| `rollout.model.model_path` | `/workspace/assets/models/openvla-7b-rlvla-warmup/` |
| `actor.model.model_path` | `/workspace/assets/models/openvla-7b-rlvla-warmup/` |

**OpenVLA-OFT**（`maniskill_ppo_openvlaoft_quickstart.yaml`，本机也跑不动）：

| 字段 | 改成 |
| --- | --- |
| `rollout.model.model_path` | `/workspace/assets/models/Openvla-oft-SFT-libero10-trajall/` |
| `actor.model.model_path` | `/workspace/assets/models/Openvla-oft-SFT-libero10-trajall/` |
| `actor.model.lora_path` | `/workspace/assets/models/oft-sft/lora_004000/` |
| `actor.model.is_lora` | `True` |

**8 GB 显存上真能跑的最小 ManiSkill 配置示例**（`maniskill_ppo_mlp.yaml`，MLP+PPO from scratch，无需 VLA 模型，无需 LoRA）：只需要确认它的 `env.train.env_type: maniskill` 跟下载的 maniskill_assets 兼容；通常不需要改 yaml，因为它不加载预训练模型。

### 十一.5 起容器（**Embodied**，比 Math 多几个 EGL/渲染 env）

```bash
docker rm -f rlinf-embodied 2>/dev/null

docker run -d \
  --gpus all \
  --shm-size 4g \
  --net=host \
  -e NVIDIA_DRIVER_CAPABILITIES=all \
  -e MUJOCO_GL=egl \
  -e PYOPENGL_PLATFORM=egl \
  -e ROBOT_PLATFORM=LIBERO \
  -v /home/ubuntu/RLinf:/workspace/RLinf \
  -v /home/ubuntu/rlinf-assets:/workspace/assets \
  -w /workspace/RLinf \
  --name rlinf-embodied \
  rlinf/rlinf:agentic-rlinf0.2-maniskill_libero \
  sleep infinity
```

**新增 flag 解释**：

| flag | 作用 |
| --- | --- |
| `-e MUJOCO_GL=egl` | MuJoCo 走 EGL headless 渲染（无显示器场景必备）。[run_embodiment.sh](../../examples/embodiment/run_embodiment.sh) 默认设这个。 |
| `-e PYOPENGL_PLATFORM=egl` | 同上，针对 PyOpenGL。 |
| `-e ROBOT_PLATFORM=LIBERO` | 决定 action 维度与归一化方式，[run_embodiment.sh](../../examples/embodiment/run_embodiment.sh) 默认 LIBERO，可选 ALOHA / BRIDGE。 |
| **依然不挂 `/root` 和 `/opt`** | 官方文档 [installation.rst](../source-en/rst_source/start/installation.rst#L102) 强调："Do not override the `/root` and `/opt` directories"——里面是 ManiSkill 资产链接和 venv。**如果不得已挂了 `/root`，必须再跑 `link_assets`** 把符号链接恢复。 |
| **HOME 别动** | `$HOME` 默认 `/root`，ManiSkill 靠这个找资产。若改了 HOME，也要再跑 `link_assets`。 |

### 十一.6 容器内一次性 setup（**Embodied**）

```bash
docker exec rlinf-embodied bash -c '
# 1) 切到对应 venv
#    默认是 openvla，按模型切；可选: openvla / openvla-oft / openpi
source switch_env openvla   # 或 openvla-oft / openpi
which python; python --version

# 2) 验证 venv 内包齐
which ray
python -c "import sglang; print(sglang.__version__)"
python -c "import mani_skill; print(mani_skill.__version__)" 2>&1 | head -3

# 3) 把 host 端的 maniskill 资产软链到 yaml 期望的位置（如果走的是 host bind mount 方案）
ln -sfn /workspace/assets/maniskill_assets \
        /workspace/RLinf/rlinf/envs/maniskill/assets
ls /workspace/RLinf/rlinf/envs/maniskill/assets | head -5

# 4) 如果（出于某种原因）挂了 /root 或改了 HOME，跑 link_assets 恢复
# link_assets
'
```

> 镜像内部布局（基于官方 [installation.rst](../source-en/rst_source/start/installation.rst#L125) 描述，**待实地 recon 确认**）：
>
> ```
> /opt/venv/
> ├── openvla/       # OpenVLA 7B 模型用
> ├── openvla-oft/   # OpenVLA-OFT 模型用
> └── openpi/        # OpenPI 模型用
> /usr/local/bin/
> ├── switch_env    # source switch_env <name>
> └── link_assets   # 恢复 /root 下的资产软链
> /root/             # 内含 ManiSkill 资产软链，**别覆盖**
> /opt/...           # ManiSkill 仿真器源码、依赖等，**别覆盖**
> ```

### 十一.7 验证部署完成（**Embodied，不启动训练**）

```bash
docker exec rlinf-embodied bash -c '
source switch_env openvla
echo "=== GPU ==="
nvidia-smi --query-gpu=name,memory.used,memory.free --format=csv | head -2
echo "=== venv ==="
python --version; ray --version
echo "=== embodied stack ==="
python -c "import mani_skill; print(\"mani_skill:\", mani_skill.__version__)"
python -c "import sglang; print(\"sglang:\", sglang.__version__)"
python -c "from rlinf.envs import get_env_cls, SupportedEnvType; print(\"rlinf envs OK\")"
echo "=== mounts ==="
ls /workspace/RLinf | head -3
ls /workspace/assets/models 2>/dev/null | head -3
ls /workspace/assets/maniskill_assets 2>/dev/null | head -5
ls -la /workspace/RLinf/rlinf/envs/maniskill/assets 2>/dev/null  # 应是软链
echo "=== EGL render smoke test ==="
python -c "
import os, mujoco
print(\"MUJOCO_GL=\", os.environ.get(\"MUJOCO_GL\"))
m = mujoco.MjModel.from_xml_string(\"<mujoco><worldbody><body><geom type=box size=.1 .1 .1/></body></worldbody></mujoco>\")
d = mujoco.MjData(m)
r = mujoco.Renderer(m)
r.update_scene(d)
print(\"EGL render OK, image shape:\", r.render().shape)
" 2>&1 | tail -5
'
```

预期：python 3.10/3.11、ray 装好、mani_skill import 通、maniskill_assets 软链命中、EGL 渲染输出 image shape。

到这里 embodied 部署就完成了。

### 十一.8 ⚠️ 训练前必须再确认（**Embodied 加项**）

[§⚠️ 训练前必须再确认](#-训练前必须再确认) 的所有 Math 红线对 Embodied 仍然适用，**额外**还要：

1. **VLA 模型 fp16 显存换算**：OpenVLA 7B ≈ 14 GB、OpenPI Base 3B ≈ 6 GB、OpenVLA-OFT 7B + LoRA ≈ 15 GB。**本机 8 GB GPU 全部装不下**——只跑 `maniskill_ppo_mlp.yaml` / `maniskill_sac_mlp.yaml` / `libero_spatial_0_grpo_mlp.yaml` 这类小策略 from-scratch RL 配置。
2. **ManiSkill GPU 仿真显存额外占用 1-2 GB**：单 GPU 同时跑 actor + rollout + 仿真器时，GPU 显存比 Math 路线更紧张。
3. **MUJOCO_GL=egl 必须设**：默认显示后端在 headless 服务器/容器里报 EGL not available 之类错误。
4. **检查 ROBOT_PLATFORM**：[run_embodiment.sh](../../examples/embodiment/run_embodiment.sh) 默认 `LIBERO`，但你的 config 实际跑的是 ManiSkill → 用 `BRIDGE` / `LIBERO` 都行（影响 action 维度/归一化）。第 2 个参数可覆盖：`bash run_embodiment.sh <cfg> ALOHA`。
5. **入口脚本**：用 [run_embodiment.sh](../../examples/embodiment/run_embodiment.sh)（不是 `run_main_grpo_math.sh`）：
   ```bash
   bash examples/embodiment/run_embodiment.sh maniskill_ppo_mlp
   # 或异步训练
   bash examples/embodiment/run_async.sh maniskill_sac_mlp_async
   ```
6. **日志位置**：脚本把日志写到 `${REPO_PATH}/logs/<时间戳>-<config_name>/`，**就在 bind-mounted 的 `/home/ubuntu/RLinf/logs/` 里**，不进容器写层。

