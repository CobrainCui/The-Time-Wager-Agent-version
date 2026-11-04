import { loadRuntimeConfig } from "./config.js";
import { createLogger, initFileLogging } from "./logger.js";
import { Orchestrator } from "./orchestrator.js";

const log = createLogger("main");

async function main(): Promise<void> {
  const runtime = loadRuntimeConfig();
  initFileLogging(runtime.logDir);

  log.info("光阴对赌 · Agent 实验运行时（LLM-only，无规则兜底）");
  log.info(`房间：${runtime.roomId}`);
  log.info(`服务端：${runtime.serverUrl}`);
  log.info(
    `实验：run=${runtime.runId} | condition=${runtime.condition} | seed=${runtime.seed} | prompt=${runtime.promptVersion}`
  );
  log.info(
    `能力：chat=${runtime.chatEnabled} memory=${runtime.memoryEnabled} prediction=${runtime.predictionEnabled}`
  );
  for (const a of runtime.agents) {
    log.info(`  #${a.index} ${a.name} / ${a.provider} / ${a.model} / key=已配置`);
  }

  let exiting = false;
  const shutdown = (code: number, message?: string, isError = true) => {
    if (exiting) return;
    exiting = true;
    if (message) {
      if (isError) log.error(message);
      else log.info(message);
    }
    orchestrator.stop();
    setTimeout(() => process.exit(code), 500);
  };

  const orchestrator = new Orchestrator(runtime, {
    onComplete: (games) => shutdown(0, `实验完成：共 ${games} 局`, false),
    onFatal: (agentIndex, error) =>
      shutdown(2, `实验失败（agent ${agentIndex || "-"}）：${String(error)}`),
  });
  orchestrator.start();

  process.on("SIGINT", () => shutdown(130, "收到 SIGINT"));
  process.on("SIGTERM", () => shutdown(143, "收到 SIGTERM"));
}

main().catch((e) => {
  log.error("启动失败", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
