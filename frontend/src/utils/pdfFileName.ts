/** 生成安全、可跨平台保存的 PDF 文件名（不含路径） */
export function buildCollectionManualFileName(playerName: string): string {
  const segment = (playerName.trim() || "玩家")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return `人生决策藏品手册_${segment}.pdf`;
}
