export const PUBLIC_GROUP_ID = "__public__";

export const GROUP_THREAD_PREFIX = "g:";

export function groupThreadId(groupId: string): string {
  return `${GROUP_THREAD_PREFIX}${groupId}`;
}

export function parseGroupThreadId(threadId: string): string | null {
  if (!threadId.startsWith(GROUP_THREAD_PREFIX)) return null;
  return threadId.slice(GROUP_THREAD_PREFIX.length);
}

export function isGroupThreadId(threadId: string): boolean {
  return threadId.startsWith(GROUP_THREAD_PREFIX);
}
