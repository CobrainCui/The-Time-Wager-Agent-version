import { APP_BUILD_ID } from "./appBuildId";

export type AppUpdateMode = "player" | "admin";

const RELOAD_ATTEMPT_KEY = "gydd_app_update_reload";
const POLL_MS = 5 * 60 * 1000;
const VISIBILITY_DEBOUNCE_MS = 1000;

let playerDeferAutoReload = false;
let updateFlowActive = false;

/** 投资/教程等有输入的阶段：前台轮询只提示，不自动刷新 */
export function setPlayerDeferAppReload(defer: boolean): void {
  playerDeferAutoReload = defer;
}

function isChunkLoadError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("loading chunk") ||
    m.includes("importing a module script failed") ||
    m.includes("error loading dynamically imported module")
  );
}

function isAssetScriptError(event: ErrorEvent): boolean {
  const target = event.target;
  if (target instanceof HTMLScriptElement && target.src.includes("/assets/")) return true;
  const src = event.filename ?? "";
  return src.includes("/assets/") && src.endsWith(".js");
}

function reloadAttemptKey(remoteBuildId: string): string {
  return `${RELOAD_ATTEMPT_KEY}:${APP_BUILD_ID}->${remoteBuildId}`;
}

function hasAttemptedReload(remoteBuildId: string): boolean {
  try {
    return sessionStorage.getItem(reloadAttemptKey(remoteBuildId)) === "1";
  } catch {
    return false;
  }
}

function markReloadAttempted(remoteBuildId: string): void {
  try {
    sessionStorage.setItem(reloadAttemptKey(remoteBuildId), "1");
  } catch {
    /* ignore */
  }
}

function ensureOverlay(): HTMLDivElement {
  let el = document.getElementById("app-update-overlay") as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement("div");
  el.id = "app-update-overlay";
  el.setAttribute("role", "alertdialog");
  el.setAttribute("aria-label", "客户端更新");
  Object.assign(el.style, {
    position: "fixed",
    inset: "0",
    zIndex: "100000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5rem",
    background: "rgba(7, 11, 20, 0.88)",
    backdropFilter: "blur(8px)",
  });
  document.body.appendChild(el);
  return el;
}

function showUpdateOverlay(
  mode: AppUpdateMode,
  remoteBuildId: string,
  options: { autoReload: boolean },
): void {
  const overlay = ensureOverlay();
  const attempted = hasAttemptedReload(remoteBuildId);

  if (options.autoReload && !attempted) {
    overlay.innerHTML = `
      <div style="max-width:22rem;text-align:center;color:#e2e8f0;font-family:var(--font-sans,sans-serif);line-height:1.55">
        <div style="font-size:1.15rem;font-weight:800;margin-bottom:0.5rem;color:#93c5fd">发现新版本</div>
        <p style="margin:0 0 1rem;font-size:0.95rem;color:var(--color-text-secondary,#94a3b8)">正在更新客户端，请稍候…</p>
      </div>`;
    markReloadAttempted(remoteBuildId);
    window.setTimeout(() => window.location.reload(), 400);
    return;
  }

  overlay.innerHTML = `
    <div style="max-width:24rem;text-align:center;color:#e2e8f0;font-family:var(--font-sans,sans-serif);line-height:1.55">
      <div style="font-size:1.15rem;font-weight:800;margin-bottom:0.5rem;color:#93c5fd">发现新版本</div>
      <p style="margin:0 0 1rem;font-size:0.9rem;color:var(--color-text-secondary,#94a3b8)">
        ${mode === "player" && playerDeferAutoReload
          ? "当前对局进行中，请在本轮操作提交后再刷新，以免丢失未提交的输入。"
          : "请刷新页面以加载最新版本。"}
      </p>
      <button type="button" id="app-update-force-reload" style="
        margin:0 0 0.75rem;padding:0.55rem 1.25rem;border-radius:0.65rem;border:none;
        background:linear-gradient(135deg,#3b82f6,#6366f1);color:white;font-weight:700;cursor:pointer">
        立即刷新
      </button>
      <p style="margin:0;font-size:0.75rem;color:#64748b">若仍异常，可清除浏览器本站数据后重试。</p>
    </div>`;
  overlay.querySelector("#app-update-force-reload")?.addEventListener("click", () => {
    markReloadAttempted(remoteBuildId);
    window.location.reload();
  });
}

async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { buildId?: string };
    const id = data.buildId?.trim();
    return id || null;
  } catch {
    return null;
  }
}

function shouldAutoReload(mode: AppUpdateMode, trigger: "boot" | "poll" | "chunk" | "server"): boolean {
  if (trigger === "boot" || trigger === "chunk") return true;
  if (trigger === "server") return mode === "admin" || !playerDeferAutoReload;
  if (mode === "admin") return true;
  return !playerDeferAutoReload;
}

function beginUpdateFlow(
  mode: AppUpdateMode,
  remoteBuildId: string,
  trigger: "boot" | "poll" | "chunk" | "server",
): void {
  if (updateFlowActive) return;
  updateFlowActive = true;
  showUpdateOverlay(mode, remoteBuildId, { autoReload: shouldAutoReload(mode, trigger) });
}

async function checkForUpdate(mode: AppUpdateMode, trigger: "boot" | "poll" | "chunk"): Promise<void> {
  if (APP_BUILD_ID === "dev" || updateFlowActive) return;
  const remote = await fetchRemoteBuildId();
  if (!remote || remote === APP_BUILD_ID) return;
  beginUpdateFlow(mode, remote, trigger);
}

/** 服务端 REQUIRED_CLIENT_BUILD_ID 校验失败时调用 */
export function handleServerClientUpdateRequired(mode: AppUpdateMode): void {
  if (APP_BUILD_ID === "dev" || updateFlowActive) return;
  beginUpdateFlow(mode, "server-required", "server");
}

function registerUpdateListeners(mode: AppUpdateMode): void {
  let pollTimer: number | null = null;
  let visibilityTimer: number | null = null;

  const startPoll = () => {
    if (pollTimer) return;
    pollTimer = window.setInterval(() => {
      void checkForUpdate(mode, "poll");
    }, POLL_MS);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (visibilityTimer) window.clearTimeout(visibilityTimer);
    visibilityTimer = window.setTimeout(() => {
      void checkForUpdate(mode, "poll");
    }, VISIBILITY_DEBOUNCE_MS);
  });

  startPoll();

  window.addEventListener("error", (event) => {
    const msg = event.message || String(event.error ?? "");
    if (!isChunkLoadError(msg) && !isAssetScriptError(event)) return;
    void checkForUpdate(mode, "chunk");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? "");
    if (!isChunkLoadError(msg)) return;
    void checkForUpdate(mode, "chunk");
  });
}

export function initAppUpdate(mode: AppUpdateMode): void {
  if (APP_BUILD_ID === "dev") return;

  const start = () => {
    void checkForUpdate(mode, "boot");
    registerUpdateListeners(mode);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
