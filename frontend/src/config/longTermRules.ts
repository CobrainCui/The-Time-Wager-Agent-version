/** 与 server/logic/longTermLogic.ts LONG_CONTINUE_MIN_ENERGY 保持一致 */
export const LONG_CONTINUE_MIN_ENERGY = 3;

type LongTermStatus = "active" | "completed" | "abandoned";

type LongContinuePlayer = {
  id: string;
  longTerm?: Record<number | string, { status?: LongTermStatus; totalInvested?: number }>;
};

type LongContinueProject = {
  id: number;
  type: string;
  investorRecords?: Record<string, number>;
};

/**
 * 是否应对该长期项目展示「本轮须继续投入」红警示 / 放弃风险。
 * 兼容 longTerm 未同步但牌桌 investorRecords 已有记录的情况。
 */
export function needsLongContinueWarn(
  project: LongContinueProject,
  me: LongContinuePlayer
): boolean {
  if (project.type !== "long") return false;
  const lt = me.longTerm?.[project.id] ?? me.longTerm?.[String(project.id)];
  if (lt?.status === "abandoned" || lt?.status === "completed") return false;
  if (lt?.status === "active") return true;
  const prior = project.investorRecords?.[me.id] ?? 0;
  return prior > 0;
}

/** 与 server sanitizeLongContribution 一致：已参投时 1–2 视为 0（将触发放弃） */
export function sanitizeLongContribution(
  status: LongTermStatus | undefined,
  amount: number
): number {
  if (status === "abandoned" || status === "completed") return 0;
  if (status === "active" && amount > 0 && amount < LONG_CONTINUE_MIN_ENERGY) return 0;
  return amount;
}

/** 滑条/步进：已参投长期把落在 1–2 的值吸附到 0 或 3（与结算阈值一致） */
export function snapLongContinueInput(amount: number, previous: number): number {
  if (amount !== 1 && amount !== 2) return amount;
  return amount > previous ? LONG_CONTINUE_MIN_ENERGY : 0;
}
