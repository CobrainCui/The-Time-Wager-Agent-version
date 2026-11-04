/**
 * 可复现随机数（实验用）。
 *
 * 服务端只把 rngState 存在 GameState 里，所有影响局面结构的随机抽取
 * （时代顺序、项目发牌、座位顺序）都从这条流里取，导出时记录 seed。
 */

export function normalizeSeed(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return (Math.trunc(n) >>> 0) || 0;
}

/** 从环境读取基准种子；未设置时随机生成（并会在导出中记录实际值）。 */
export function seedFromEnv(): number {
  const raw = normalizeSeed(process.env.GAME_SEED);
  if (raw > 0) return raw;
  return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 1;
}

/** 同一基准种子下，第 n 局的派生种子（n 从 0 开始）。 */
export function deriveSeed(baseSeed: number, ordinal: number): number {
  let x = (baseSeed + Math.imul(ordinal + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0 || 1;
}

/** mulberry32：返回 [0,1) 与下一个状态。 */
export function nextRandomValue(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, t >>> 0];
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = normalizeSeed(seed) || 1;
  }

  get rngState(): number {
    return this.state;
  }

  next(): number {
    const [value, state] = nextRandomValue(this.state);
    this.state = state;
    return value;
  }

  int(maxExclusive: number): number {
    if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
