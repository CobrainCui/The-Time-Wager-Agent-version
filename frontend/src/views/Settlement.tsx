import React, { useMemo } from "react";
import { uiRem } from "../utils/typography";
import { ActiveProject, GameState, Player, SettlementProjectResult, GainBreakdown } from "../types";
import { socket } from "../socket";
import {
  longSettlementStatusLabel,
  shortExactSettlementStatusLabel,
  settlementHidesInvestedRatio,
  LONG_COMPLETE_CHIP_COLOR,
} from "../utils/projectHelpTable";
import { BuffRoundChips } from "../components/BuffRoundChips";
import { useFixedDockClearance } from "../hooks/useFixedDockClearance";
import {
  formatPersonalBarCaption,
  normalizePersonalSlices,
  repairPersonalRoundSlices,
} from "../utils/settlementPersonalBar";

interface Props {
  game: GameState;
  me: Player;
  /** 主持嵌入观战：底栏 clearance 不写 document */
  embed?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  short: "#3b82f6", long: "#10b981", risk: "#ef4444",
};

const ERA_NAMES: Record<number, string> = { 1: "青年", 2: "壮年", 3: "中年", 4: "老年" };

/** 结算分解项：负数用括号，避免 160+-35+0 */
function formatGainPart(n: number): string {
  return n < 0 ? `(${n})` : String(n);
}

/** 点石成金：仅当乘前原值与入账完全对应时显示（原值）×1.5（保险后再扣回时退回数字） */
function formatGoldAwarePart(paid: number, beforeGold?: number): string {
  if (
    typeof beforeGold === "number" &&
    beforeGold > 0 &&
    Math.floor(beforeGold * 1.5) === paid
  ) {
    return `（${beforeGold}）的 1.5 倍`;
  }
  return formatGainPart(paid);
}

function formatGainBreakdown(
  base: number,
  rank: number,
  era: number,
  gains?: Pick<GainBreakdown, "baseBeforeGold" | "rankBeforeGold" | "eraBeforeGold">
): string {
  return [
    formatGoldAwarePart(base, gains?.baseBeforeGold),
    formatGoldAwarePart(rank, gains?.rankBeforeGold),
    formatGoldAwarePart(era, gains?.eraBeforeGold),
  ].join("+");
}

function longTermForPlayer(me: Player, projectId: number) {
  return me.longTerm[projectId] ?? me.longTerm[String(projectId) as unknown as number];
}

function projectOnBoard(game: GameState, projectId: number): ActiveProject | undefined {
  for (const list of [game.activeProjects, game.completedProjects, game.uncompletedProjects]) {
    const found = list.find((p) => p.id === projectId);
    if (found) return found;
  }
  return undefined;
}

/** 结算全览个人条：长期用累计（放弃用快照 1:1 基数）；短/风险用牌桌累计 */
function personalCumulativeEnergy(
  result: SettlementProjectResult,
  me: Player,
  game: GameState
): number {
  if (result.shortSold) return 0;
  if (result.type === "short" || result.type === "risk") {
    const proj = projectOnBoard(game, result.projectId);
    const cumulative = proj?.investorRecords[me.id] ?? 0;
    if (cumulative > 0) return cumulative;
    return result.playerInvestments[me.id] ?? 0;
  }
  if (result.type === "long") {
    const lt = longTermForPlayer(me, result.projectId);
    if (lt?.status === "abandoned") {
      return result.playerInvestments[me.id] ?? 0;
    }
    if (lt?.status === "active" || lt?.status === "completed") {
      return lt.totalInvested ?? 0;
    }
    if (result.endGradient) {
      const lt = longTermForPlayer(me, result.projectId);
      if (lt?.status === "active") return lt.totalInvested ?? 0;
      return result.playerInvestments[me.id] ?? 0;
    }
  }
  return result.playerInvestments[me.id] ?? 0;
}

/** 结算单「投入」列：短/风险仅当轮；长期为累计 */
function settlementTableInvestEnergy(
  result: SettlementProjectResult,
  player: Player,
  game: GameState
): number {
  if (result.type === "short" || result.type === "risk") {
    return result.playerInvestments[player.id] ?? 0;
  }
  return personalCumulativeEnergy(result, player, game);
}

/** 个人条分段：长期 roundSlices；短/风险 investorRoundSlices */
function personalRoundSlices(
  result: SettlementProjectResult,
  me: Player,
  game: GameState
): number[] {
  if (result.shortSold) return [];
  const thisRound = result.playerInvestments[me.id] ?? 0;
  if (result.type === "short" || result.type === "risk") {
    const proj = projectOnBoard(game, result.projectId);
    const total = personalCumulativeEnergy(result, me, game);
    const slices = proj?.investorRoundSlices?.[me.id] ?? [];
    return repairPersonalRoundSlices(slices, total, thisRound);
  }
  if (result.type === "long") {
    const lt = longTermForPlayer(me, result.projectId);
    const total = personalCumulativeEnergy(result, me, game);
    const roundIncrement = lt?.status === "abandoned" ? 0 : thisRound;
    if (
      lt &&
      (lt.status === "abandoned" ||
        lt.status === "active" ||
        lt.status === "completed" ||
        result.endGradient)
    ) {
      return repairPersonalRoundSlices(lt.roundSlices ?? [], total, roundIncrement);
    }
    if (result.endGradient && total > 0) {
      return repairPersonalRoundSlices([], total, thisRound);
    }
  }
  return thisRound > 0 ? [thisRound] : [];
}

const GlobalCard: React.FC<{
  result: SettlementProjectResult;
  me: Player;
  game: GameState;
  personalLabel: string;
}> = ({ result, me, game, personalLabel }) => {
  const pct = Math.min((result.totalInvested / result.maxEnergy) * 100, 100);
  const color = TYPE_COLORS[result.type] || "#60a5fa";
  const longLabel = longSettlementStatusLabel(result);
  const shortExactLabel = shortExactSettlementStatusLabel(result);
  const burstExploded = result.isExploded && result.type !== "long";
  let statusText = "进行中";
  let statusColor = color;
  if (result.shortSold) {
    statusText = "项目做空";
    statusColor = "#60a5fa";
  } else if (longLabel) {
    statusText = longLabel.text;
    statusColor = longLabel.color;
  } else if (burstExploded) {
    statusText = "💥 投资失败";
    statusColor = "#ef4444";
  } else if (shortExactLabel) {
    statusText = shortExactLabel.text;
    statusColor = shortExactLabel.color;
  } else if (result.isCompleted) {
    statusText = "✅ 完成";
    statusColor = "#34d399";
  } else if (result.type === "long") {
    statusText = `${Math.round(pct)}%`;
  }

  const personalEnergy = personalCumulativeEnergy(result, me, game);
  const personalSlices = normalizePersonalSlices(
    personalEnergy <= 0 ? [] : personalRoundSlices(result, me, game),
    personalEnergy
  );
  const personalPct = result.maxEnergy > 0
    ? Math.min((personalEnergy / result.maxEnergy) * 100, 100)
    : 0;
  const hideCapRatio = settlementHidesInvestedRatio(result);
  const boardSharePct =
    !hideCapRatio && result.totalInvested > 0 && personalEnergy > 0
      ? Math.round((personalEnergy / result.totalInvested) * 100)
      : null;
  const barFill = burstExploded ? "#ef4444" : `linear-gradient(90deg, ${color}, ${color}bb)`;
  const personalBarFill = burstExploded
    ? "rgba(239,68,68,0.72)"
    : `linear-gradient(90deg, ${color}bb, ${color}88)`;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${result.shortSold ? "#60a5fa55" : `${color}25`}`,
        borderRadius: "0.875rem",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.625rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, color: "white", fontSize: uiRem(0.95) }}>{result.name}</span>
        <span style={{ fontSize: uiRem(0.75), fontWeight: 700, color: statusColor }}>{statusText}</span>
      </div>
      <div style={{ width: "100%", height: "5px", background: "rgba(255,255,255,0.06)", borderRadius: "9999px", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${result.shortSold ? 0 : pct}%`,
            background: barFill,
            borderRadius: "9999px",
            transition: "width 1s ease",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: uiRem(0.75), color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
        <span>
          {result.shortSold
            ? "清零"
            : `全场 ${hideCapRatio ? "x" : result.totalInvested} / ${result.maxEnergy}`}
        </span>
        <span style={{ color }}>{result.type === "short" ? "短期" : result.type === "long" ? "长期" : "风险"}</span>
      </div>
      <div style={{ width: "100%", height: "5px", background: "rgba(255,255,255,0.06)", borderRadius: "9999px", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${result.shortSold ? 0 : personalPct}%`,
            display: "flex",
            gap: personalSlices.length > 1 ? 3 : 0,
            transition: "width 1s ease",
          }}
        >
          {personalSlices.map((amt, i) => (
            <div
              key={i}
              style={{
                flex: amt,
                minWidth: 0,
                height: "100%",
                background: personalBarFill,
                borderRadius: 3,
              }}
            />
          ))}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.5rem",
          fontSize: uiRem(0.75),
          color: "var(--color-text-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span style={{ minWidth: 0, flex: "1 1 auto", lineHeight: 1.45 }}>
          {result.shortSold
            ? "清零"
            : formatPersonalBarCaption(
                personalLabel,
                personalSlices,
                personalEnergy,
                result.maxEnergy,
                hideCapRatio
              )}
        </span>
        {boardSharePct !== null && (
          <span style={{ color: "var(--color-text-muted)", opacity: 0.85, flexShrink: 0 }}>
            占全场 {boardSharePct}%
          </span>
        )}
      </div>
    </div>
  );
};

export const Settlement: React.FC<Props> = ({ game, me, embed = false }) => {
  const snapshot = game.lastSettlement;
  const nameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of game.players) map[p.id] = p.name;
    return map;
  }, [game.players]);

  const myRoundIncome = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.results.reduce((sum, res) => {
      const g = res.playerGains[me.id];
      return sum + (g ? g.total : 0);
    }, 0);
  }, [snapshot, me.id]);

  const boardRoundIncome = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.results.reduce((sum, res) => {
      return (
        sum +
        Object.values(res.playerGains).reduce((s, g) => s + (g?.total ?? 0), 0)
      );
    }, 0);
  }, [snapshot]);

  const leaderboard = useMemo(
    () => [...game.players].sort((a, b) => b.wealth - a.wealth),
    [game.players]
  );

  const seatedCount = game.players.length;

  const myProjects =
    snapshot?.results.filter(
      (r) => (r.playerInvestments[me.id] || 0) > 0 || (r.playerGains[me.id]?.total ?? 0) !== 0
    ) || [];

  const isNextNewEra = game.roundInEra === 2;
  const matchOver = game.nextRoundEnergy === null;
  const nextEnergy = game.nextRoundEnergy ?? 0;
  const nextEra = isNextNewEra ? game.currentEra + 1 : game.currentEra;
  const nextRoundInEra = isNextNewEra ? 1 : game.roundInEra + 1;
  const nextStageLabel = `${ERA_NAMES[nextEra] ?? `第${nextEra}时代`} 第${nextRoundInEra}轮`;
  const { contentRef: settlementMainRef, dockRef: confirmDockRef } = useFixedDockClearance(
    !embed,
    `${me.ready}-${!!snapshot}`,
    !embed
  );

  const headlineIncome = embed ? boardRoundIncome : myRoundIncome;
  const headlineWealthLabel = embed ? "在局人数" : "当前总财富";
  const headlineWealthValue = embed ? seatedCount : me.wealth;

  if (!snapshot) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", color: "#fbbf24", fontSize: uiRem(1.25), animation: "pulse 1.5s infinite" }}>
          📊 正在生成结算报告...
        </div>
      </div>
    );
  }

  const hostAdjusted = snapshot.hostAdjusted === true;

  const rankBadge = (i: number) => {
    const colors = ["#f59e0b", "#94a3b8", "#cd7c32"];
    return { background: colors[i] || "#1f2937", color: i < 3 ? (i === 0 ? "#000" : "#fff") : "#6b7280" };
  };

  const projectStatusSuffix = (res: SettlementProjectResult, longState?: string) => {
    let statusSuffix = "";
    let statusSuffixColor = "var(--color-text-muted)";
    let rowColor = "var(--color-text-secondary)";
    const longRowLabel = longSettlementStatusLabel(res);
    const shortRowLabel = shortExactSettlementStatusLabel(res);
    if (res.shortSold) {
      statusSuffix = " 📉做空·清零";
      statusSuffixColor = "#60a5fa";
      rowColor = "#60a5fa";
    } else if (res.isExploded && res.type !== "long") {
      statusSuffix = " 💥投资失败";
      statusSuffixColor = "#f87171";
      rowColor = "#f87171";
    } else if (res.type === "long" && longState === "abandoned") {
      statusSuffix = " 🚫放弃结算";
      statusSuffixColor = "#9ca3af";
      rowColor = "#9ca3af";
    } else if (longRowLabel) {
      statusSuffix = ` ${longRowLabel.text}`;
      statusSuffixColor = longRowLabel.color;
      rowColor = longRowLabel.color;
    } else if (shortRowLabel) {
      statusSuffix = ` ${shortRowLabel.text}`;
      statusSuffixColor = shortRowLabel.color;
      rowColor = shortRowLabel.color;
    } else if (res.type === "long") statusSuffix = " ⏳";
    return { statusSuffix, statusSuffixColor, rowColor };
  };

  return (
    <div
      ref={settlementMainRef}
      style={{
        minHeight: "100vh",
        background: "#070b14",
        padding: "1.5rem 1rem",
        paddingBottom: "var(--dock-clearance, 8rem)",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>

        {/* 标题 */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: uiRem(0.75), fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "0.375rem" }}>
            Round {snapshot.round} · 结算报告
          </div>
          <h1 style={{ fontSize: "2.25rem", fontWeight: 900, color: "white" }}>本轮战报</h1>
          {hostAdjusted && !embed && (
            <p
              style={{
                marginTop: "0.75rem",
                fontSize: uiRem(0.85),
                color: "#fbbf24",
                fontWeight: 600,
              }}
            >
              主持已调整本轮结算，以下数据以最新结果为准
            </p>
          )}
          {!embed && (
            <div style={{ marginTop: "0.75rem" }}>
              <BuffRoundChips me={me} actionsDisabled />
            </div>
          )}
        </div>

        {/* 三格指标 */}
        <div className="player-responsive-stats" style={{ marginBottom: "2rem" }}>
          <div
            style={{
              background: headlineIncome >= 0 ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${headlineIncome >= 0 ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
              borderRadius: "1rem",
              padding: "1.5rem",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: uiRem(0.7), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
              {embed ? "本轮全场收益" : "本轮净收益"}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "2.75rem",
                fontWeight: 900,
                color: headlineIncome >= 0 ? "#34d399" : "#f87171",
                lineHeight: 1,
              }}
            >
              {headlineIncome > 0 ? "+" : ""}{headlineIncome}
            </div>
          </div>
          <div
            style={{
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.2)",
              borderRadius: "1rem",
              padding: "1.5rem",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: uiRem(0.7), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
              {headlineWealthLabel}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "2.75rem", fontWeight: 900, color: "#fbbf24", lineHeight: 1 }}>
              {headlineWealthValue}
            </div>
          </div>
          <div
            style={{
              background: "rgba(59,130,246,0.06)",
              border: "1px solid rgba(59,130,246,0.2)",
              borderRadius: "1rem",
              padding: "1.5rem",
            }}
          >
            <div style={{ fontSize: uiRem(0.7), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
              {matchOver ? "终局" : "🚀 下一轮预告"}
            </div>
            <div style={{ fontSize: uiRem(0.9), color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              {matchOver ? (
                <div>阶段：<span style={{ color: "#fbbf24", fontWeight: 700 }}>终局</span></div>
              ) : (
                <>
                  <div>
                    阶段：
                    <span
                      style={{
                        color: isNextNewEra ? "#c084fc" : "white",
                        fontWeight: 700,
                      }}
                    >
                      {nextStageLabel}
                    </span>
                  </div>
                  <div>
                    精力：
                    <span style={{ color: "white", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{nextEnergy}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="player-responsive-split">
          {/* 左侧 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {embed ? (
              <div style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: "1rem", overflow: "hidden" }}>
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--color-border)" }}>
                  <h3 style={{ fontWeight: 700, color: "white", fontSize: uiRem(1) }}>🧾 全场投资明细</h3>
                </div>
                {snapshot.results.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {snapshot.results.map((res) => {
                      const { statusSuffix, statusSuffixColor } = projectStatusSuffix(res);
                      const rows = Object.keys({
                        ...res.playerInvestments,
                        ...res.playerGains,
                      }).filter((pid) => {
                        const invest = res.playerInvestments[pid] || 0;
                        const total = res.playerGains[pid]?.total ?? 0;
                        return invest > 0 || total !== 0;
                      });
                      return (
                        <div key={res.projectId} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <div style={{ padding: "0.75rem 1rem 0.35rem", color: "white", fontWeight: 700, fontSize: uiRem(0.9) }}>
                            {res.name}
                            <span style={{ marginLeft: "0.375rem", fontSize: uiRem(0.7), color: statusSuffixColor, fontWeight: 600 }}>
                              {statusSuffix}
                            </span>
                          </div>
                          {rows.length === 0 ? (
                            <div style={{ padding: "0.5rem 1rem 0.85rem", color: "var(--color-text-muted)", fontSize: uiRem(0.8) }}>
                              无人投入
                            </div>
                          ) : (
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: uiRem(0.825) }}>
                                <thead>
                                  <tr style={{ color: "var(--color-text-muted)" }}>
                                    {["玩家", "投入", "基础+排名+时代", "总回报"].map((h, i) => (
                                      <th key={i} style={{ padding: "0.4rem 1rem", fontWeight: 700, fontSize: uiRem(0.65), textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i > 0 ? "center" : "left" }}>
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((pid) => {
                                    const rowPlayer = game.players.find((p) => p.id === pid);
                                    const invest = rowPlayer
                                      ? settlementTableInvestEnergy(res, rowPlayer, game)
                                      : res.playerInvestments[pid] || 0;
                                    const gains = res.playerGains[pid] || { total: 0, base: 0, rank: 0, era: 0 };
                                    const longState = game.players.find((p) => p.id === pid)?.longTerm[res.projectId]?.status;
                                    const isLongAbandon = !res.shortSold && res.type === "long" && longState === "abandoned";
                                    const { rowColor } = projectStatusSuffix(res, longState);
                                    return (
                                      <tr key={pid}>
                                        <td style={{ padding: "0.55rem 1rem", color: "var(--color-text-secondary)" }}>
                                          {nameById[pid] || pid}
                                        </td>
                                        <td style={{ padding: "0.55rem 1rem", textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                                          {invest}
                                        </td>
                                        <td style={{ padding: "0.55rem 1rem", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: uiRem(0.75), color: rowColor }}>
                                          {res.shortSold
                                            ? gains.total !== 0
                                              ? formatGainBreakdown(gains.base, gains.rank, gains.era, gains)
                                              : "清零"
                                            : isLongAbandon
                                              ? `结算 ${gains.total}`
                                              : formatGainBreakdown(gains.base, gains.rank, gains.era, gains)}
                                        </td>
                                        <td
                                          style={{
                                            padding: "0.55rem 1rem",
                                            textAlign: "center",
                                            fontFamily: "var(--font-mono)",
                                            fontWeight: 800,
                                            color: gains.total > 0 ? "#fbbf24" : gains.total < 0 ? "#f87171" : "var(--color-text-muted)",
                                          }}
                                        >
                                          {gains.total > 0 ? "+" : ""}{gains.total}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                    本轮暂无项目结算
                  </div>
                )}
              </div>
            ) : (
            <div style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: "1rem", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 style={{ fontWeight: 700, color: "white", fontSize: uiRem(1) }}>🧾 个人投资结算单</h3>
              </div>
              {myProjects.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: uiRem(0.875) }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)", color: "var(--color-text-muted)" }}>
                        {["项目名称", "投入", "基础+排名+时代", "总回报"].map((h, i) => (
                          <th key={i} style={{ padding: "0.75rem 1rem", fontWeight: 700, fontSize: uiRem(0.7), textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i > 0 ? "center" : "left", whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {myProjects.map((res) => {
                        const myInvest = settlementTableInvestEnergy(res, me, game);
                        const gains = res.playerGains[me.id] || { total: 0, base: 0, rank: 0, era: 0 };
                        const longState = me.longTerm[res.projectId]?.status;
                        const { statusSuffix, statusSuffixColor, rowColor } = projectStatusSuffix(res, longState);
                        const isLongAbandon = !res.shortSold && res.type === "long" && longState === "abandoned";
                        return (
                          <tr key={res.projectId} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "0.875rem 1rem", color: "white", fontWeight: 600 }}>
                              {res.name}
                              <span style={{ marginLeft: "0.375rem", fontSize: uiRem(0.7), color: statusSuffixColor }}>{statusSuffix}</span>
                            </td>
                            <td style={{ padding: "0.875rem 1rem", textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                              {myInvest}
                            </td>
                            <td style={{ padding: "0.875rem 1rem", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: uiRem(0.8), color: rowColor }}>
                              {res.shortSold
                                ? gains.total !== 0
                                  ? formatGainBreakdown(gains.base, gains.rank, gains.era, gains)
                                  : "清零"
                                : isLongAbandon
                                ? `结算 ${gains.total}`
                                : formatGainBreakdown(gains.base, gains.rank, gains.era, gains)}
                            </td>
                            <td
                              style={{
                                padding: "0.875rem 1rem",
                                textAlign: "center",
                                fontFamily: "var(--font-mono)",
                                fontWeight: 800,
                                fontSize: uiRem(1),
                                color: gains.total > 0 ? "#fbbf24" : gains.total < 0 ? "#f87171" : "var(--color-text-muted)",
                              }}
                            >
                              {gains.total > 0 ? "+" : ""}{gains.total}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                  本轮未进行有效投资
                </div>
              )}
            </div>
            )}

            {/* 项目全览 */}
            <div style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: "1rem", padding: "1.25rem" }}>
              <h3 style={{ fontWeight: 700, color: "white", marginBottom: "1rem", fontSize: uiRem(1) }}>🌍 本轮项目全览</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.875rem" }}>
                {snapshot.results.map((r) => (
                  <GlobalCard
                    key={r.projectId}
                    result={r}
                    me={me}
                    game={game}
                    personalLabel={embed ? me.name : "个人"}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 右侧：排行榜 */}
          <div>
            <div
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: "1rem",
                overflow: "hidden",
                position: "sticky",
                top: "5rem",
              }}
            >
              <div style={{ background: "rgba(245,158,11,0.06)", padding: "1rem", borderBottom: "1px solid rgba(245,158,11,0.15)", textAlign: "center" }}>
                <h3 style={{ fontWeight: 700, color: "#fbbf24", fontSize: uiRem(1) }}>🏆 财富排行</h3>
              </div>
              <div style={{ padding: "0.75rem" }}>
                {leaderboard.map((p, idx) => {
                  const isMe = !embed && p.id === me.id;
                  const badge = rankBadge(idx);
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.625rem",
                        padding: "0.625rem 0.5rem",
                        borderRadius: "0.5rem",
                        background: isMe ? "rgba(245,158,11,0.08)" : "transparent",
                        border: isMe ? "1px solid rgba(245,158,11,0.2)" : "1px solid transparent",
                        marginBottom: "0.375rem",
                      }}
                    >
                      <span
                        style={{
                          width: "1.5rem",
                          height: "1.5rem",
                          borderRadius: "50%",
                          background: badge.background,
                          color: badge.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: uiRem(0.65),
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ flex: 1, fontWeight: isMe ? 700 : 400, color: isMe ? "#fbbf24" : "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: uiRem(0.9) }}>
                        {p.name}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: isMe ? "#fbbf24" : "var(--color-text-secondary)", fontSize: uiRem(0.95) }}>
                        {embed || isMe ? p.wealth : "???"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 确认按钮 */}
      {!embed && (
      <div
        ref={confirmDockRef}
        className="investment-submit-dock"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(7,11,20,0.95)",
          borderTop: "1px solid var(--color-border)",
          backdropFilter: "blur(20px)",
          display: "flex",
          justifyContent: "center",
          zIndex: 50,
        }}
      >
        <button
          onClick={() => socket.emit("playerReady")}
          className="btn btn-primary btn-lg"
          style={{ padding: "0.875rem 3.5rem", fontSize: uiRem(1.05) }}
        >
          {me.ready ? "✅ 已确认，等待其他人..." : "确认战绩，继续 →"}
        </button>
      </div>
      )}
    </div>
  );
};
