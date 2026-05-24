# RLinf Studio — 桌面 GUI 应用

RLinf 的可视化操作界面，用模板卡片 + 一键启动替代 CLI + 脚本 + YAML。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Tauri 2.x (Rust) |
| 前端 | React 18 + TypeScript + Ant Design 5 |
| 后端 | FastAPI (Python) — 作为 Tauri sidecar 运行 |
| 本地存储 | SQLite |

## 开发环境要求

```bash
# Ubuntu 22.04+
# Node.js 20+
node --version  # v20.x

# Rust (Tauri 需要)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustc --version  # 1.70+

# Tauri 系统依赖 (Ubuntu)
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf

# Python 3.10+
python3 --version
```

## 快速开始（开发模式）

```bash
# 一键启动后端 + 前端
bash gui/scripts/dev.sh

# 或分别启动：

# 后端
cd gui/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn main:app --host 0.0.0.0 --port 18721 --reload

# 前端
cd gui/frontend
npm install
npm run dev          # Vite dev server on :1420
npm run tauri dev    # Tauri 桌面窗口（需要 Rust）
```

## 打包

```bash
cd gui/frontend
npm run tauri build
# 产物在 src-tauri/target/release/bundle/
#   - deb/rlinf-studio_*.deb
#   - appimage/rlinf-studio_*.AppImage
```

## 目录结构

```
gui/
  backend/               # FastAPI Python 后端
    main.py              # uvicorn 入口
    api/                 # REST + WebSocket 端点
    services/            # 业务逻辑（模板发现、任务管理、节点管理）
    models/              # Pydantic 数据模型
    db/                  # SQLite 持久化
  frontend/              # React + Tauri 前端
    src/                 # React 源码
      pages/             # 页面组件
      components/        # 可复用组件
      stores/            # Zustand 状态管理
    src-tauri/           # Tauri Rust 壳
  scripts/               # 开发/构建脚本
```

## 分阶段路线图

- [x] Phase 1：骨架 + 配置编辑器
- [ ] Phase 2：任务模板 + 本地任务启动
- [ ] Phase 3：节点管理 + 远程执行
- [ ] Phase 4：工作流引擎 + 云边联合
- [ ] Phase 5：打磨 + 监控集成 + 发布
