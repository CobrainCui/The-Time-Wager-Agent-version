import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function startProcess(name, command, args, cwd = root, env = {}) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, FORCE_COLOR: "1", ...env },
  });
  child.on("error", (err) => {
    console.error(`[${name}] 启动失败：`, err.message);
  });
  return child;
}

export function killTree(child) {
  if (!child || child.exitCode != null) return;
  try {
    if (process.platform === "win32" && child.pid) {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

export function ensureEnvFile() {
  const envPath = path.join(root, ".env");
  const examplePath = path.join(root, ".env.example");
  if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log("[setup] 已从 .env.example 生成 .env，请填写 6 个 API Key。");
  }
}

export function npmInstall(dir) {
  console.log(`[setup] npm install → ${path.relative(root, dir) || "."}`);
  execFileSync("npm", ["install"], {
    cwd: dir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

export { root };
