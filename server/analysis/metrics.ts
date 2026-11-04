import type { AgentPrediction, GameState, Player } from "../state/gameState.js";

/**
 * 离线/导出用社会指标。
 *
 * 原则：只从原始行为流水计算，不在这里写「角色标签」。
 * 每个指标都能追溯到 transactions / directMessages / groupMessages /
 * auctionBids / settlementHistory / events。
 */

export interface PlayerMetrics {
  playerId: string;
  name: string;
  seat: number;
  isAgent: boolean;
  agentIndex: number | null;
  model: string;
  provider: string;
  finalWealth: number;
  finalRank: number;
  longEnergy: number;
  shortEnergy: number;
  riskEnergy: number;
  totalInvestedEnergy: number;
  longShare: number;
  shortShare: number;
  riskShare: number;
  transfersSent: number;
  transfersReceived: number;
  transferAmountSent: number;
  transferAmountReceived: number;
  /** 发出的转账中，对方在本局后来越过「回报」的比例 */
  transferReturnRate: number;
  /** 双向都有转账的对手数量 */
  mutualTransferPartners: number;
  publicMessages: number;
  privateMessages: number;
  privatePartners: number;
  auctionBids: number;
  auctionWins: number;
  auctionSpend: number;
  avgBidToAvailableRatio: number | null;
  buffsUsed: number;
  attacksInitiated: number;
  attacksReceived: number;
  predictionCount: number;
  predictionTau: number | null;
  predictionMae: number | null;
  /** 转账 / 私聊 / 攻击三类关系中的出度与入度（去重对象数） */
  outDegree: number;
  inDegree: number;
}

export interface GameMetrics {
  playerCount: number;
  totalWealth: number;
  wealthRange: number;
  wealthCv: number;
  gini: number;
  transferCount: number;
  transferVolume: number;
  transferReciprocity: number;
  publicMessageCount: number;
  privateMessageCount: number;
  attackCount: number;
  auctionBidCount: number;
  auctionSpend: number;
  predictionCount: number;
  meanPredictionTau: number | null;
  meanPredictionMae: number | null;
  /** 模型构成，方便跨条件比较 */
  modelMix: Record<string, number>;
}

export interface SessionMetrics {
  generatedAt: number;
  game: GameMetrics;
  players: PlayerMetrics[];
  /** 预测明细：每条预测的评分，便于逐条核对 */
  predictionScores: Array<{
    predictionId: string;
    playerId: string;
    playerName: string;
    era: number;
    globalRound: number;
    tau: number;
    mae: number;
  }>;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 并列同名次（dense rank，1 开始）。 */
export function denseRankByWealth(players: Player[]): Map<string, number> {
  const sorted = [...players].sort((a, b) => b.wealth - a.wealth);
  const ranks = new Map<string, number>();
  let rank = 0;
  let prevWealth: number | null = null;
  for (const p of sorted) {
    if (prevWealth == null || p.wealth !== prevWealth) {
      rank += 1;
      prevWealth = p.wealth;
    }
    ranks.set(p.id, rank);
  }
  return ranks;
}

/** Kendall τ-a：并列按 0 处理；n 小时足够。 */
export function kendallTau(predicted: string[], actualRank: Map<string, number>): number {
  const n = predicted.length;
  if (n < 2) return 0;
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pi = i + 1;
      const pj = j + 1;
      const ai = actualRank.get(predicted[i]) ?? 0;
      const aj = actualRank.get(predicted[j]) ?? 0;
      const product = (pi - pj) * (ai - aj);
      if (product > 0) concordant += 1;
      else if (product < 0) discordant += 1;
    }
  }
  return (concordant - discordant) / ((n * (n - 1)) / 2);
}

export function predictionMae(predicted: string[], actualRank: Map<string, number>): number {
  if (predicted.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < predicted.length; i++) {
    sum += Math.abs(i + 1 - (actualRank.get(predicted[i]) ?? 0));
  }
  return sum / predicted.length;
}

function gini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum <= 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * sorted[i];
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

type EventRow = { type: string; playerId?: string; payload: Record<string, unknown> };

export function computeSessionMetrics(game: GameState): SessionMetrics {
  const players = game.players;
  const actualRank = denseRankByWealth(players);
  const seatById = new Map(players.map((p, i) => [p.id, i + 1]));

  const acceptedTransfers = game.transactions.filter(
    (t) => t.status === "accepted" && t.amount > 0
  );
  const events = (game.sessionTelemetry?.events ?? []) as EventRow[];
  const buffEvents = events.filter(
    (e) => e.type === "buff_used" && e.playerId
  );
  const publicMessages = game.groupMessages ?? [];
  const privateMessages = game.directMessages ?? [];
  const predictions = game.predictions ?? [];

  const transferEdges = new Map<string, Map<string, number>>();
  const addEdge = (from: string, to: string, amount = 1) => {
    if (!transferEdges.has(from)) transferEdges.set(from, new Map());
    const m = transferEdges.get(from)!;
    m.set(to, (m.get(to) ?? 0) + amount);
  };
  for (const t of acceptedTransfers) addEdge(t.fromId, t.toId);

  const anyEdge = new Map<string, Set<string>>();
  const addAnyEdge = (from: string, to: string) => {
    if (!anyEdge.has(from)) anyEdge.set(from, new Set());
    anyEdge.get(from)!.add(to);
  };
  for (const t of acceptedTransfers) addAnyEdge(t.fromId, t.toId);
  for (const m of privateMessages) addAnyEdge(m.fromId, m.toId);
  for (const e of buffEvents) {
    const target = typeof e.payload.targetPlayerId === "string" ? e.payload.targetPlayerId : null;
    if (target) addAnyEdge(e.playerId!, target);
  }

  const predictionScores: SessionMetrics["predictionScores"] = [];
  const perPlayerPredictionTau = new Map<string, number[]>();
  const perPlayerPredictionMae = new Map<string, number[]>();
  for (const p of predictions) {
    const tau = kendallTau(p.ranking, actualRank);
    const mae = predictionMae(p.ranking, actualRank);
    predictionScores.push({
      predictionId: p.id,
      playerId: p.playerId,
      playerName: p.playerName,
      era: p.era,
      globalRound: p.globalRound,
      tau: round4(tau),
      mae: round4(mae),
    });
    const taus = perPlayerPredictionTau.get(p.playerId) ?? [];
    taus.push(tau);
    perPlayerPredictionTau.set(p.playerId, taus);
    const maes = perPlayerPredictionMae.get(p.playerId) ?? [];
    maes.push(mae);
    perPlayerPredictionMae.set(p.playerId, maes);
  }

  const playerMetrics: PlayerMetrics[] = players.map((p) => {
    const sent = acceptedTransfers.filter((t) => t.fromId === p.id);
    const received = acceptedTransfers.filter((t) => t.toId === p.id);
    let returned = 0;
    for (const out of sent) {
      const hasReturn = acceptedTransfers.some(
        (t) =>
          t.fromId === out.toId &&
          t.toId === p.id &&
          t.timestamp >= out.timestamp
      );
      if (hasReturn) returned += 1;
    }
    const mutualPartners = players.filter(
      (other) =>
        other.id !== p.id &&
        sent.some((t) => t.toId === other.id) &&
        received.some((t) => t.fromId === other.id)
    ).length;

    const myPublic = publicMessages.filter((m) => m.fromId === p.id).length;
    const myPrivate = privateMessages.filter((m) => m.fromId === p.id);
    const myPrivateAll = privateMessages.filter(
      (m) => m.fromId === p.id || m.toId === p.id
    );
    const privatePartners = new Set(
      myPrivateAll.map((m) => (m.fromId === p.id ? m.toId : m.fromId))
    ).size;

    const myBids = (game.auctionBids ?? []).filter((b) => b.playerId === p.id);
    const myDeals = (game.auctionCompletedDeals ?? []).filter((d) => d.playerId === p.id);
    const ratios = myBids
      .map((b) => b.bidToAvailableRatio)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const myBuffs = buffEvents.filter((e) => e.playerId === p.id);
    const attacksInitiated = myBuffs.filter((e) => {
      const target = e.payload.targetPlayerId;
      return typeof target === "string" && target !== p.id;
    }).length;
    const attacksReceived = buffEvents.filter(
      (e) => e.payload.targetPlayerId === p.id && e.playerId !== p.id
    ).length;

    const totalEnergy = p.investedLongEnergy + p.investedShortEnergy + p.investedRiskEnergy;
    const taus = perPlayerPredictionTau.get(p.id) ?? [];
    const maes = perPlayerPredictionMae.get(p.id) ?? [];

    return {
      playerId: p.id,
      name: p.name,
      seat: seatById.get(p.id) ?? 0,
      isAgent: p.isAgent === true,
      agentIndex: p.agentIndex ?? null,
      model: p.agentModel ?? "",
      provider: p.agentProvider ?? "",
      finalWealth: p.wealth,
      finalRank: actualRank.get(p.id) ?? 0,
      longEnergy: p.investedLongEnergy,
      shortEnergy: p.investedShortEnergy,
      riskEnergy: p.investedRiskEnergy,
      totalInvestedEnergy: totalEnergy,
      longShare: totalEnergy > 0 ? round4(p.investedLongEnergy / totalEnergy) : 0,
      shortShare: totalEnergy > 0 ? round4(p.investedShortEnergy / totalEnergy) : 0,
      riskShare: totalEnergy > 0 ? round4(p.investedRiskEnergy / totalEnergy) : 0,
      transfersSent: sent.length,
      transfersReceived: received.length,
      transferAmountSent: sent.reduce((s, t) => s + t.amount, 0),
      transferAmountReceived: received.reduce((s, t) => s + t.amount, 0),
      transferReturnRate: sent.length > 0 ? round4(returned / sent.length) : 0,
      mutualTransferPartners: mutualPartners,
      publicMessages: myPublic,
      privateMessages: myPrivate.length,
      privatePartners,
      auctionBids: myBids.length,
      auctionWins: myDeals.length,
      auctionSpend: myDeals.reduce((s, d) => s + d.cost, 0),
      avgBidToAvailableRatio: mean(ratios) == null ? null : round4(mean(ratios)!),
      buffsUsed: myBuffs.length,
      attacksInitiated,
      attacksReceived,
      predictionCount: taus.length,
      predictionTau: mean(taus) == null ? null : round4(mean(taus)!),
      predictionMae: mean(maes) == null ? null : round4(mean(maes)!),
      outDegree: anyEdge.get(p.id)?.size ?? 0,
      inDegree: players.filter((other) => anyEdge.get(other.id)?.has(p.id)).length,
    };
  });

  const transferDirectedPairs: Array<[string, string]> = [];
  for (const [from, targets] of transferEdges) {
    for (const to of targets.keys()) transferDirectedPairs.push([from, to]);
  }
  const mutualTransferPairs = transferDirectedPairs.filter(([a, b]) =>
    transferEdges.get(b)?.has(a)
  ).length;

  const wealths = players.map((p) => p.wealth);
  const sum = wealths.reduce((s, v) => s + v, 0);
  const avg = wealths.length ? sum / wealths.length : 0;
  const variance = wealths.length
    ? wealths.reduce((s, v) => s + (v - avg) ** 2, 0) / wealths.length
    : 0;
  const modelMix: Record<string, number> = {};
  for (const p of players) {
    const key = [p.agentProvider, p.agentModel].filter(Boolean).join("/") || "unknown";
    modelMix[key] = (modelMix[key] ?? 0) + 1;
  }

  const allTaus = predictionScores.map((p) => p.tau);
  const allMaes = predictionScores.map((p) => p.mae);

  return {
    generatedAt: Date.now(),
    game: {
      playerCount: players.length,
      totalWealth: sum,
      wealthRange: wealths.length ? Math.max(...wealths) - Math.min(...wealths) : 0,
      wealthCv: avg > 0 ? round4(Math.sqrt(variance) / avg) : 0,
      gini: round4(gini(wealths)),
      transferCount: acceptedTransfers.length,
      transferVolume: acceptedTransfers.reduce((s, t) => s + t.amount, 0),
      transferReciprocity:
        transferDirectedPairs.length > 0
          ? round4(mutualTransferPairs / transferDirectedPairs.length)
          : 0,
      publicMessageCount: publicMessages.length,
      privateMessageCount: privateMessages.length,
      attackCount: buffEvents.filter((e) => {
        const target = e.payload.targetPlayerId;
        return typeof target === "string" && target !== e.playerId;
      }).length,
      auctionBidCount: (game.auctionBids ?? []).length,
      auctionSpend: (game.auctionCompletedDeals ?? []).reduce((s, d) => s + d.cost, 0),
      predictionCount: predictions.length,
      meanPredictionTau: mean(allTaus) == null ? null : round4(mean(allTaus)!),
      meanPredictionMae: mean(allMaes) == null ? null : round4(mean(allMaes)!),
      modelMix,
    },
    players: playerMetrics,
    predictionScores,
  };
}

/** 预测按时代分组，便于检查同一 Agent 的适应曲线。 */
export function predictionsByEra(game: GameState): AgentPrediction[][] {
  const byEra = new Map<number, AgentPrediction[]>();
  for (const p of game.predictions ?? []) {
    const list = byEra.get(p.era) ?? [];
    list.push(p);
    byEra.set(p.era, list);
  }
  return [...byEra.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list);
}
