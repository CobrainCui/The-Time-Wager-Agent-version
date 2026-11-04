/** 与 Vite BASE_URL 对齐的静态资源路径（PDF 模板、默认立绘等） */
export function publicAssetUrl(path: string): string {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}${normalized}`;
}
