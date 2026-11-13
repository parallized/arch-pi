<div align="center">

<br />

<img src="./docs/assets/logo.png" width="76" alt="Arch Pi" />

<h1 id="english">Arch Pi</h1>

<p>
  <strong>Orchestrator → Worker Workspace + Multi-Agy Parallelism × Arbitrary Relay Routing</strong>

  <br />

  Built on <a href="https://github.com/badlogic/pi-mono"><code>Pi</code></a> Agent.
</p>

<p>
  <a href="#english">English</a> &nbsp;·&nbsp; <a href="#简体中文">简体中文</a> &nbsp;·&nbsp; <a href="./DESIGN.md">Design Spec</a>
</p>

<br />

<img src="./docs/assets/split-orchestration.webp" width="840" alt="Arch Pi linked split workspace: Master plans with a high-reasoning model on the left and dispatches to a low-cost relay Worker on the right (92% cache hit, 68.5 tok/s)" />

High-cost <strong>Master</strong> autonomously plans -> reviews; relay <strong>Worker</strong> picks up execution

</div>

<br />

## Solutions

1. **Antigravity multi-account parallelism without switching dropouts** — StreamJson lets the official `agy` CLI seamlessly continue sessions concurrently across accounts
2. **Native Orchestrator architecture for peak cost-performance** — Expensive quota-limited models understand complex requirements and review results; ultra-high-value Hydrogen / DeepSeek or any low-cost relay model you have does the heavy lifting

---

## Multi-Account Agy Parallelism × Relay Model Pool

<div align="center">
  <br />
  <img src="./docs/assets/parallel-agy.webp" width="820" alt="StreamJson Way parallels AGY: Master/Worker candidate pools, x0.05 multiplier badge, live multi-account Antigravity 5h/7d quota rings, and relay balance" />
  <br />
  <sub><strong>Role-split Master / Worker candidate pools &amp; balance tracking</strong><br/><code>x0.05</code> relay routing, live quotas across multiple personal Antigravity accounts, and real-time Sub2API balance tracking</sub>
</div>

---

## Pi Agent Foundation

<img src="./docs/assets/arrow.webp" width="820" alt="DeepSeek-V4.1-Flash-1017 benchmark chart comparing Pi harness (~76% pass rate at ~$0.05/task) against Antigravity CLI (~62% at ~$0.17/task)" />

- **Top-tier Agent Harness foundation**
- **Detailed telemetry** — Every turn tracks **TTFT**, **token/s**, and **cache hit**
- **Zero filesystem clutter** — Everything stays cleanly inside `~/.archpi/`

---

## Design Restraint Spec

Arch Pi neutral-dark design specification: [`DESIGN.md`](./DESIGN.md)

---

## File Structure

```text
arch-pi/
├── apps/
│   └── desktop/                  # Electron 35 + React 19 + Tailwind CSS 4 + Zustand 5
│       ├── resources/            # Per-process Agy credential isolation hook (Windows) & app icons
│       ├── src/main/             # Main-process IPC, Agy 5h/7d quota & Sub2API balance polling
│       ├── src/preload/          # Context-isolated window.archpi bridge
│       └── src/renderer/         # Linked split workspace, Kanban board, quota rings & settings
├── packages/
│   ├── agent-runtime/            # Unified runtime bridging pi-agent-core & GeminiAgyAdapter
│   │   └── src/
│   │       ├── runtime.ts        # Dual-engine turns, SSE normalization, plan dispatch & ~/.archpi store
│   │       ├── tools.ts          # Workspace-sandboxed Master / Worker / Reviewer toolsets
│   │       └── providers/        # Provider registry & GeminiAgyAdapter (stream-json)
│   └── shared/                   # Cross-process shared contracts (AliveWindow, PlanSpec, TaskCard, etc.)
├── scripts/
│   └── archpi-dev.mjs            # Dev launcher (archpi-dev)
└── DESIGN.md                     # Mandatory frontend UI visual specification
```

---

## Getting Started

### Prerequisites
- **Node.js** `>= 20.0.0`
- **pnpm** `>= 9.0.0`
- *(Optional, for Antigravity windows)* Local `agy` CLI installed and authorized

### Run Locally

```bash
git clone https://github.com/parallized/arch-pi.git
cd arch-pi
pnpm install
pnpm dev
```

### Typecheck & Build

```bash
pnpm typecheck
pnpm build
```

---

## Contributing

Early days — feel free to jump in and contribute anything.

---

<br />

## 简体中文

<div align="center">

<br />

<img src="./docs/assets/logo.png" width="76" alt="Arch Pi" />

<h3>Arch Pi</h3>

<p>
  <strong>Orchestrator → Worker 工作台 + 多 Agy 账号并行 × 任意中转混编 </strong>

  <br />

  以 <a href="https://github.com/badlogic/pi-mono"><code>Pi</code></a> Agent 为基底构建。
</p>

<p>
  <a href="#english">English</a> &nbsp;·&nbsp; <a href="#简体中文">简体中文</a> &nbsp;·&nbsp; <a href="./DESIGN.md">设计规范</a>
</p>

<br />

<img src="./docs/assets/split-orchestration.webp" width="840" alt="Arch Pi 联动分屏实拍：左侧 Master 使用高智模型规划并派发给右侧低成本中转 Worker（92% 缓存命中，68.5 tok/s）" />

全自动高价格 <strong>Master</strong> 模型出方案 -> 审阅；中转 <strong>Worker</strong> 接棒执行

</div>

<br />

### 解决方案

1. **Antigravity 多号无法并行，切号打断** — StreamJson 允许官方 `agy` 无感继续会话
2. **原生 Orchestrator 架构，极致性价比** — 高价格限量模型理解复杂需求，审阅工作；性价比极高的 Hydrogen / DeepSeek 或者任何你能拿到的低价渠道模型干活

---

### 多账号 Agy 并行 × 中转模型 Pool

<div align="center">
  <br />
  <img src="./docs/assets/parallel-agy.webp" width="820" alt="StreamJson Way parallels AGY：Master/Worker 候选模型池、x0.05 倍率标签、多路 Antigravity 实时 5h/7d 配额环与中转站余额同屏呈现" />
  <br />
  <sub><strong>Master / Worker 分角色候选池余额追踪</strong><br/><code>x0.05</code> 中转、多个个人 Antigravity 账号实时配额，以及 Sub2API 实时余额追踪</sub>
</div>

---

### Pi Agent 基底

<img src="./docs/assets/arrow.webp" width="820" alt="DeepSeek-V4.1-Flash-1017 基准对比图：Pi 底座以约 $0.05/任务的成本取得约 76% 通过率，对比 Antigravity CLI" />

- **极佳 Agent Harness 底座**
- **详细数据指标** 每轮附带 **首字**、**token/s**、**缓存命中**
- **不到处拉屎** — 所有东西都在 `~/.archpi/`

---

### 视觉克制规范

Arch Pi 中性暗色设计规范 [`DESIGN.md`](./DESIGN.md)

---

### 文件结构

```text
arch-pi/
├── apps/
│   └── desktop/                  # Electron 35 + React 19 + Tailwind CSS 4 + Zustand 5
│       ├── resources/            # 多账号 Agy 进程级凭据隔离 Hook（Windows）与应用图标
│       ├── src/main/             # 主进程 IPC、Agy 5h/7d 配额与 Sub2API 余额轮询
│       ├── src/preload/          # 上下文隔离的 window.archpi 桥接层
│       └── src/renderer/         # 联动分屏工作区、编排看板、配额环与设置面板
├── packages/
│   ├── agent-runtime/            # 统一桥接 pi-agent-core 与 GeminiAgyAdapter 的运行时
│   │   └── src/
│   │       ├── runtime.ts        # 双引擎轮次调度、SSE 修复、计划派发与 ~/.archpi 持久化
│   │       ├── tools.ts          # 工作区沙箱化的 Master / Worker / Reviewer 工具集
│   │       └── providers/        # 供应商注册表与 GeminiAgyAdapter（stream-json）
│   └── shared/                   # 跨端共享类型契约（AliveWindow、PlanSpec、TaskCard 等）
├── scripts/
│   └── archpi-dev.mjs            # 开发启动器（archpi-dev）
└── DESIGN.md                     # 前端 UI 强制视觉规范
```

---

### 快速开始

#### 环境要求
- **Node.js** `>= 20.0.0`
- **pnpm** `>= 9.0.0`
- *（可选，若使用 Antigravity 窗口）* 本地已安装并授权 `agy` CLI

#### 本地开发启动

```bash
git clone https://github.com/parallized/arch-pi.git
cd arch-pi
pnpm install
pnpm dev
```

#### 类型检查与构建

```bash
pnpm typecheck
pnpm build
```

---

### 参与贡献

项目初建立，请随意

---
