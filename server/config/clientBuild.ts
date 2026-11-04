/** 与前端 dist/version.json buildId 一致；未设置则不校验 */
export function requiredClientBuildId(): string | undefined {
  const raw = process.env.REQUIRED_CLIENT_BUILD_ID?.trim();
  return raw || undefined;
}

export function isClientBuildStale(clientBuildId: unknown): boolean {
  const required = requiredClientBuildId();
  if (!required) return false;
  const client = typeof clientBuildId === "string" ? clientBuildId.trim() : "";
  if (client === "dev") return false;
  if (!client) return true;
  return client !== required;
}

export const CLIENT_UPDATE_MESSAGE =
  "客户端版本过旧，请刷新页面加载最新版本后再试。";
