/** 右侧坞展示顺序：展开面板栈（仅用户打开时变序）+ 折叠 minibar（按最近消息） */

export function promoteExpandedStack(stack: string[], peerId: string): string[] {
  const rest = stack.filter((id) => id !== peerId);
  return [peerId, ...rest];
}

export function removeFromExpandedStack(stack: string[], peerId: string): string[] {
  return stack.filter((id) => id !== peerId);
}

export function bumpCollapsedRecency(order: string[], peerId: string): string[] {
  const rest = order.filter((id) => id !== peerId);
  return [peerId, ...rest];
}

export function mergePeerListIntoRecency(order: string[], peerIds: string[]): string[] {
  const kept = order.filter((id) => peerIds.includes(id));
  const missing = peerIds.filter((id) => !kept.includes(id));
  if (missing.length === 0) return order;
  return [...kept, ...missing];
}

export function buildDisplayOrder(
  peerIds: string[],
  expandedStack: string[],
  collapsedRecency: string[],
  isExpanded: (peerId: string) => boolean
): string[] {
  const expandedIds = peerIds.filter((id) => isExpanded(id));
  const collapsedIds = peerIds.filter((id) => !isExpanded(id));

  const expandedOrdered: string[] = [];
  for (const id of expandedStack) {
    if (expandedIds.includes(id) && !expandedOrdered.includes(id)) expandedOrdered.push(id);
  }
  for (const id of expandedIds) {
    if (!expandedOrdered.includes(id)) expandedOrdered.push(id);
  }

  const collapsedOrdered: string[] = [];
  for (const id of collapsedRecency) {
    if (collapsedIds.includes(id) && !collapsedOrdered.includes(id)) collapsedOrdered.push(id);
  }
  for (const id of collapsedIds) {
    if (!collapsedOrdered.includes(id)) collapsedOrdered.push(id);
  }

  return [...expandedOrdered].reverse().concat(collapsedOrdered);
}
