# 光阴对赌 · Agent 版（agent-edition）

> 6 名独立 AI 玩家在本地跑完一整局《光阴对赌》；管理者只观察、控场、导出数据。
> 本目录是父仓库 `光阴对赌新新新` 的实验分支副本，**不参与线上部署**。

---

## 状态快照（2026-11-04 11:00）

| 项目 | 结论 |
|------|------|
| 是否仍在被修改 | **否**。最后一次写入为 10:50:39（`logs/agents-*.jsonl`）；检查时 3001 / 5173 无监听，无相关 node 进程。上一个进程已被终止。 |
| 能否编译 | ✅ `server` / `agents` / `frontend` 均通过 |
| 自动化测试 | ✅ 服务端 251 / 251 通过 |
| 端到端 | ✅ 6 个内置策略 Agent 可完成 8 轮投资、3 场拍卖、社区命名并进入 `GAME_OVER` |
| LLM 真实调用 | ⚠️ 代码完整，但根 `.env` 仍为占位 Key，**LLM 路径尚未真实跑通** |
| 沟通 / 记忆 / 心智理论 | ❌ 尚未实现，见下方「当前完成度」 |

> 本表是审计时点快照，不代表后续状态。重新运行前请先看「快速开始」与「故障排查」。

---

## 1. 它是什么，不是什么

**是：**

- 一个可本地运行的多智能体社会博弈实验台。
- 6 个 Agent 各自持有独立 Socket 连接、独立上下文、独立配置，进入同一个房间对局。
- 管理端保留上帝视角：看局面、控场（开局 / 跳阶段 / 拍卖 / 计时）、导出 JSON + XLSX。

**不是：**

- 不是面向人类玩家的线上版本；玩家端源码虽然保留，但构建产物只有 `admin.html`。
- 不是多实例生产服务；服务端状态在内存、归档文件非多进程安全，**只能单实例运行**。
- 不替代父仓库。父仓库仍是线上版本的唯一真相；本目录用于实验与课程 Demo。

与父仓库的主要差异：

- 新增 `agents/`（Agent 运行时）与根目录一键脚本。
- 服务端增加 `agentRegister`、Agent 元数据字段与导出列。
- 前端构建入口只保留管理端。
- 未包含父仓库中的「规则讲解员」与旧 `server/ai` 自动调参模块。

---

## 2. 目录结构

```text
agent-edition/
├─ .env / .env.example        # 根配置：ADMIN_TOKEN、6 个 Agent Key、节奏参数
├─ package.json               # setup / dev / build / start 一键脚本
├─ scripts/                   # 进程编排与构建
├─ agents/                    # Agent 运行时
│  ├─ agents.config.json      # 6 名 Agent 的姓名 / 人格 / 风格 / 风险偏好
│  └─ src/
│     ├─ orchestrator.ts      # 建房、自动开局、主持拍卖、自动重开
│     ├─ agentClient.ts       # 单个 Agent 的连接、观察、决策、提交
│     ├─ policy.ts            # 无 Key / 调用失败时的内置策略
│     ├─ prompts.ts           # 系统提示词与各阶段提示词
│     ├─ observation.ts       # 从 gameUpdate 裁剪出「自己的视角」
│     └─ llm.ts               # OpenAI 兼容调用与 JSON 解析
├─ server/                    # 游戏服务端（规则、阶段、存档、导出）
├─ frontend/                  # 管理端 admin.html（玩家端源码保留但不构建）
├─ logs/                      # Agent 运行日志（gitignore）
├─ 初步计划.docx              # 原始立项计划
└─ 计划修改.md                # 基于现状修订后的计划
```

---

## 3. 架构与数据流

```text
┌──────────────────── agents/ ────────────────────┐
│  AgentClient #1 … #6                            │
│  各自 socket / 上下文 / 配置                     │
└───────────────┬─────────────────────────────────┘
                │ joinGame / playerReady / submitInvestment
                │ createTransaction / playerPlaceAuctionBid …
                ▼
        ┌───────────────────┐         ┌──────────────────────────┐
        │   Game Server     │◄───────►│  Orchestrator（主持）     │
        │  阶段 / 规则 /     │  admin  │  自动开局 / 拍卖控场 /    │
        │  归档 / 导出       │  socket │  自动重开                 │
        └─────────┬─────────┘         └──────────────────────────┘
                  │ gameUpdate（按视角裁剪）
                  ├──────────────► 6 个 Agent：只看到自己的手牌、精力、投资草稿
                  └──────────────► 管理端：上帝视角 + 导出
```

两个关键约束：

1. **玩家视角裁剪**在服务端完成。他人精力、手牌、已用道具、投资草稿不会下发给 Agent。
2. **主持控场**复用管理端 Socket（`ADMIN_TOKEN` 鉴权）。`AGENT_AUTO_AUCTION=true` 时，由 Orchestrator 定焦点、跳过无人出价的卡、在窗口后落槌。

---

## 4. 快速开始

### 4.1 环境

- Node.js `>=20 <23`，npm `>=10`（当前机器为 Node 22）。
- 三个子项目各自有 `node_modules`，首次需安装。

### 4.2 安装

```bash
cd D:\workspace\光阴对赌新新新\agent-edition
npm run setup
```

`setup` 会：复制 `.env.example` → `.env`，并依次安装 `server`、`agents`、`frontend` 依赖。

### 4.3 配置

编辑根目录 `.env`，至少设置：

```dotenv
ADMIN_TOKEN=本地管理密钥
AGENT_1_API_KEY=sk-...
# … AGENT_2 … AGENT_6
```

- 支持任意 OpenAI 兼容接口：填 `AGENT_n_BASE_URL` / `AGENT_n_MODEL` 即可。
- **不填 Key 也能跑**：占位 Key 会自动回退到内置策略（`AGENT_FALLBACK_POLICY=true`）。
- 想强制不调用任何模型：`AGENT_OFFLINE=true`。

> 根 `.env` 是唯一权威配置。`server/.env` 只用于补充父仓库遗留变量；同名变量以先加载的根 `.env` 为准。
> `.env` 已被 gitignore，**不要把真实 Key 提交或分发**。

### 4.4 开发模式

```bash
npm run dev
```

| 地址 | 用途 |
|------|------|
| `http://localhost:5173/admin.html` | 管理端（Vite 热更新） |
| `http://127.0.0.1:3001` | 服务端 API / Socket |

登录密钥 = `.env` 里的 `ADMIN_TOKEN`。

### 4.5 构建后本地运行

```bash
npm run build
npm start
```

管理端由服务端直接托管：`http://localhost:3001/admin.html`。

### 4.6 无 Key 演示

```bash
# 保持 Key 为占位即可；或在 .env 里
AGENT_OFFLINE=true
npm run dev
```

6 个内置策略 Agent 会按人格偏好投资、出价、转账并完成整局。

---

## 5. 配置速查

| 变量 | 默认 | 说明 |
|------|------|------|
| `ADMIN_TOKEN` | — | 管理端登录密钥；同时用于 Orchestrator 自动开局/拍卖 |
| `PORT` | `3001` | 服务端端口 |
| `AGENT_ROOM_ID` | `agent-arena` | 6 个 Agent 共用的房间号 |
| `AGENT_SERVER_URL` | `http://127.0.0.1:3001` | Agent 连接地址 |
| `AGENT_n_API_KEY` | 占位 | 第 n 个 Agent 的 Key；占位时回退内置策略 |
| `AGENT_n_BASE_URL` | 空 | 单个 Agent 的 OpenAI 兼容端点 |
| `AGENT_n_MODEL` | `gpt-4o` | 单个 Agent 的模型 |
| `AGENT_TEMPERATURE` | `0.7` | 采样温度 |
| `AGENT_AUTO_START` | `true` | 6 人就座后自动开局 |
| `AGENT_AUTO_RESTART` | `false` | 一局结束后 10 秒自动开下一局 |
| `AGENT_AUTO_AUCTION` | `true` | 由 Orchestrator 自动主持拍卖 |
| `AGENT_FALLBACK_POLICY` | `true` | 调用失败时是否回退内置策略 |
| `AGENT_OFFLINE` | `false` | 强制只用内置策略 |
| `AGENT_DECISION_TIMEOUT_MS` | `90000` | 单次模型调用超时 |
| `AGENT_ACTION_DELAY_MIN/MAX_MS` | `700 / 2200` | 拟人延迟范围 |
| `AGENT_AUCTION_PASS_WINDOW_MS` | `45000` | 无人出价多久后跳过 |
| `AGENT_AUCTION_HAMMER_WINDOW_MS` | `18000` | 最后一口后多久落槌 |
| `AGENT_AUCTION_MAX_DECISIONS` | `3` | 单个 Agent 在同一张卡上的最多决策次数 |

6 名 Agent 的姓名、人格、风格、拍卖预算比例、风险偏好：`agents/agents.config.json`。

---

## 6. 一局怎么走

1. 服务端启动，Orchestrator 以管理身份连接并鉴权。
2. 6 个 Agent 用 `AGENT_ROOM_ID` 加入同一房间；房间不存在时自动创建。
3. 6 人全部就座后，Orchestrator 自动开局（`AGENT_AUTO_START`）。
4. 每个时代 2 轮：
   - `ERA_INTRO`（读时代卡，全员准备）
   - `INVESTMENT`（含道具与咖啡；全员提交/锁定后立即结算）
   - `SETTLEMENT`（全员准备后进入下一轮或拍卖）
5. 时代 2、3、4 开始前各有一场拍卖（共 3 场）。
6. 4 个时代 × 2 轮 = **8 个全局轮**，随后 `COMMUNITY_NAMING`（当前首富命名）→ `GAME_OVER`。
7. `AGENT_AUTO_RESTART=true` 时，10 秒后自动开下一局。

投资倒计时：首轮 12 分钟，其余 10 分钟；**全员就绪会立即推进**，不必等满。

> 引擎内部 `eraSequence` 有 5 张时代卡，但 `currentEra > 4` 即结束，因此第 5 个时代当前不会被玩到。

---

## 7. 数据与导出

### 7.1 管理端导出

- **进行中房间**：房间页 →「导出数据」→ 先 JSON，再点一次导出 Excel。
- **已完成场次**：管理端「场次记录」→ 选择场次 → 导出 JSON / XLSX；也可标记剔除（移出社区财富榜）。

导出接口均需 `ADMIN_TOKEN`。

### 7.2 XLSX 工作表

`概览`、`玩家`、`事件`、`结算`、`转账`、`群聊`、`项目`、`出价明细`、`成交`、`出价摘要`、`彩票`。

Agent 专属列：`Agent`、`Agent序号`、`Agent人格`、`Agent模型`。

> 群聊表当前为空，因为群聊开关 `GROUP_CHAT_ENABLED=false`；且 Agent 尚未实现发言。

### 7.3 落盘位置

| 数据 | 位置 | 是否提交 |
|------|------|----------|
| 已完成场次归档 | `server/data/session_archive.json` | 否 |
| Agent 运行日志 | `logs/agents-*.jsonl`、`logs/smoke-*.log` | 否 |
| 管理端构建 | `frontend/dist/` | 否 |

归档是已完成场次的唯一持久化真相；进行中的房间只在内存，服务重启即消失。

### 7.4 Agent 决策记录现状

- `logs/agents-*.jsonl` 会记录每次投资方案（含 `reasoning`）、出价、转账接受/拒绝、阶段变化。
- 这些**不在** JSON/XLSX 导出里；导出目前只有服务端事件与游戏状态。
- 提示词、原始模型输出、token 用量尚未进入结构化记录，只有 `llm.ts` 的成功/失败日志。

数据原则与父仓库保持一致：只记可核对的事实，不在留存阶段写推断型标签。详见 `../数据留存与导出说明.md` 与 `../追踪数据清单.md`。

---

## 8. 当前完成度（2026-11-04 审计）

### 已可用

| 能力 | 说明 |
|------|------|
| 6 Agent 同房对局 | 独立连接、独立玩家视角、独立配置 |
| 全流程推进 | 投资、道具、咖啡、结算、拍卖、命名、游戏结束 |
| 自动主持 | 自动开局、拍卖定焦点/跳过/落槌、可选自动重开 |
| 断线重连 | Agent 保存 `reconnectToken`；重复进程会触发设备认领提示 |
| 管理端 | 登录、观战、开局、跳阶段、计时、踢人、导出 |
| 导出 | JSON + 11 个工作表的 XLSX |
| 内置策略 | 无 Key 也能完局，按人格偏好行动 |
| 工程健康 | 三端可编译；服务端 251 个测试全通过 |

### 部分完成 / 未验证

| 能力 | 状态 | 缺口 |
|------|------|------|
| LLM 决策 | ⚠️ 未验证 | Key 为占位；真实模型下的 JSON 稳定性、延迟、成本未知 |
| 混合模式 | ⚠️ 部分 | `AGENT_OFFLINE` 是全局开关，不能「3 个规则 + 3 个 LLM」 |
| 转账 | ✅ 可用 | 接受转账无成本，作为「信任」指标偏弱 |
| 拍卖主持 | ⚠️ 可用但脆弱 | 卡池在 `orchestrator.ts` 中硬编码，与服务端逻辑重复，易漂移 |
| 数据导出 | ✅ 原始数据丰富 | 没有计算后的社会指标 |

### 尚未实现

| 能力 | 影响的计划部分 |
|------|----------------|
| 公开 / 私聊发言 | 沟通、说服、欺骗、承诺兑现、联盟 |
| 跨轮记忆与复盘 | 声誉、报复、路径依赖、适应 |
| 对手模型 / 意图预测 | 心智理论 RQ、预测准确率 |
| 承诺与联盟记录 | 合作率、联盟持续时间、背叛 |
| 社会网络与指标计算 | 关系结构、中心度、角色视图 |
| 固定随机种子 | 可复现实验、同种子重复 |
| 实验清单 / 批量运行 | 多条件对比、重复多局 |
| Token / 成本预算 | 成本风险控制 |
| 玩家视角隐藏 Agent 人格 | 角色涌现研究的混淆控制 |

---

## 9. 已知限制与风险

1. **LLM 路径未实测**：当前所有端到端结论都来自内置策略，不能当作「LLM 社会行为」的证据。
2. **人格提示词会污染「角色涌现」**：Agent 一开始就被写成「长期主义者 / 精算师」，观察到的差异可能只是指令遵循。研究上必须加入中立人格条件。
3. **没有沟通**：计划中大量指标（承诺、欺骗、联盟、说服）目前无法计算。
4. **没有记忆**：每轮决策只看当前快照 + 最近 12 条日志，不存在跨轮声誉或报复。
5. **不可复现**：项目抽卡、时代顺序、拍卖顺序都走 `Math.random()`，没有种子。
6. **信息泄漏**：玩家 `gameUpdate` 里仍带其他 Agent 的 `agentPersona` / `agentModel`，可能让 Agent 直接知道对手设定。
7. **主持逻辑重复**：Orchestrator 自己维护一份拍卖卡池与轮次映射，服务端规则变更时容易不同步。
8. **单实例限制**：内存态房间 + 单文件归档，不能开 cluster。
9. **安全边界**：目前 Agent 之间没有自由文本，提示注入面很小；一旦打开聊天，必须把消息当作不可信输入处理。
10. **第 5 时代未使用**：`eraSequence` 抽了 5 张，但流程在第 4 时代后结束。

---

## 10. 故障排查

| 现象 | 排查 |
|------|------|
| 3001 端口被占用 | `Get-NetTCPConnection -LocalPort 3001`；先结束旧的 node 进程 |
| 管理端登录一直「验证超时」 | 检查 `ADMIN_TOKEN` 是否与根 `.env` 一致；服务端是否已重新构建 |
| Agent 都连上但不开局 | `ADMIN_TOKEN` 为空/不一致，或 `AGENT_AUTO_START=false`；看 `logs/agents-*.jsonl` |
| 拍卖卡住 | `AGENT_AUTO_AUCTION=false` 或 Orchestrator 掉线；可在管理端手动定焦点/落槌 |
| 所有 Agent 都像「内置策略」 | Key 仍是占位，或 `AGENT_OFFLINE=true`；看启动日志的 Key 状态 |
| 出现 `deviceClaimPending` | 可能重复启动了 agents 进程；先杀掉旧进程再启动 |
| 上一进程被强杀后端口仍占用 | `taskkill /PID <pid> /T /F` |
| 想看 Agent 到底做了什么 | `logs/agents-<时间>.jsonl`（每次运行一个文件） |

---

## 11. 开发约定

- **父目录只读**：本目录可写；`../frontend`、`../server` 等父仓库文件不要改。
- **不提交**：`.env`、`logs/`、`server/data/session_archive.json`、各 `dist/`。
- **Node 版本**：`>=20 <23`，与 `package.json` 的 `engines` 保持一致。
- **服务端单实例**：不要用 `pm2 -i max`。
- **改动后至少跑**：

```bash
npm --prefix server run build
npm --prefix agents run build
npm --prefix server test
npm --prefix frontend run build
```

---

## 12. 相关文档

| 文档 | 内容 |
|------|------|
| [`初步计划.docx`](./初步计划.docx) | 原始立项计划（第 9 周） |
| [`计划修改.md`](./计划修改.md) | 基于现有原型的修订计划：质疑了哪些安排、为什么改、改成什么 |
| `../README.md` | 父仓库（线上版本）运行与部署说明 |
| `../数据留存与导出说明.md` | 数据原则：只记事实、不写推断标签 |
| `../追踪数据清单.md` | 当前已采集 / 待补的数据项 |
| `../产品演进方向.md` | 后续可能方向 |

---

## License

继承父仓库：MIT。
