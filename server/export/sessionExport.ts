import ExcelJS from "exceljs";
import { GameState, ActiveProject, Player } from "../state/gameState.js";
import { EXPORT_SCHEMA_VERSION, getAnalysisWeightsVersion } from "./constants.js";
import { emptySessionTelemetry } from "../state/sessionTelemetry.js";
import { getCommunityLeaderboard } from "../state/communityLeaderboard.js";
import { eraCards } from "../data/game_data.js";

type ProjectListKind = "active" | "completed" | "uncompleted";

function uniqueProjectsWithList(game: GameState): Array<ActiveProject & { list: ProjectListKind }> {
  const bags: Array<{ list: ProjectListKind; items: ActiveProject[] }> = [
    { list: "active", items: game.activeProjects },
    { list: "completed", items: game.completedProjects },
    { list: "uncompleted", items: game.uncompletedProjects },
  ];
  const seen = new Set<number>();
  const out: Array<ActiveProject & { list: ProjectListKind }> = [];
  for (const bag of bags) {
    for (const p of bag.items) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ ...p, list: bag.list });
    }
  }
  return out;
}

function eraThemeNames(eraSequence: number[]): string[] {
  return eraSequence.map((idx) => {
    const card = eraCards.find((c) => c.id === idx + 1);
    return card?.name ?? `era_${idx}`;
  });
}

function playerExportRow(p: Player) {
  return {
    id: p.id,
    name: p.name,
    isAI: p.isAI ?? false,
    aiPersona: p.aiPersona ?? "",
    isAgent: p.isAgent ?? false,
    agentIndex: p.agentIndex ?? null,
    agentPersona: p.agentPersona ?? "",
    agentModel: p.agentModel ?? "",
    energy: p.energy,
    wealth: p.wealth,
    rank: p.rank,
    connected: p.connected,
    socialRank: p.socialRank,
    totalEnergyConsumed: p.totalEnergyConsumed,
    investedLongEnergy: p.investedLongEnergy,
    investedShortEnergy: p.investedShortEnergy,
    investedRiskEnergy: p.investedRiskEnergy,
    wealthHistory: p.wealthHistory.join(","),
    fatePersona: p.analysisResult?.primaryPersona ?? "",
    geneCode: p.analysisResult?.mbtiPersona?.code ?? "",
  };
}

export function buildSessionExport(game: GameState) {
  const tel = game.sessionTelemetry ?? emptySessionTelemetry();
  const exportedAt = Date.now();

  return {
    meta: {
      exportSchemaVersion: EXPORT_SCHEMA_VERSION,
      analysisWeightsVersion: getAnalysisWeightsVersion(),
      roomId: game.roomId,
      sessionId: game.sessionId ?? null,
      communityName: game.communityName ?? null,
      playerCount: game.players.length,
      energyTableSize: game.energyTableSize ?? null,
      eraSequence: game.eraSequence,
      eraThemeNames: eraThemeNames(game.eraSequence),
      eraTheme: game.currentEraCard?.name ?? null,
      phase: game.phase,
      currentEra: game.currentEra,
      roundInEra: game.roundInEra,
      globalRound: game.globalRound,
      sessionStartedAt: game.sessionStartedAt ?? null,
      exportedAt,
    },
    players: game.players.map((p) => ({
      ...playerExportRow(p),
      ruleEnginePersona: p.analysisResult
        ? { source: "rule_engine", data: p.analysisResult }
        : null,
      inventory: p.inventory,
      usedCards: p.usedCards,
      activeBuffs: (p.activeBuffs ?? []).map((b) => ({
        cardId: b.cardId,
        targetPlayerId: b.targetPlayerId ?? null,
        targetProjectId: b.targetProjectId ?? null,
      })),
      longTerm: p.longTerm,
      riskGains: p.riskGains,
    })),
    projects: uniqueProjectsWithList(game).map((proj) => ({
      id: proj.id,
      name: proj.name,
      type: proj.type,
      maxEnergy: proj.maxEnergy,
      era: proj.era,
      list: proj.list,
      accumulatedInvested: proj.accumulatedInvested,
      investorRecords: proj.investorRecords,
      earningRecords: proj.earningRecords,
      totalPayout: proj.totalPayout,
    })),
    transactions: game.transactions,
    chatGroups: game.chatGroups ?? [],
    groupMessages: game.groupMessages ?? [],
    auctionBids: game.auctionBids ?? [],
    auctionCompletedDeals: game.auctionCompletedDeals ?? [],
    lotteryDeals: (game.lotteryCompletedDeals ?? []).map((d) => ({
      playerId: d.playerId,
      creditedAmount: d.amount,
      enteredAmount: d.enteredAmount ?? null,
      goldApplied: d.goldApplied ?? null,
    })),
    settlementHistory: tel.settlementHistory,
    events: tel.events,
    logs: game.logs,
    globalLeaderboard: getCommunityLeaderboard(),
  };
}

export function sanitizeCell(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

function addSheet(wb: ExcelJS.Workbook, name: string, rows: Record<string, unknown>[]): void {
  const ws = wb.addWorksheet(name);
  const headers = Object.keys(rows[0] ?? { 提示: "" });
  ws.columns = headers.map((h) => ({ header: h, key: h }));
  for (const row of rows) {
    ws.addRow(row);
  }
}

export async function buildSessionWorkbook(
  exportData: ReturnType<typeof buildSessionExport>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const metaRows = Object.entries(exportData.meta).map(([k, v]) => ({
    字段: k,
    值: sanitizeCell(typeof v === "object" ? JSON.stringify(v) : v),
  }));
  addSheet(wb, "概览", metaRows);

  const playerSheet = exportData.players.map((p) => ({
    玩家ID: p.id,
    昵称: sanitizeCell(p.name),
    AI: p.isAI,
    Agent: p.isAgent,
    Agent序号: p.agentIndex,
    Agent人格: sanitizeCell(p.agentPersona),
    Agent模型: sanitizeCell(p.agentModel),
    财富: p.wealth,
    精力: p.energy,
    排名: p.rank,
    社交档: p.socialRank,
    长期精力: p.investedLongEnergy,
    短期精力: p.investedShortEnergy,
    风险精力: p.investedRiskEnergy,
    财富曲线: p.wealthHistory,
    命运素描: sanitizeCell(p.fatePersona),
    决策基因: p.geneCode,
  }));
  addSheet(wb, "玩家", playerSheet.length ? playerSheet : [{ 提示: "无玩家" }]);

  const eventRows = exportData.events.map((e) => ({
    时间: new Date(e.timestamp).toISOString(),
    类型: e.type,
    玩家ID: e.playerId ?? "",
    详情: sanitizeCell(JSON.stringify(e.payload)),
  }));
  addSheet(wb, "事件", eventRows.length ? eventRows : [{ 提示: "无事件" }]);

  const settlementRows: Record<string, unknown>[] = [];
  for (const round of exportData.settlementHistory) {
    for (const res of round.results) {
      for (const [pid, invest] of Object.entries(res.playerInvestments)) {
        const gain = res.playerGains[pid];
        settlementRows.push({
          轮次: round.round,
          时代: round.currentEra,
          时代内轮: round.roundInEra,
          项目ID: res.projectId,
          项目: sanitizeCell(res.name),
          项目类型: res.type,
          玩家ID: pid,
          投入: invest,
          收益: gain?.total ?? 0,
          收益基础: gain?.base ?? 0,
          收益排名: gain?.rank ?? 0,
          收益时代: gain?.era ?? 0,
          点石前基础: gain?.baseBeforeGold ?? "",
          点石前排名: gain?.rankBeforeGold ?? "",
          点石前时代: gain?.eraBeforeGold ?? "",
          投爆: res.isExploded && res.type !== "long",
          超额完成: res.type === "long" && res.isExploded && res.isCompleted,
          完成: res.isCompleted,
          做空: res.shortSold === true,
        });
      }
    }
  }
  addSheet(wb, "结算", settlementRows.length ? settlementRows : [{ 提示: "无结算" }]);

  const txRows = exportData.transactions.map((t) => ({
    时间: new Date(t.timestamp).toISOString(),
    发起: sanitizeCell(t.fromName),
    接收: sanitizeCell(t.toName),
    金额: t.amount,
    备注: sanitizeCell(t.note),
    状态: t.status,
  }));
  addSheet(wb, "转账", txRows.length ? txRows : [{ 提示: "无转账" }]);

  const groupNameById = new Map((exportData.chatGroups ?? []).map((g) => [g.id, g.name]));
  const groupRows = (exportData.groupMessages ?? []).map((m) => ({
    时间: new Date(m.timestamp).toISOString(),
    群名: sanitizeCell(groupNameById.get(m.groupId) ?? m.groupId),
    发送者: sanitizeCell(m.fromName),
    内容: sanitizeCell(m.text),
  }));
  addSheet(wb, "群聊", groupRows.length ? groupRows : [{ 提示: "无群聊" }]);

  const projRows = exportData.projects.map((p) => ({
    ID: p.id,
    名称: sanitizeCell(p.name),
    类型: p.type,
    列表: p.list,
    容量: p.maxEnergy,
    累计投入: p.accumulatedInvested,
    总派发: p.totalPayout,
  }));
  addSheet(wb, "项目", projRows.length ? projRows : [{ 提示: "无项目" }]);

  const statusLabel: Record<string, string> = {
    leading: "暂时领先",
    outbid: "已被超过",
    won: "成交拿走",
    void_passed: "跳过作废",
    void_force_buy: "被强买打断",
    void_lot_changed: "换卡作废",
  };
  const bidDetailRows = (exportData.auctionBids ?? []).map((b) => ({
    场次: b.auctionRound,
    道具卡ID: b.cardId,
    玩家ID: b.playerId,
    玩家: sanitizeCell(b.playerName),
    出价: b.amount,
    当时账面: b.wealthAtBid,
    当时可用: b.availableWealthAtBid,
    占可用比例:
      b.bidToAvailableRatio != null ? Math.round(b.bidToAvailableRatio * 10000) / 100 : "",
    结果: statusLabel[b.status] ?? b.status,
    时间: new Date(b.timestamp).toISOString(),
  }));
  addSheet(wb, "出价明细", bidDetailRows.length ? bidDetailRows : [{ 提示: "无出价" }]);

  const dealSourceLabel: Record<string, string> = {
    hammer: "确认成交",
    force_buy: "强买强卖",
  };
  const dealRows = (exportData.auctionCompletedDeals ?? []).map((d) => {
    const wonBid = (exportData.auctionBids ?? [])
      .filter((b) => {
        if (b.cardId !== d.cardId || b.playerId !== d.playerId || b.status !== "won") return false;
        if (d.auctionRound != null) return b.auctionRound === d.auctionRound;
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    return {
      场次: d.auctionRound ?? "",
      道具卡ID: d.cardId,
      得主ID: d.playerId,
      成交价: d.cost,
      来源: d.source ? dealSourceLabel[d.source] ?? d.source : "",
      最高出价当时可用: wonBid?.availableWealthAtBid ?? "",
      最高出价占可用比例:
        wonBid?.bidToAvailableRatio != null
          ? Math.round(wonBid.bidToAvailableRatio * 10000) / 100
          : "",
    };
  });
  addSheet(wb, "成交", dealRows.length ? dealRows : [{ 提示: "无成交" }]);

  type SummaryRow = {
    场次: number;
    道具卡ID: string;
    玩家ID: string;
    玩家: string;
    出价次数: number;
    最高出价: number;
    最高价当时可用: number;
    最高价占可用比例: number | "";
    是否得标: boolean;
    _highTs: number;
  };
  const summaryMap = new Map<string, SummaryRow>();
  for (const b of exportData.auctionBids ?? []) {
    const key = `${b.auctionRound}:${b.cardId}:${b.playerId}`;
    const prev = summaryMap.get(key);
    if (!prev) {
      summaryMap.set(key, {
        场次: b.auctionRound,
        道具卡ID: b.cardId,
        玩家ID: b.playerId,
        玩家: String(sanitizeCell(b.playerName)),
        出价次数: 1,
        最高出价: b.amount,
        最高价当时可用: b.availableWealthAtBid,
        最高价占可用比例:
          b.bidToAvailableRatio != null ? Math.round(b.bidToAvailableRatio * 10000) / 100 : "",
        是否得标: b.status === "won",
        _highTs: b.timestamp,
      });
      continue;
    }
    prev.出价次数 += 1;
    if (b.status === "won") prev.是否得标 = true;
    if (b.amount > prev.最高出价 || (b.amount === prev.最高出价 && b.timestamp >= prev._highTs)) {
      prev.最高出价 = b.amount;
      prev.最高价当时可用 = b.availableWealthAtBid;
      prev.最高价占可用比例 =
        b.bidToAvailableRatio != null ? Math.round(b.bidToAvailableRatio * 10000) / 100 : "";
      prev._highTs = b.timestamp;
    }
  }
  for (const deal of exportData.auctionCompletedDeals ?? []) {
    const round = deal.auctionRound ?? 0;
    const key = `${round}:${deal.cardId}:${deal.playerId}`;
    const prev = summaryMap.get(key);
    if (prev) {
      prev.是否得标 = true;
      if (deal.cost > prev.最高出价) prev.最高出价 = deal.cost;
      continue;
    }
    if (deal.auctionRound == null) {
      let found = false;
      for (const row of summaryMap.values()) {
        if (row.道具卡ID === deal.cardId && row.玩家ID === deal.playerId) {
          row.是否得标 = true;
          found = true;
          break;
        }
      }
      if (found) continue;
    }
    const p = exportData.players.find((x) => x.id === deal.playerId);
    summaryMap.set(`deal:${key}`, {
      场次: round,
      道具卡ID: deal.cardId,
      玩家ID: deal.playerId,
      玩家: String(sanitizeCell(p?.name ?? deal.playerId)),
      出价次数: 0,
      最高出价: deal.cost,
      最高价当时可用: deal.cost,
      最高价占可用比例: "",
      是否得标: true,
      _highTs: 0,
    });
  }
  const summaryRows = Array.from(summaryMap.values()).map(({ _highTs: _, ...rest }) => rest);
  addSheet(wb, "出价摘要", summaryRows.length ? summaryRows : [{ 提示: "无出价" }]);

  const lotteryRows = (exportData.lotteryDeals ?? []).map((d) => ({
    玩家ID: d.playerId,
    主持原额: d.enteredAmount ?? "",
    入账额: d.creditedAmount,
    点石成金: d.goldApplied === true ? "是" : d.goldApplied === false ? "否" : "",
  }));
  addSheet(wb, "彩票", lotteryRows.length ? lotteryRows : [{ 提示: "无彩票开奖" }]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function safeExportBasename(roomId: string): string {
  return roomId.replace(/[^\w\u4e00-\u9fa5-]+/g, "_").slice(0, 64) || "room";
}

/** RFC 5987：兼容中文等非 ASCII 下载文件名 */
export function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
