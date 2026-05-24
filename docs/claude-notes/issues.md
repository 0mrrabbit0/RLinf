# 问题及解决方案记录

> 收集协作过程中遇到的报错、踩坑与对应解决办法，避免下次重复踩。
> 顶部为最新条目。每条目按「现象 → 根因 → 解决 → 复现条件」格式书写。

## 模板

```
### [日期] 简短现象描述
- **环境/上下文**：模型 / 环境 / 配置 / 节点数
- **现象**：报错信息或异常表现
- **根因**：定位过程与最终原因
- **解决**：实际采取的修复步骤
- **复现条件**：什么场景下会再次出现
- **关联**：commit / PR / 相关文档
```

---

## 历史条目

### [2026-05-24] Tauri v2 中 Builder 没有 on_event 方法
- **环境/上下文**：`gui/frontend/src-tauri/`，`npm run tauri build`，Tauri v2 + Rust 1.95。
- **现象**：`error[E0599]: no method named 'on_event' found for struct 'tauri::Builder<R>'`。
- **根因**：Tauri v1 的 `Builder::on_event()` 在 v2 中被移除。v2 的事件处理改为 `App::run(|app, event| { ... })` 回调模式，需要先 `.build()` 再 `.run()`。
- **解决**：将 `.on_event(...).run(tauri::generate_context!())` 改为 `.build(tauri::generate_context!()).run(|app, event| { ... })`，事件处理逻辑不变。
- **复现条件**：使用 Tauri v2 但代码按 v1 API 写的 `on_event` 链式调用。
- **关联**：`gui/frontend/src-tauri/src/lib.rs:120-140`。

### [2026-05-24] ConfigEditorPage.tsx 树节点 icon 类型不兼容
- **环境/上下文**：`gui/frontend/`，`npm run build`（tsc + vite build），antd Tree 组件。
- **现象**：`TS2322: Type '({ expanded }: { expanded: boolean }) => JSX.Element' is not assignable to type 'IconType'`。`expanded` 的类型 `boolean` 与 antd `TreeNodeProps` 中的 `boolean | undefined` 不兼容。
- **根因**：antd 的 `DataNode.icon` 回调签名中 `expanded` 是可选的（`boolean | undefined`），但代码中解构时声明为 `{ expanded: boolean }`，TS 严格模式下不允许。
- **解决**：改为 `({ expanded = false }: { expanded?: boolean }) =>`，加可选标记和默认值。
- **复现条件**：antd v5 + TS strict 模式下使用 Tree 组件自定义 icon 回调。
- **关联**：`gui/frontend/src/pages/ConfigEditorPage.tsx:41`。

### [2026-05-24] Tauri build 缺少图标文件导致编译 panic
- **环境/上下文**：`gui/frontend/`，`npm run tauri build`，Tauri v2。
- **现象**：`proc macro panicked` → `failed to open icon /home/ubuntu/RLinf/gui/frontend/src-tauri/icons/32x32.png: No such file or directory`。
- **根因**：`src-tauri/icons/` 目录为空或未提交，Tauri 的 `generate_context!()` 宏在编译期要求图标文件存在。
- **解决**：用 `npx tauri icon /tmp/icon.png` 生成默认图标集（先用 ImageMagick `convert -size 1024x1024 xc:steelblue /tmp/icon.png` 造占位源图）。
- **复现条件**：克隆仓库后首次 `tauri build`，且 `src-tauri/icons/` 未包含在 git 中。
- **关联**：gui/frontend/src-tauri/tauri.conf.json 的 `bundle.icon` 配置。

### [2026-05-24] 前端 TypeScript 编译报错：未使用的导入
- **环境/上下文**：`gui/frontend/`，`npm run build`（tsc + vite build）。
- **现象**：`TS6133: 'Space' is declared but its value is never read`（TaskCreate.tsx）；`TS6133: 'Title' is declared but its value is never read`（TaskDetail.tsx）。
- **根因**：`tsconfig.json` 开启了 `noUnusedLocals`（或 strict 模式），导入了但未使用的变量会报错。
- **解决**：从 `TaskCreate.tsx` 的 antd 导入中删除 `Space`；将 `TaskDetail.tsx` 的 `const { Title, Text } = Typography` 改为 `const { Text } = Typography`。
- **复现条件**：任何 `npm run build`，因为 tsc 编译检查。
- **关联**：`gui/frontend/src/pages/TaskCreate.tsx`、`gui/frontend/src/pages/TaskDetail.tsx`。

### [2026-05-24] Tauri build 前未构建前端资源
- **环境/上下文**：`gui/frontend/`，直接 `npm run tauri build`。
- **现象**：`Unable to find your web assets, did you forget to build your web app? Your frontendDist is set to "../dist"`。
- **根因**：`tauri.conf.json` 配置 `frontendDist: "../dist"`，而 `dist/` 目录由 `npm run build`（vite build）产出。直接跑 `tauri build` 时 `dist/` 不存在。
- **解决**：先 `npm run build` 再 `npm run tauri build`，或合并为 `npm run build && npm run tauri build`。
- **复现条件**：首次 build 或 `dist/` 被清理后，未先执行前端构建。

### [2026-05-24] Rust stable toolchain 安装不完整（error reading rustc version）
- **环境/上下文**：Ubuntu 22.04，rustup 1.29.0，之前有手动安装的 rust-analyzer / rustfmt / cargo-fmt。
- **现象**：`rustup toolchain install stable` 后显示 `stable-x86_64-unknown-linux-gnu unchanged - (error reading rustc version)`；`cargo metadata` 报 `Missing manifest in toolchain 'stable-x86_64-unknown-linux-gnu'`。
- **根因**：`~/.cargo/bin/` 中存在旧版手动安装的 `rust-analyzer`、`rustfmt`、`cargo-fmt`，与 rustup 管理的工具冲突，导致 toolchain 安装被跳过/部分失败。
- **解决**：
  1. `rm ~/.cargo/bin/rust-analyzer ~/.cargo/bin/rustfmt ~/.cargo/bin/cargo-fmt`
  2. `rustup toolchain uninstall stable && rustup toolchain install stable`
  3. 验证 `rustc --version && cargo --version`。
- **复现条件**：系统中已有手动安装的 Rust 工具，再用 rustup 安装/更新 toolchain。

### [2026-05-24] rustup 写入 settings.toml 权限拒绝
- **环境/上下文**：Ubuntu 22.04，首次安装 Rust（`curl ... | sh`）。
- **现象**：`error: could not write settings file: '/home/ubuntu/.rustup/settings.toml': Permission denied (os error 13)`。
- **根因**：`~/.rustup/settings.toml` 属主为 `root:root`（之前可能用 `sudo` 安装过），当前用户无写权限。
- **解决**：`sudo chown -R $USER:$USER ~/.rustup`。
- **复现条件**：`~/.rustup` 目录由 root 创建/曾以 sudo 运行过 rustup。

### [2026-05-24] python3-venv 未安装导致虚拟环境创建失败
- **环境/上下文**：`gui/scripts/dev.sh` 启动后端，尝试创建 `.venv`。
- **现象**：`The virtual environment was not created successfully because ensurepip is not available`。
- **根因**：Debian/Ubuntu 的 Python 3.10 未默认安装 `python3.10-venv` 包，`venv` 模块不可用。
- **解决**：`sudo apt install -y python3.10-venv`。
- **复现条件**：Ubuntu 系统默认 Python 安装，未额外装 venv 包。

### [2026-05-24] libappindicator3-dev 与 libayatana-appindicator3 包冲突
- **环境/上下文**：安装 Tauri 系统依赖 `sudo apt install libappindicator3-dev ...`。
- **现象**：`libayatana-appindicator3-1 : Conflicts: libappindicator3-1`，apt 无法解决依赖。
- **根因**：`libayatana-appindicator3` 是 `libappindicator3` 的替代品（API 兼容），两者互斥。Ubuntu 22.04 默认装了 ayatana 版本。
- **解决**：用 `libayatana-appindicator3-dev` 替代 `libappindicator3-dev`：`sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf`。
- **复现条件**：Ubuntu 22.04+ 安装 Tauri 依赖时照搬旧版教程中的 `libappindicator3-dev`。

### [2026-05-23] dockerd 默认不读 user 代理，CN docker mirror 极不稳定
- **环境/上下文**：Ubuntu 22.04，目标拉 `rlinf/rlinf:math-rlinf0.2-...`（~21 GB）。
- **现象**：
  1. 先试 `docker.1ms.run/rlinf/rlinf:math-...`：~15 GB 下载到一半永久卡死（dockerd 0 外部 TCP 连接，layer 5/26 后停滞 10+ min）。
  2. 改 `docker.m.daocloud.io`：白名单拒绝（"这镜像不在白名单"）。
  3. `docker.1panel.live`：拒绝"only support mainland China"（即便从 CN）。
  4. 用户已有正常代理 `127.0.0.1:7897` 能直连 Docker Hub（curl HTTP/2 401 OK），但 dockerd 不读 user 的 `HTTPS_PROXY`。
- **根因**：dockerd 是 systemd 服务，环境变量来自 systemd unit，与用户 shell 的 `HTTPS_PROXY` 无关。
- **解决**：
  1. 创建 `/etc/systemd/system/docker.service.d/http-proxy.conf` 含 `Environment="HTTP_PROXY=http://127.0.0.1:7897"` 与 `HTTPS_PROXY` 两行（NO_PROXY 加 127.0.0.1）。
  2. `sudo systemctl daemon-reload && sudo systemctl restart docker`。
  3. 验证 `docker info` 看 `HTTP Proxy:` `HTTPS Proxy:` 行。
  4. 然后用官方 tag `rlinf/rlinf:math-...`（不带任何 mirror 前缀），dockerd 走代理 → Docker Hub。实测 72 MB/s，~4 min 拉完 21 GB。
- **复现条件**：在大陆网络 + 已有可用 HTTP 代理的 Ubuntu 上，仍试图用 `docker.*.cn` / `docker.1ms.run` / `docker.m.daocloud.io` 等公共 mirror 拉 Docker Hub 镜像。
- **关联**：[deployment.md §二](deployment.md)。

### [2026-05-23] 磁盘空间不足导致训练启动时系统崩溃
- **环境/上下文**：跑 `qwen2.5-1.5b-single-gpu-local`（DeepSeek-R1-Distill-Qwen-1.5B + GRPO + Megatron + SGLang）。
- **现象**：训练命令发出后系统无响应或容器崩溃。
- **根因**：训练过程中写入大量中间数据（Megatron HF→Megatron checkpoint ~5.4 GB + Ray spill + worker 日志），当磁盘剩余空间不足时，写入失败导致连锁崩溃。
- **解决（通用做法）**：
  1. 训练前 `df -h /var/lib/docker /home` 确认 **≥ 50 GB free**。
  2. 把 `runner.output_dir` 配到 bind-mounted 的 host 目录，**不让 Megatron checkpoint 写进容器可写层**。
  3. Ray spill 显式设目录：`RAY_object_spilling_config='{"type":"filesystem","params":{"directory_path":"/workspace/assets/ray-spill"}}'`。
  4. Docker run 加 `--memory 24g --memory-swap 24g` 上限，防 OOM swap 撑磁盘。
- **复现条件**：磁盘 free space < 30 GB 时跑任何需要写 GB 级中间数据的训练。
- **关联**：[deployment.md §⚠️](deployment.md)。

### [2026-05-23] RAM 不足导致 Ray OOM kill / Linux OOM kill
- **环境/上下文**：系统 RAM 16 GB，跑 Megatron + SGLang 共存的 single-gpu config。
- **现象**：
  1. 第一次 Ray worker memory 监控在 14.81/15.54 GB（95.4%）杀掉 SGLang/Reward worker。
  2. 放宽 `RAY_memory_usage_threshold=0.98` + `RAY_memory_monitor_refresh_ms=0` 后，Linux OOM killer 直接 SIGKILL SGLang+Megatron 进程。
- **根因**：actor (Megatron) + rollout (SGLang) + reward + ray 生态同时初始化模型，峰值需求 18–25 GB（fp32 Adam states 12GB + master weights 6GB + SGLang model 3GB + 系统 3GB）。GPU 端反而完全 OK。
- **解决**：确保系统有 **≥ 24 GB 物理 RAM**。另外可调 `actor.megatron.ckpt_convertor.process_num` 从 16 降到 2 减少并行转换进程的 RAM 压力。
- **复现条件**：物理 RAM ≤ 16 GB 跑 single-gpu Megatron + SGLang 共存 config。
- **关联**：[deployment.md §⚠️](deployment.md)；`examples/reasoning/config/math/qwen2.5-1.5b-single-gpu-local.yaml` 的 `process_num: 2` 改动。

### [2026-05-23] HF 下载 SSL EOF + HF_ENDPOINT 不生效 + .bashrc 代理拼写 typo
- **环境/上下文**：Ubuntu 22.04，huggingface_hub 0.35.3，目标 `deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B` 与 `inclusionAI/AReaL-boba-Data`。
- **现象**：
  1. 第一次以 `HF_ENDPOINT=https://hf-mirror.com hf download ...` 启动后台任务，约 60s 后两个任务都 SSL `[SSL: UNEXPECTED_EOF_WHILE_READING]` 失败；错误 URL 显示**仍是 `huggingface.co`**（说明 `HF_ENDPOINT` 没生效）。
  2. `~/.bashrc` 里有一行 `export HTTPS_PR0XY=http://127.0.0.1:7897`（**"PR0XY" 是数字 0**），这条 export 名义上是 typo，等于没设置；好在同文件还有正确拼写的 `HTTPS_PROXY`，所以代理仍然工作。
- **根因**：
  1. 代理监听 `127.0.0.1:7897`，通过 `HTTPS_PROXY`/`HTTP_PROXY` 接管所有 HTTPS。
  2. `HF_ENDPOINT` 没生效原因待进一步定位——可能是 huggingface_hub 0.35.3 的解析路径与 `HF_ENDPOINT` 不一致，或后台 bash 没正确继承变量。
  3. SSL EOF 是代理 / 上游瞬时连接 reset。
- **解决**：去掉 `HF_ENDPOINT=...` 前缀，直接 `hf download ...`，让请求走 `$HTTPS_PROXY`。重试通过。
- **复现条件**：在带本地代理（clash 类）的 Ubuntu 上、用 huggingface_hub 0.35.x、按官方文档加 `HF_ENDPOINT=https://hf-mirror.com` 启动 hf download。
- **关联**：[deployment.md §四](deployment.md)；建议修 `~/.bashrc` 里的 `HTTPS_PR0XY` 拼写。
