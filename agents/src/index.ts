import { loadRuntimeConfig } from "./config.js";
import { createLogger, initFileLogging } from "./logger.js";
import { Orchestrator } from "./orchestrator.js";

const log = createLogger("main");

async function main(): Promise<void> {
  const runtime = loadRuntimeConfig();
  initFileLogging(runtime.logDir);

  log.info("光阴对赌 · Agent 运行时");
  log.info(`房间：${runtime.roomId}`);
  log.info(`服务端：${runtime.serverUrl}`);
  for (const a of runtime.agents) {
    const keyState = runtime.offlineMode ? "内置策略" : a.apiKey ? "已配置 API Key" : "缺少 Key";
    log.info(`  #${a.index} ${a.name} / ${a.persona} / ${a.model} / ${keyState}`);
  }
  if (runtime.offlineMode) {
    log.warn("当前为离线/内置策略模式：不会调用大模型。填写根目录 .env 的 6 个 API Key 后重启即可启用 LLM。");
  }

  const orchestrator = new Orchestrator(runtime);
  orchestrator.start();

  const shutdown = () => {
    log.info("收到退出信号，正在关闭…");
    orchestrator.stop();
    setTimeout(() => process.exit(0), 300);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  log.error("启动失败", e instanceof Error ? e.stack : e);
  process.exit(1);
});
