/** 道具选目标玩家下拉：仅昵称，不暴露他人精力（自己可标「自己」） */
export function formatBuffTargetPlayerOption(
  player: { id: string; name: string },
  viewerId: string,
  options?: { markSelf?: boolean }
): string {
  const markSelf = options?.markSelf ?? true;
  if (markSelf && player.id === viewerId) {
    return `${player.name}（自己）`;
  }
  return player.name;
}
