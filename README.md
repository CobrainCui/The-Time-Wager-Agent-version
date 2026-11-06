# 光阴对赌 · Agent 实验室版（agent-edition）

> 6 个独立 LLM 玩家在同一局《光阴对赌》中完成 **4 时代 × 2 轮 = 8 轮**投资、3 场拍卖和社区命名；
> 管理员观察、控场、导出可直接用于分析的事件级数据。
>
> 本目录是父仓库 `光阴对赌新新新` 的实验分支副本，**只用于本地实验，不参与线上部署**。

---

## 0. 这一版和上一版的区别

上一版是「能跑完整局的 Agent Demo」。这一版按**实验室工具**重做，核心变化：

| 项目 | 上一版 | 本版 |
|------|--------|------|
| 缺 Key 时 | 回退内置规则策略，静默跑完 | **直接报错退出**，不产生伪数据 |
| LLM 调用失败 | 回退规则策略 | 重试后仍失败 → **终止本局并标记失败** |
| Agent 人格 | 6 套预置人格提示词 | **全部中立**，只有座位编号；差异只来自模型/供应商与对局经历 |
| Harness | 各 Agent 略有差异 | **同一套系统提示词、同一套能力开关、同一温度、同一 token 预算** |
| 沟通 | 群聊开关关闭 | **公开群聊 + 自定义群 + 一对一私聊全开**，Agent 可自己拉群，发言进入导出 |
| 记忆 | 无 | 每 Agent 一份滚动结构化记忆，落盘可审计 |
| 心智理论 | 无测量 | 每个时代开始前**显式预测最终六人排名**，Kendall τ / MAE 计分 |
| 随机性 | `Math.random()` | **`GAME_SEED` 可复现**：时代顺序、项目发牌、派生局种子 |
| 实验管理 | 手工点 | `npm run experiment`：条件清单、N 局、manifest、归档、汇总 CSV |
| 成本 | 只有超时 | **每 Agent 每局 token 上限**，超限终止本局 |
| 观察盲区 | 玩家能看到他人 Agent 人格/模型 | 玩家视角**隐藏** `isAgent/isAI/agentIndex/agentModel/agentProvider` |
| 导出 | 11 个原始表 | 增加 **指标、私聊、预测、Agent决策、指标汇总** |
| 管理员分析 | 只有原始记录 | 历史场次内直接看**条件/种子/模型/指标/预测评分** |

---

## 1. 它是什么，不是什么

**是：**

- 一个可复现、可审计的多 Agent 社会博弈实验台。
- 6 个 Agent 各自持有独立 Socket 连接、独立上下文、独立记忆文件，进入同一房间。
- 一局 8 轮，含 3 场拍卖；玩家间可公开聊天、私聊、转账、自己拉群、使用干扰卡。
- 彩票与产品版同规则：服务端线上随机掷骰（random.org 失败退回加密随机），随机源与点数写入导出。
- 管理端保留上帝视角：看局面、看预测与决策、控场、导出 JSON + XLSX。

**不是：**

- 不是面向人类玩家的线上版本；玩家端源码保留，但构建产物只有 `admin.html`。
- 不是多实例生产服务；服务端状态在内存、归档文件非多进程安全，**只能单实例运行**。
- 不是「模型能力排行榜」。它测量的是特定规则、特定提示词、特定模型在局中的行为签名。
- 不使用规则策略兜底。**没有 LLM，就没有这一局。**

---

## 2. 目录结构

```text
agent-edition/
├─ .env / .env.example        # 根配置：ADMIN_TOKEN、6 个 Agent 的 Key/端点/模型、实验参数
├─ package.json               # setup / dev / build / start / experiment
├─ scripts/
│  ├─ experiment.mjs          # 实验运行器：N 局、manifest、归档、summary.csv
│  ├─ analyze.mjs             # 批量分析：dataset / condition_summary / prediction_by_era
│  ├─ mock-llm.mjs            # 仅用于冒烟测试的 OpenAI 兼容 mock
│  ├─ dev.mjs / start.mjs     # 本地开发 / 构建后运行
│  └─ process.mjs             # 子进程与 killTree
├─ agents/                    # Agent 运行时（所有 Agent 同一套 harness）
│  ├─ agents.config.json      # 只有编号与中性名称，不含人格
│  └─ src/
│     ├─ orchestrator.ts      # 建房、自动开局、拍卖控场、局数控制
│     ├─ agentClient.ts       # 连接、观察、决策、聊天、预测、记忆更新
│     ├─ memory.ts            # 每 Agent 的结构化滚动记忆（JSONL 落盘）
│     ├─ prompts.ts           # 统一中立提示词 + 不可信聊天包装
│     ├─ llm.ts               # 重试、超时、token 预算、失败即终止
│     └─ observation.ts       # 从 gameUpdate 裁剪出「自己的视角」
├─ server/                    # 游戏服务端（规则、阶段、聊天、预测、导出）
│  ├─ analysis/metrics.ts     # 社会指标与预测评分
│  ├─ logic/directMessages.ts # 一对一私聊
│  ├─ logic/chatQuota.ts      # 每轮聊天配额
│  ├─ config/experiment.ts    # 实验元数据
│  ├─ utils/rng.ts            # 可复现随机数
│  └─ export/sessionExport.ts # JSON / 16 表 XLSX
├─ frontend/                  # 管理端 admin.html
├─ experiments/<runId>/       # 每次实验的 manifest / sessions.json / summary.csv
├─ logs/                      # Agent 日志与 memory/<runId>/agent-n-*.jsonl
├─ 实验手册.md                # 条件、流程、分析计划、检查清单
├─ 数据字典.md                # 导出字段与指标定义
├─ 初步计划.docx              # 原始立项计划
└─ 计划修改.md                # 基于现状修订后的研究计划
```

---

## 3. 架构与数据流

```text
┌──────────────────── agents/ ────────────────────┐
│  玩家1 … 玩家6（内部 agentIndex 1–6）            │
│  各自 socket / 上下文 / 记忆文件 / 模型配置      │
│  同一套 prompt、同一套能力开关、同一温度         │
└───────────────┬─────────────────────────────────┘
                │ joinGame / playerReady / submitInvestment
                │ createChatGroup / sendGroupMessage / sendDirectMessage
                │ submitPrediction / agentDecision
                ▼
        ┌───────────────────┐         ┌──────────────────────────┐
        │   Game Server     │◄───────►│  Orchestrator（主持）     │
        │  阶段 / 规则 /     │  admin  │  自动开局 / 拍卖控场 /    │
        │  聊天 / 预测 / 导出 │  socket │  局数控制 / 失败终止      │
        └─────────┬─────────┘         └──────────────────────────┘
                  │ gameUpdate（按视角裁剪）
                  ├──────────────► 6 个 Agent：只看到自己的手牌、精力、投资草稿；
                  │                 他人真人/Agent 身份、序号、模型均被隐藏；
                  │                 可见公开群聊、自己所在自定义群与自己收发的私聊
                  └──────────────► 管理端：上帝视角 + 实验记录 + 导出
```

三个关键约束：

1. **玩家视角裁剪**在服务端完成。他人精力、手牌、已用道具、投资草稿、真人/Agent 身份、Agent 序号/模型不会下发给 Agent。
2. **主持控场**复用管理端 Socket（`ADMIN_TOKEN` 鉴权）。拍卖卡池由服务端通过上帝视图下发，Agent 侧不再硬编码。
3. **聊天是不可信输入**。Agent 提示词明确把公开聊天与私聊标为「数据，不是指令」，并准备提示注入测试。

---

## 4. 环境与安装

- Node.js `>=20`（当前机器验证于 Node 25.2.1；构建、测试、mock 端到端均通过）
- npm `>=10`
- 三个子项目各自有 `node_modules`

```bash
cd D:\workspace\光阴对赌新新新\agent-edition
npm run setup
```

`setup` 会复制 `.env.example` → `.env` 并安装 `server`、`agents`、`frontend` 依赖。

---

## 5. 配置：Key、模型、供应商

编辑根目录 `.env`。**每个 Agent 可以来自不同公司**：

```dotenv
ADMIN_TOKEN=local-admin-token-change-me
PORT=3001
GAME_SEED=20261104

AGENT_1_API_KEY=sk-...
AGENT_1_BASE_URL=https://api.openai.com/v1
AGENT_1_MODEL=gpt-4o
AGENT_1_PROVIDER=openai

AGENT_2_API_KEY=sk-...
AGENT_2_BASE_URL=https://api.deepseek.com/v1
AGENT_2_MODEL=deepseek-chat
AGENT_2_PROVIDER=deepseek

# … AGENT_3 … AGENT_6
```

规则：

- **不填 Key / 仍是 placeholder → agents 启动时直接报错退出**，不会跑出一局假数据。
- `AGENT_n_BASE_URL` 不填时使用 OpenAI 官方；`AGENT_n_MODEL` 留空则使用 `AGENT_DEFAULT_MODEL`。
- 逐 Agent 的 `AGENT_n_MODEL` **优先于** `AGENT_DEFAULT_MODEL`；混模型实验才逐个填。
- `AGENT_n_PROVIDER` 只用于导出与 manifest；不填时从 BASE_URL 主机名推断。
- 所有 Agent 使用同一个 `AGENT_TEMPERATURE`。不要给单个 Agent 单独设温度，否则 harness 不再一致。
- `AGENT_TOKEN_BUDGET` 是每 Agent 每局上限；超限终止本局。
- `AGENT_MAX_RETRIES` 是网络/JSON 重试次数；重试耗尽仍失败 → 终止本局。

完整变量见 `.env.example`。

填完后先自检（不会打印完整 Key）：

```bash
npm run build
npm run check-ai
npm run check-ai -- --ping   # 6 个 Agent 各实际调用一次
```

---

## 6. 怎么跑

### 6.1 冒烟测试（不需要真实 Key）

```bash
npm run experiment -- --mock --games 1 --condition smoke
```

它启动一个本地 OpenAI 兼容 mock，只验证「连接 → 提示词 → JSON → 动作 → 聊天 → 预测 → 结算 → 导出」链路。
**mock 数据不能用于研究。**

### 6.2 正式实验

```bash
# 例：C1 沟通条件，5 局，固定种子
npm run experiment -- --condition C1 --games 5 --seed 20261104

# 例：C0 基线（关闭聊天）
npm run experiment -- --condition C0 --games 5 --seed 20261104 --no-chat

# 例：混模型条件（在 .env 里给 6 个 Agent 配不同供应商/模型；C2 按手册关闭聊天）
npm run experiment -- --condition C2 --games 3 --seed 20261104 --no-chat
```

运行器会：

1. 构建三端（可加 `--no-build` 跳过）；
2. 生成 `experiments/<runId>/manifest.json`（条件、种子、模型、提示词版本、git commit、token 预算等）；
3. 启动 server + agents，自动跑 N 局；
4. 结束后把本次 run 的归档写入 `sessions.json`，并生成 `summary.csv` 与自动 QC `qc.csv`；
5. 任一 Agent 模型失败 → 退出码 2，本次 run 失败并保留日志；未归档的局不会出现在 `sessions.json`。

> 不要同时开两个 `npm run experiment`：服务端是单实例、端口 3001，第二个 run 会连到第一个服务端并污染实验元数据。
> 按 `Ctrl+C` 会清理子进程；server 异常退出时本次 run 会立即失败，不会静默等满超时。

### 6.3 交互式本地运行

```bash
npm run dev
```

| 地址 | 用途 |
|------|------|
| `http://localhost:5173/admin.html` | 管理端（Vite 热更新） |
| `http://127.0.0.1:3001` | 服务端 API / Socket |

登录密钥 = `.env` 里的 `ADMIN_TOKEN`。没有真实 Key 时 agents 会直接退出，这是预期行为。

### 6.4 构建后运行

```bash
npm run build
npm start
```

管理端由服务端托管：`http://localhost:3001/admin.html`。

**只想查看历史/导出、不想再跑 AI**：只启动服务端，不要用 `npm start`（它会同时启动 agents）：

```bash
npm run server
```

然后打开 `http://localhost:3001/admin.html`，用 `.env` 里的 `ADMIN_TOKEN` 登录。

### 6.5 批量分析

```bash
# 汇总所有 experiments 下的数据
npm run analyze

# 只分析某个 run
npm run analyze -- --run finalcheck-424242-2026-11-04_03-40-18-687

# 排除 mock 数据，输出到指定目录
npm run analyze -- --exclude-mock --out analysis/2026-11-04
```

输出（`analyze` 只写这 4 个文件）：

- `dataset.csv`：每局每玩家一行；
- `condition_summary.csv`：每条件均值 + 局内分化；
- `prediction_by_era.csv`：按时代的预测 τ/MAE；
- `summary.json`：机器可读汇总。

`summary.csv` 与 `qc.csv` 是 `npm run experiment` 写到 `experiments/<runId>/` 的，不在 `analysis/` 输出目录里。

### 6.6 社交行为评定

按每名 Agent 自己发出的**群聊 + 私信**，用同一模型评 A–E，并写入该 run 目录：

```bash
npm run social-score -- --run finalcheck-424242-2026-11-04_03-40-18-687
```

输出 `experiments/<runId>/social_scores.csv`（玩家、档位、依据、发言数）。无发言按中性 C。

`dataset.csv` 可直接导入 R/Python 做 bootstrap、混合效应模型或绘图。

---

## 7. 一局怎么走

1. 服务端启动，Orchestrator 以管理身份连接并鉴权。
2. 6 个 Agent 用 `AGENT_ROOM_ID` 加入同一房间；全 Agent 房间按 `agentIndex` 固定座位。
3. 6 人全部就座后，Orchestrator 自动开局。
4. 每个时代 2 轮：
   - `ERA_INTRO`：Agent 先提交**最终排名预测**，再准备；
   - `INVESTMENT`：Agent 可发公开消息/私聊、转账、买咖啡、用道具、提交投资；
   - `SETTLEMENT`：结算，Agent 把本轮结果写入记忆并准备。
5. 时代 2、3、4 开始前各有一场拍卖（共 3 场）。
6. 4 个时代 × 2 轮 = **8 个全局轮**，随后 `COMMUNITY_NAMING`（在线首富命名）→ `GAME_OVER`。
7. `AGENT_AUTO_RESTART=true` 时自动开下一局；`AGENT_GAME_LIMIT` 控制总局数。

> 引擎的时代序列只取 4 张时代卡；第 5 张不会进入对局，避免「抽了但永远玩不到」。
> 第 4 时代第 2 轮结算后直接进入命名，`globalRound` 保持 8，不会出现第 9 轮。

---

## 8. 数据与导出

### 8.1 从哪里导出

- **进行中房间**：管理端房间页 →「导出数据」→ JSON / XLSX。
- **已完成场次**：管理端「场次记录」→ 选择场次 → 导出 JSON / XLSX；详情面板内还有「实验分析」。
- 接口均需 `ADMIN_TOKEN`。

### 8.2 XLSX 工作表（16 个）

`概览`、`玩家`、`指标汇总`、`指标`、`事件`、`结算`、`转账`、`群聊`、`私聊`、`预测`、`Agent决策`、`项目`、`出价明细`、`成交`、`出价摘要`、`彩票`。

关键列：

- **概览**：`sessionId`、`condition`、`seed`、`runId`、`models`、`promptVersion`、`promptHash`、`experiment`。
- **指标**：每名玩家的财富/名次、长期/短期/风险占比、转账收发与回报率、公开/私聊条数、拍卖次数/花费、干扰次数、预测 τ/MAE、出度/入度。
- **预测**：每条预测的排名、理由、Kendall τ、名次 MAE。
- **Agent决策**：每次 LLM 决策的类型、推理、动作、模型、token、延迟。
- **私聊**：发送者、接收者、内容、轮次；与转账分开，避免把 0 元转账当私聊。

### 8.3 落盘位置

| 数据 | 位置 | 是否提交 |
|------|------|----------|
| 已完成场次归档 | `server/data/session_archive.json` | 否 |
| 实验 run | `experiments/<runId>/` | 否 |
| 自动 QC | `experiments/<runId>/qc.csv` | 否 |
| 社交评定 | `experiments/<runId>/social_scores.csv` | 否 |
| Agent 运行日志 | `logs/agents-*.jsonl` | 否 |
| Agent 记忆 | `logs/memory/<runId>/agent-n-*.jsonl` | 否 |
| 管理端构建 | `frontend/dist/` | 否 |

归档是已完成场次的唯一持久化真相；进行中的房间只在内存，服务重启即消失。

> mock 场次会在管理端显示 `MOCK` 徽标；正式分析请用 `npm run analyze -- --exclude-mock` 排除。

### 8.4 数据原则

- 原始行为与派生指标分开：`transactions / groupMessages / directMessages / predictions / agentDecisions` 是事实；`metrics` 是派生。
- 不在采集阶段写「角色标签」。规则引擎生成的「命运素描/决策基因」只是分析标签，不是事实，也不应反推现实人格。
- 聊天内容导出前做敏感词掩码；研究展示时仍需匿名化。

详见 [`数据字典.md`](./数据字典.md)。

---

## 9. 当前完成度（2026-11-04）

### 已实现并验证

| 能力 | 状态 |
|------|------|
| 6 Agent 同房、8 轮、3 场拍卖、命名、结束 | ✅ mock 端到端 2 局通过 |
| 严格 LLM-only、缺 Key 报错、失败终止 | ✅ 已用 mock 500 验证退出码 2 |
| 同一 harness、无预置人格 | ✅ 配置与提示词已统一 |
| 公开群聊 + 自定义群 + 一对一私聊 | ✅ 每局 48 条公开 + 24 条私聊 + 群聊（mock）；Agent 可自己拉群 |
| 结构化记忆 | ✅ `logs/memory/<runId>/agent-n-*.jsonl` |
| 每时代排名预测 | ✅ 每局 24 条（6 Agent × 4 时代） |
| 可复现种子 | ✅ 同 seed 派生局种子、时代顺序、项目发牌 |
| 实验 manifest / N 局 / summary.csv | ✅ |
| 自动 QC（`qc.csv`） | ✅ 人数/轮次/预测/聊天/决策/token/mock |
| token 预算 | ✅ 超限终止 |
| 玩家视角隐藏真人/Agent 身份与模型 | ✅ 不下发 `isAgent/isAI/agentIndex/agentModel/agentProvider`；规则文本也做同义清洗 |
| 管理员分析视图 | ✅ 条件/种子/模型/指标/预测评分 |
| 服务端测试 | ✅ 316 / 316（产品服务端） |
| 三端构建 | ✅ |

### 仍需真实 Key 验证

| 能力 | 说明 |
|------|------|
| 真实模型 JSON 稳定性 | 不同供应商对 `response_format` 支持不同；已做重试与语义校验，但需实测失败率 |
| 真实模型延迟/成本 | mock 的 token 数只用于链路验证 |
| 真实社会行为 | mock 数据不能用于研究结论 |

### 已知限制

1. **单实例**：内存态房间 + 单文件归档，不能开 cluster。
2. **样本量**：每局 n=6，跨局稳定性需要多局；不要做「发现 N 种角色」的强结论。
3. **无跨局记忆**：记忆只在单局内滚动；跨局学习是后续工作。
4. **无结构化联盟/合同**：承诺、联盟只能从聊天与行为事后编码。
5. **无独立回放 UI**：JSON 事件流可还原，UI 回放未做。
6. **聊天是攻击面**：已做不可信输入包装与长度/频率限制，但仍需持续做注入测试。
7. **模型采样差异**：固定种子只能复现结构性随机，不能复现模型采样；同条件多局是必要的。

---

## 10. 故障排查

| 现象 | 排查 |
|------|------|
| `API Key 未填写或仍是占位值` | 这是预期行为：填 `.env` 的 6 个 Key；或先用 `--mock` 冒烟 |
| `AGENT_DEFAULT_MODEL` 为空 | 设置 `AGENT_DEFAULT_MODEL`，或给 6 个 Agent 分别设置 `AGENT_<n>_MODEL` |
| 启动后 90s 仍未开局 | 检查是否有 Agent 未入座（昵称冲突 / Key 缺失 / 服务端未启动）；可用 `AGENT_JOIN_TIMEOUT_MS` 调整 |
| 实验退出码 2 | 模型调用失败/输出语义无效/token 超限/就座超时；看 `logs/agents-*.jsonl` |
| 退出码 3 | 完成的局数少于请求局数；看 `experiments/<runId>/run.json` |
| 3001 端口被占用 | `Get-NetTCPConnection -LocalPort 3001`；先结束旧 node 进程 |
| 管理端登录超时 | 检查 `ADMIN_TOKEN` 是否与根 `.env` 一致；服务端是否已构建 |
| 拍卖卡住 | Orchestrator 未连上管理端，或 `ADMIN_TOKEN` 不一致；看 agent 日志 |
| 想看 Agent 到底做了什么 | `logs/agents-<时间>.jsonl` 与 `logs/memory/<runId>/` |
| 想看某局的完整数据 | 管理端场次记录 → 详情 → 导出 JSON/XLSX / 实验分析 |

---

## 11. 开发约定

- **父目录只读**：本目录可写；`../frontend`、`../server` 等父仓库文件不要改。
- **不提交**：`.env`、`logs/`、`experiments/`、`server/data/session_archive.json`、各 `dist/`。
- **Node 版本**：`>=20`。
- **服务端单实例**：不要用 `pm2 -i max`。
- **改动后至少跑**：

```bash
npm --prefix server test
npm --prefix agents run build
npm --prefix frontend run build
npm run experiment -- --mock --games 1 --condition smoke --no-build
```

---

## 12. 相关文档

| 文档 | 内容 |
|------|------|
| [`审查与修复.md`](./审查与修复.md) | 2026-11 对 Agent 运行时、导出元数据、指标口径的审查与修复记录 |
| [`实验手册.md`](./实验手册.md) | 研究问题、条件、流程、样本量、分析计划、检查清单 |
| [`数据字典.md`](./数据字典.md) | 导出字段、事件类型、指标定义、分析建议 |
| [`计划修改.md`](./计划修改.md) | 对原立项计划的逐条质疑与修订 |
| [`初步计划.docx`](./初步计划.docx) | 原始立项计划（第 9 周） |
| `../README.md` | 父仓库（线上版本）运行与部署说明 |
| `../数据留存与导出说明.md` | 数据原则：只记事实、不写推断标签 |
| `../追踪数据清单.md` | 当前已采集 / 待补的数据项 |

---

## License

继承父仓库：MIT。
