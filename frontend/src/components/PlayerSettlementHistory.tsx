import React, { useEffect, useMemo, useRef, useState } from "react";
import { uiRem } from "../utils/typography";
import type { GameState, Player, SettlementHistoryEntry } from "../types";
import {
  formatGainBreakdown,
  isLongAbandonFromSnapshot,
  myProjectsInRound,
  myRoundNetIncome,
  settlementSnapshotStatusSuffix,
  getSettlementHistoryForPlayer,
} from "../utils/settlementDisplay";
import {
  buildMyProjectInvestQuickRef,
  hasAnyInvestQuickRef,
  type ProjectInvestQuickRow,
} from "../utils/projectInvestQuickRef";
import { ProjectTypeLabel } from "./help/ProjectTypeLabel";

const ERA_NAMES: Record<number, string> = { 1: "青年", 2: "壮年", 3: "中年", 4: "老年" };

interface Props {
  game: GameState;
  me: Player;
}

function roundLabel(entry: SettlementHistoryEntry): string {
  const era = ERA_NAMES[entry.currentEra] ?? `第${entry.currentEra}时代`;
  return `${era} 第${entry.roundInEra}轮 · 第 ${entry.round} 轮`;
}

function formatSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n}`;
}

const thQuickStyle: React.CSSProperties = {
  padding: "0.32rem 0.12rem",
  fontWeight: 700,
  fontSize: uiRem(0.68),
  color: "var(--color-text-muted)",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
};

function InvestQuickTable({ rows }: { rows: ProjectInvestQuickRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="player-help-table-wrap">
      <table className="player-help-table">
        <thead>
          <tr>
            <th scope="col" style={{ ...thQuickStyle, textAlign: "left" }}>项目名称</th>
            <th scope="col" style={{ ...thQuickStyle, textAlign: "center" }}>类型</th>
            <th scope="col" style={{ ...thQuickStyle, textAlign: "center" }}>累计</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.projectId}>
              <td
                style={{
                  padding: "0.28rem 0.12rem",
                  fontSize: uiRem(0.78),
                  color: "white",
                  fontWeight: 600,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {row.name}
              </td>
              <td
                style={{
                  padding: "0.28rem 0.12rem",
                  fontSize: uiRem(0.78),
                  textAlign: "center",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <ProjectTypeLabel type={row.type} />
              </td>
              <td
                style={{
                  padding: "0.28rem 0.12rem",
                  fontSize: uiRem(0.78),
                  textAlign: "center",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: row.cumulativeEnergy > 0 ? "var(--color-text-secondary)" : "var(--color-text-muted)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {row.cumulativeEnergy}⚡
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const PlayerSettlementHistory: React.FC<Props> = ({ game, me }) => {
  const history = useMemo(() => {
    const list = getSettlementHistoryForPlayer(game);
    return [...list].sort((a, b) => b.round - a.round);
  }, [game]);

  const cumulativeNet = useMemo(
    () => history.reduce((sum, entry) => sum + myRoundNetIncome(entry.results, me.id), 0),
    [history, me.id]
  );

  const investQuickRef = useMemo(
    () => buildMyProjectInvestQuickRef(game, me),
    [game, me]
  );

  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  const prevLatestRoundRef = useRef<number | null>(null);

  useEffect(() => {
    if (history.length === 0) {
      setExpandedRound(null);
      prevLatestRoundRef.current = null;
      return;
    }
    const latest = history[0].round;
    const hadNewRound =
      prevLatestRoundRef.current !== null && latest > prevLatestRoundRef.current;
    prevLatestRoundRef.current = latest;
    setExpandedRound((prev) => {
      if (hadNewRound) return latest;
      if (prev !== null && history.some((h) => h.round === prev)) return prev;
      return latest;
    });
  }, [history]);

  if (history.length === 0 && !hasAnyInvestQuickRef(investQuickRef)) {
    return (
      <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.88), lineHeight: 1.55, margin: 0 }}>
        结算后，这里会留下每一轮的个人战报
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {history.length > 0 && (
      <div
        className="player-history-summary"
        style={{
          padding: "0.75rem 0.85rem",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
          background: "rgba(201, 151, 58, 0.06)",
        }}
      >
        <div
          style={{
            fontSize: uiRem(0.7),
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--color-text-muted)",
            marginBottom: "0.35rem",
          }}
        >
          已结算 {history.length} 轮 · 累计净收益
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: uiRem(1.35),
            fontWeight: 900,
            color: cumulativeNet >= 0 ? "#34d399" : "#f87171",
          }}
        >
          {formatSigned(cumulativeNet)}
        </div>
      </div>
      )}

      {hasAnyInvestQuickRef(investQuickRef) ? (
        <section
          className="player-history-invest-quick"
          aria-labelledby="player-history-invest-quick-title"
          style={{
            padding: "0.75rem 0.85rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: "rgba(201, 151, 58, 0.04)",
          }}
        >
          <h3
            id="player-history-invest-quick-title"
            style={{ margin: "0 0 0.2rem", fontSize: uiRem(0.92), fontWeight: 800, color: "white" }}
          >
            投入速查
          </h3>
          <p style={{ margin: "0 0 0.65rem", fontSize: uiRem(0.72), color: "var(--color-text-muted)" }}>
            各项目本人累计投入精力
          </p>
          {investQuickRef.investable.length > 0 && (
            <div style={{ marginBottom: investQuickRef.other.length > 0 ? "0.85rem" : 0 }}>
              <div
                style={{
                  fontSize: uiRem(0.72),
                  fontWeight: 700,
                  color: "var(--color-text-muted)",
                  marginBottom: "0.35rem",
                }}
              >
                当前可投
              </div>
              <InvestQuickTable rows={investQuickRef.investable} />
            </div>
          )}
          {investQuickRef.other.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: uiRem(0.72),
                  fontWeight: 700,
                  color: "var(--color-text-muted)",
                  marginBottom: "0.35rem",
                }}
              >
                其他项目
              </div>
              <InvestQuickTable rows={investQuickRef.other} />
            </div>
          )}
        </section>
      ) : (
        history.length > 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.85), margin: 0 }}>
            暂无项目投入记录
          </p>
        )
      )}

      {history.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.85), lineHeight: 1.55, margin: 0 }}>
          尚未有结算记录；每轮结算后下方会出现个人战报
        </p>
      ) : (
      <div className="player-history-round-list" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {history.map((entry) => {
          const roundNet = myRoundNetIncome(entry.results, me.id);
          const expanded = expandedRound === entry.round;
          const myRows = myProjectsInRound(entry.results, me.id);
          const panelId = `player-history-round-${entry.round}`;

          return (
            <div
              key={entry.round}
              className={`player-history-round-card${expanded ? " player-history-round-card--open" : ""}`}
              style={{
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-card)",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                className="player-history-round-trigger"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setExpandedRound(expanded ? null : entry.round)}
                aria-label={`${roundLabel(entry)}，本轮净收益 ${formatSigned(roundNet)}`}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  padding: "0.65rem 0.75rem",
                  border: "none",
                  background: expanded ? "rgba(255,255,255,0.04)" : "transparent",
                  color: "var(--color-text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: uiRem(0.82), fontWeight: 700, minWidth: 0, flex: 1 }}>
                  {roundLabel(entry)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 800,
                    fontSize: uiRem(0.9),
                    color: roundNet >= 0 ? "#34d399" : roundNet < 0 ? "#f87171" : "var(--color-text-muted)",
                    flexShrink: 0,
                  }}
                >
                  {formatSigned(roundNet)}
                </span>
                <span className="player-history-round-chevron" aria-hidden />
              </button>

              {expanded && (
                <div id={panelId} className="player-history-round-body" style={{ padding: "0 0.5rem 0.65rem" }}>
                  {myRows.length === 0 ? (
                    <p
                      style={{
                        padding: "0.75rem 0.5rem",
                        margin: 0,
                        textAlign: "center",
                        color: "var(--color-text-muted)",
                        fontSize: uiRem(0.85),
                      }}
                    >
                      本轮未参与
                    </p>
                  ) : (
                    <div className="player-help-table-wrap">
                      <table className="player-help-table">
                        <thead>
                          <tr>
                            {["项目名称", "投入", "基础+排名+时代", "总回报"].map((h, i) => (
                              <th
                                key={h}
                                scope="col"
                                style={{
                                  padding: "0.32rem 0.12rem",
                                  fontWeight: 700,
                                  fontSize: uiRem(0.68),
                                  color: "var(--color-text-muted)",
                                  textAlign: i > 0 ? "center" : "left",
                                  borderBottom: "1px solid var(--color-border)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {myRows.map((res) => {
                            const invest = res.playerInvestments[me.id] ?? 0;
                            const gains = res.playerGains[me.id] || {
                              total: 0,
                              base: 0,
                              rank: 0,
                              era: 0,
                            };
                            const isLongAbandon = isLongAbandonFromSnapshot(res, gains);
                            const { statusSuffix, statusSuffixColor, rowColor } =
                              settlementSnapshotStatusSuffix(res, gains);
                            return (
                              <tr key={res.projectId}>
                                <td
                                  style={{
                                    padding: "0.28rem 0.12rem",
                                    fontSize: uiRem(0.78),
                                    color: "white",
                                    fontWeight: 600,
                                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                                  }}
                                >
                                  {res.name}
                                  <span
                                    style={{
                                      marginLeft: "0.25rem",
                                      fontSize: uiRem(0.65),
                                      color: statusSuffixColor,
                                    }}
                                  >
                                    {statusSuffix}
                                  </span>
                                </td>
                                <td
                                  style={{
                                    padding: "0.28rem 0.12rem",
                                    fontSize: uiRem(0.78),
                                    textAlign: "center",
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--color-text-secondary)",
                                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                                  }}
                                >
                                  {invest}
                                </td>
                                <td
                                  style={{
                                    padding: "0.28rem 0.12rem",
                                    fontSize: uiRem(0.72),
                                    textAlign: "center",
                                    fontFamily: "var(--font-mono)",
                                    color: rowColor,
                                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                                  }}
                                >
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
                                    padding: "0.28rem 0.12rem",
                                    fontSize: uiRem(0.78),
                                    textAlign: "center",
                                    fontFamily: "var(--font-mono)",
                                    fontWeight: 800,
                                    color:
                                      gains.total > 0
                                        ? "#fbbf24"
                                        : gains.total < 0
                                          ? "#f87171"
                                          : "var(--color-text-muted)",
                                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                                  }}
                                >
                                  {formatSigned(gains.total)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};
