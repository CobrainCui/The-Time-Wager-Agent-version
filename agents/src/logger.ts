import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: LogLevel = (process.env.AGENT_LOG_LEVEL as LogLevel) || "info";

let logFile: string | null = null;

export function initFileLogging(logDir: string): void {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const name = `agents-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
    logFile = path.join(logDir, name);
    console.log(`[logger] 决策日志：${logFile}`);
  } catch (e) {
    console.warn("[logger] 无法创建日志目录，仅输出到控制台", e);
  }
}

function write(level: LogLevel, scope: string, message: string, data?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [${scope}]`;
  const line = `${prefix} ${message}`;
  if (level === "error") console.error(line, data ?? "");
  else if (level === "warn") console.warn(line, data ?? "");
  else console.log(line, data ?? "");

  if (logFile) {
    try {
      const record = { ts, level, scope, message, ...(data === undefined ? {} : { data }) };
      fs.appendFileSync(logFile, `${JSON.stringify(record)}\n`, "utf8");
    } catch {
      /* ignore log write failures */
    }
  }
}

export function createLogger(scope: string) {
  return {
    debug: (m: string, d?: unknown) => write("debug", scope, m, d),
    info: (m: string, d?: unknown) => write("info", scope, m, d),
    warn: (m: string, d?: unknown) => write("warn", scope, m, d),
    error: (m: string, d?: unknown) => write("error", scope, m, d),
  };
}
