/**
 * 实验元数据：所有会影响结果解释的配置都必须进入导出。
 * 这些字段由实验运行器（scripts/experiment.mjs）写入环境变量。
 */

export interface ExperimentMeta {
  runId: string | null;
  condition: string | null;
  seedBase: number;
  seed: number;
  sessionOrdinal: number;
  manifestId: string | null;
  manifestPath: string | null;
  promptVersion: string | null;
  /** 提示词 + 规则文件的指纹，用于确认批次内未改提示词 */
  promptHash: string | null;
  /** 是否为 mock 冒烟运行；mock 数据不得进入正式分析 */
  mock: boolean;
  policyMode: "llm";
  gitCommit: string | null;
  nodeVersion: string;
  serverStartedAt: number;
}

function envText(key: string, maxLength = 200): string | null {
  const value = (process.env[key] ?? "").trim();
  return value ? value.slice(0, maxLength) : null;
}

export function experimentMetaForSeed(seedBase: number, seed: number, sessionOrdinal: number): ExperimentMeta {
  return {
    runId: envText("EXPERIMENT_RUN_ID", 120),
    condition: envText("EXPERIMENT_CONDITION", 120),
    seedBase,
    seed,
    sessionOrdinal,
    manifestId: envText("EXPERIMENT_MANIFEST_ID", 120),
    manifestPath: envText("EXPERIMENT_MANIFEST_PATH", 500),
    promptVersion: envText("AGENT_PROMPT_VERSION", 120),
    promptHash: envText("EXPERIMENT_PROMPT_HASH", 64),
    mock: process.env.EXPERIMENT_MOCK === "1",
    policyMode: "llm",
    gitCommit: envText("GIT_COMMIT", 80),
    nodeVersion: process.version,
    serverStartedAt: Number(process.env.SERVER_STARTED_AT) || Date.now(),
  };
}
