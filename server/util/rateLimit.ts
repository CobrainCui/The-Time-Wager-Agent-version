type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

/** 内存滑动窗口。单实例部署，重启即清空。 */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  const cutoff = now - windowMs;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= limit) return false;
  bucket.hits.push(now);
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}

/** 定期清掉不再活跃的 key，避免 Map 无限增长 */
export function sweepRateLimits(windowMs: number, now = Date.now()): void {
  const cutoff = now - windowMs;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((t) => t <= cutoff)) buckets.delete(key);
  }
}
