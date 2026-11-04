import React, { useEffect, useMemo, useRef, useState } from "react";
import { uiRem } from "../utils/typography";
import { GameState, Player } from "../types";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  HELP_TABS,
  HelpTabId,
  HELP_FLOW_OVERVIEW,
  HELP_BUFF_GUIDE_SECTIONS,
  buildBuffHelpEntries,
  SIDEBAR_ACTIVITY_ITEMS,
  GUIDE_MERGED_TAB_IDS,
  PlayerSidebarPanelId,
} from "../config/playerHelpReference";
import {
  CatalogProjectType,
  formatRankList,
  formatShortBurstPenaltyForGame,
  PROJECT_CATALOG_BY_ID,
  ProjectCatalogEntry,
  rankRewardsForGameProject,
  resolveRankRewardTierCountFromGame,
  SETTLEMENT_TIMING_SHORT,
} from "../config/projectCatalog";
import {
  buildProjectHelpRows,
  buildAppearedCatalogEntries,
  resolveProjectStatus,
  ProjectHelpRow,
} from "../utils/projectHelpTable";
import { ProjectTypesRulesTable } from "./help/ProjectTypesRulesTable";
import { GuideResourcesBlock, GuideFlowBlock, GuideChatBlock } from "./help/GuideBlocks";
import { BuffHelpCardBody } from "./help/BuffHelpCardBody";
import { BuffDescText } from "../utils/buffDescEmphasis";
import { SIDEBAR_PROJECT_TYPES_RULE_LEAD } from "../config/tutorialProjectTypes";
import { ProjectTypeLabel } from "./help/ProjectTypeLabel";
import { PlayerSettlementHistory } from "./PlayerSettlementHistory";

export type PlayerSidebarPanel = null | PlayerSidebarPanelId;

const PANEL_TITLE: Record<PlayerSidebarPanelId, string> = Object.fromEntries(
  SIDEBAR_ACTIVITY_ITEMS.map((item) => [item.id, item.title])
) as Record<PlayerSidebarPanelId, string>;

interface Props {
  panel: PlayerSidebarPanel;
  onPanelChange: (panel: PlayerSidebarPanel) => void;
  game: GameState;
  me: Player;
  /** 时代页等：展开时不挤主栏，侧栏浮层遮挡 */
  overlayWhenOpen?: boolean;
  /** 教程「动手试一试」内嵌：不占满视口高度，与主内容横排 */
  embedInTutorial?: boolean;
}

const thStyle: React.CSSProperties = {
  padding: "0.32rem 0.12rem",
  fontWeight: 700,
  fontSize: uiRem(0.72),
  color: "var(--color-text-muted)",
  textAlign: "center",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "0.28rem 0.12rem",
  fontSize: uiRem(0.78),
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  verticalAlign: "middle",
};

const EMPTY_CELL_MARK = "—";

const buffHelpChipBaseStyle: React.CSSProperties = {
  fontSize: uiRem(0.72),
  fontWeight: 700,
  padding: "0.15rem 0.45rem",
  borderRadius: "9999px",
};

interface CardAuctionWinner {
  playerId: string;
  playerName: string;
  count: number;
}

const PLAYER_HELP_WIDTH_KEY = "player-help-sidebar-width";
const PLAYER_HELP_MIN_WIDTH = 300;
const PLAYER_HELP_MAX_WIDTH_DESKTOP = 900;

function defaultOpenWidthPx(isDrawer: boolean): number {
  const vw = window.innerWidth;
  if (isDrawer) return Math.min(360, Math.round(vw * 0.92));
  return Math.min(560, Math.round(vw * 0.58));
}

function maxOpenWidthPx(isDrawer: boolean): number {
  const vw = window.innerWidth;
  if (isDrawer) return Math.round(vw * 0.92);
  return Math.min(PLAYER_HELP_MAX_WIDTH_DESKTOP, Math.round(vw * 0.85));
}

function clampOpenWidthPx(px: number, isDrawer: boolean): number {
  return Math.round(Math.max(PLAYER_HELP_MIN_WIDTH, Math.min(maxOpenWidthPx(isDrawer), px)));
}

function readStoredOpenWidth(): number | null {
  try {
    const raw = localStorage.getItem(PLAYER_HELP_WIDTH_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function helpCellClass(value: string, extra?: string): string | undefined {
  const classes = [extra, value === EMPTY_CELL_MARK ? "player-help-cell-empty" : undefined].filter(Boolean);
  return classes.length > 0 ? classes.join(" ") : undefined;
}

const SETTLEMENT_LEGEND_TYPES: CatalogProjectType[] = ["short", "long", "risk"];

function ProjectSettlementLegend() {
  return (
    <div className="player-help-settlement-legend" aria-label="三种项目结算方式">
      {SETTLEMENT_LEGEND_TYPES.map((type) => (
        <div key={type} className="player-help-settlement-legend-row">
          <ProjectTypeLabel type={type} />
          <span>{SETTLEMENT_TIMING_SHORT[type]}</span>
        </div>
      ))}
    </div>
  );
}

function annotateDynamicRows(rows: ProjectHelpRow[]): { row: ProjectHelpRow; afterSeparator: boolean }[] {
  let afterSeparator = false;
  return rows.map((row) => {
    if (row.kind === "separator") {
      afterSeparator = true;
      return { row, afterSeparator: false };
    }
    const out = { row, afterSeparator };
    afterSeparator = false;
    return out;
  });
}

/** 与「不可再投项目」同一套列：名称 / 时代 / 类型 / 上限 / 回报 / 排名奖 / 投爆罚 / 状态 */
function projectStatTableHeaders(rankTierCount: number): string[] {
  return [
    "名称",
    "时代",
    "类型",
    "上限",
    "回报",
    `排名奖(1–${rankTierCount})`,
    `投爆罚(1–${rankTierCount})`,
    "状态",
  ];
}

function ProjectStatTableCells({
  name,
  era,
  projectType,
  catalog,
  statusChip,
  statusTooltip,
  statusChipColor,
  game,
}: {
  name: string;
  era: string;
  projectType?: CatalogProjectType;
  catalog?: ProjectCatalogEntry;
  statusChip: string;
  statusTooltip: string;
  statusChipColor?: string;
  game: GameState;
}) {
  const entry = catalog;
  const maxEnergy = entry?.maxEnergy;
  const returnHint = entry?.baseReturnHint ?? EMPTY_CELL_MARK;
  const rankDisplay = entry ? formatRankList(rankRewardsForGameProject(game, entry)) : EMPTY_CELL_MARK;
  const burstPenalty = entry ? formatShortBurstPenaltyForGame(game, entry) : EMPTY_CELL_MARK;

  return (
    <>
      <td style={tdStyle}>{name}</td>
      <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }} className="player-help-cell-nowrap">
        {era || EMPTY_CELL_MARK}
      </td>
      <td style={tdStyle}>
        {projectType ? <ProjectTypeLabel type={projectType} /> : EMPTY_CELL_MARK}
      </td>
      <td style={{ ...tdStyle, fontFamily: "var(--font-mono)" }} className="player-help-cell-nowrap">
        {maxEnergy ?? EMPTY_CELL_MARK}
      </td>
      <td style={tdStyle} className="player-help-cell-nowrap">
        {returnHint}
      </td>
      <td style={{ ...tdStyle, fontFamily: "var(--font-mono)" }} className={helpCellClass(rankDisplay)}>
        {rankDisplay}
      </td>
      <td
        style={{
          ...tdStyle,
          fontFamily: "var(--font-mono)",
          color: burstPenalty === EMPTY_CELL_MARK ? undefined : "#fca5a5",
        }}
        className={helpCellClass(burstPenalty)}
      >
        {burstPenalty}
      </td>
      <td style={tdStyle} className={helpCellClass(statusChip)}>
        <span
          className="player-help-status-chip"
          style={statusChipColor ? { color: statusChipColor } : undefined}
          title={statusTooltip}
          aria-label={statusTooltip}
        >
          {statusChip}
        </span>
      </td>
    </>
  );
}

export const PlayerGameHelp: React.FC<Props> = ({
  panel,
  onPanelChange,
  game,
  me,
  overlayWhenOpen = false,
  embedInTutorial = false,
}) => {
  const open = panel !== null;
  const [openWidthPx, setOpenWidthPx] = useState<number | null>(() =>
    embedInTutorial ? null : readStoredOpenWidth()
  );
  const [isResizing, setIsResizing] = useState(false);
  const isDesktopLayout = useMediaQuery("(min-width: 1024px)", true);
  const asideRef = useRef<HTMLElement>(null);
  const sidebarBodyRef = useRef<HTMLDivElement>(null);
  const activityRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const prevOpenRef = useRef(open);
  const lastPanelRef = useRef<PlayerSidebarPanel>(null);
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const dynamicRows = useMemo(() => buildProjectHelpRows(game, me), [game, me]);
  const dynamicAnnotated = useMemo(() => annotateDynamicRows(dynamicRows), [dynamicRows]);
  const appearedCatalog = useMemo(() => buildAppearedCatalogEntries(game, me), [game, me]);
  const rankTierCount = resolveRankRewardTierCountFromGame(game);
  const buffEntries = useMemo(() => buildBuffHelpEntries(), []);

  const auctionWinnersByCardId = useMemo(() => {
    const wins = game.auctionSessionWins ?? [];
    const seatOrder = new Map(game.players.map((p, i) => [p.id, i]));
    const byCard = new Map<string, Map<string, CardAuctionWinner>>();
    for (const w of wins) {
      const playerName =
        game.players.find((p) => p.id === w.playerId)?.name ?? w.playerName ?? w.playerId;
      let byPlayer = byCard.get(w.cardId);
      if (!byPlayer) {
        byPlayer = new Map();
        byCard.set(w.cardId, byPlayer);
      }
      const existing = byPlayer.get(w.playerId);
      if (existing) existing.count += 1;
      else byPlayer.set(w.playerId, { playerId: w.playerId, playerName, count: 1 });
    }
    const result = new Map<string, CardAuctionWinner[]>();
    for (const [cardId, byPlayer] of byCard) {
      result.set(
        cardId,
        [...byPlayer.values()].sort(
          (a, b) =>
            (seatOrder.get(a.playerId) ?? game.players.length) -
              (seatOrder.get(b.playerId) ?? game.players.length) ||
            a.playerId.localeCompare(b.playerId)
        )
      );
    }
    return result;
  }, [game.auctionSessionWins, game.players]);

  const hasAuctionSessionWins = (game.auctionSessionWins?.length ?? 0) > 0;

  useEffect(() => {
    if (embedInTutorial || !open || isDesktopLayout) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isDesktopLayout, embedInTutorial]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const root = asideRef.current;
      const focusInSidebar = root?.contains(document.activeElement) ?? false;
      const escClosesGlobally = !isDesktopLayout || overlayWhenOpen;
      if (!escClosesGlobally && !focusInSidebar) return;
      e.preventDefault();
      onPanelChange(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onPanelChange, isDesktopLayout, overlayWhenOpen]);

  useEffect(() => {
    if (panel) lastPanelRef.current = panel;
  }, [panel]);

  useEffect(() => {
    if (!open || !panel) return;
    sidebarBodyRef.current?.scrollTo({ top: 0 });
  }, [open, panel]);

  useEffect(() => {
    if (prevOpenRef.current && !open) {
      const lastId = lastPanelRef.current;
      if (lastId) activityRefs.current[lastId]?.focus({ preventScroll: true });
    }
    prevOpenRef.current = open;
  }, [open]);

  const handleActivityKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = SIDEBAR_ACTIVITY_ITEMS.findIndex((item) => item.id === panel);
    const focusedIdx = SIDEBAR_ACTIVITY_ITEMS.findIndex(
      (item) => activityRefs.current[item.id] === document.activeElement
    );
    const base = focusedIdx >= 0 ? focusedIdx : idx >= 0 ? idx : 0;
    let nextIdx: number | null = null;
    if (e.key === "ArrowDown") nextIdx = (base + 1) % SIDEBAR_ACTIVITY_ITEMS.length;
    else if (e.key === "ArrowUp") nextIdx = (base - 1 + SIDEBAR_ACTIVITY_ITEMS.length) % SIDEBAR_ACTIVITY_ITEMS.length;
    if (nextIdx === null) return;
    e.preventDefault();
    const nextId = SIDEBAR_ACTIVITY_ITEMS[nextIdx].id;
    if (open) onPanelChange(nextId);
    activityRefs.current[nextId]?.focus();
  };

  const selectActivity = (id: PlayerSidebarPanelId) => {
    if (panel === id) onPanelChange(null);
    else onPanelChange(id);
  };

  const emptyDynamicHint =
    game.activeProjects.length === 0 &&
    (game.completedProjects?.length ?? 0) === 0 &&
    (game.uncompletedProjects?.length ?? 0) === 0
      ? "本局尚未发牌，开战后这里会显示你仍可投的项目"
      : "当前没有仍可投的项目";

  const useDrawerOverlay = open && !isDesktopLayout && !embedInTutorial;
  const useDesktopOverlay = open && overlayWhenOpen && isDesktopLayout && !embedInTutorial;
  const isDrawerMode = useDrawerOverlay;

  const openSidebarWidthPx = useMemo(() => {
    if (!open) return null;
    const base =
      openWidthPx ??
      (embedInTutorial ? Math.min(420, Math.round(window.innerWidth * 0.42)) : defaultOpenWidthPx(isDrawerMode));
    return clampOpenWidthPx(base, isDrawerMode);
  }, [open, openWidthPx, isDrawerMode, embedInTutorial]);

  useEffect(() => {
    if (!open) return;
    const onWindowResize = () => {
      setOpenWidthPx((prev) => {
        const base = prev ?? defaultOpenWidthPx(isDrawerMode);
        return clampOpenWidthPx(base, isDrawerMode);
      });
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, [open, isDrawerMode]);

  const persistOpenWidth = (w: number) => {
    const clamped = clampOpenWidthPx(w, isDrawerMode);
    setOpenWidthPx(clamped);
    if (embedInTutorial) return;
    try {
      localStorage.setItem(PLAYER_HELP_WIDTH_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  };

  const onResizeHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const aside = asideRef.current;
    if (!aside) return;
    resizeDragRef.current = { startX: e.clientX, startWidth: aside.getBoundingClientRect().width };
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const onResizeHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeDragRef.current) return;
    const delta = e.clientX - resizeDragRef.current.startX;
    const next = clampOpenWidthPx(resizeDragRef.current.startWidth + delta, isDrawerMode);
    setOpenWidthPx(next);
  };

  const endResizeHandle = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeDragRef.current) return;
    resizeDragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsResizing(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    const w = asideRef.current?.getBoundingClientRect().width;
    if (w) persistOpenWidth(w);
  };

  const renderTabBody = (tabId: HelpTabId) => {
    if (tabId === "projects_table") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <section>
            <h3 style={{ fontSize: uiRem(1.1), fontWeight: 800, color: "#60a5fa", marginBottom: "0.65rem" }}>
              <span aria-hidden style={{ fontSize: uiRem(1.2) }}>🎯 </span>可投项目
            </h3>
            {dynamicRows.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.85) }}>{emptyDynamicHint}</p>
            ) : (
              <div className="player-help-table-wrap">
                <table className="player-help-table">
                  <thead>
                    <tr>
                      {projectStatTableHeaders(rankTierCount).map((h) => (
                        <th key={h} scope="col" style={thStyle}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dynamicAnnotated.map(({ row, afterSeparator }, idx) => {
                      if (row.kind === "separator") {
                        return (
                          <tr key={`sep-${idx}`} className="player-help-row-separator" aria-hidden>
                            <td colSpan={8} />
                          </tr>
                        );
                      }
                      const catalog = row.projectId != null ? PROJECT_CATALOG_BY_ID[row.projectId] : undefined;
                      return (
                        <tr
                          key={row.projectId}
                          className={afterSeparator ? "player-help-row-after-separator" : undefined}
                        >
                          <ProjectStatTableCells
                            name={row.name ?? `#${row.projectId}`}
                            era={row.eraShort ?? catalog?.era ?? EMPTY_CELL_MARK}
                            projectType={row.projectType ?? catalog?.type}
                            catalog={catalog}
                            statusChip={row.status?.chip ?? EMPTY_CELL_MARK}
                            statusTooltip={row.status?.tooltip ?? ""}
                            statusChipColor={row.status?.chipColor}
                            game={game}
                          />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3 style={{ fontSize: uiRem(1.1), fontWeight: 800, color: "#c084fc", marginBottom: "0.35rem" }}>
              <span aria-hidden style={{ fontSize: uiRem(1.2) }}>📋 </span>不可再投项目
            </h3>
            {appearedCatalog.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.85) }}>
                暂无不可再投的项目
              </p>
            ) : (
              <>
                <p style={{ margin: "0 0 0.5rem", fontSize: uiRem(0.68), color: "var(--color-text-muted)" }}>
                  共 {appearedCatalog.length} 项 · 左右滑动查看
                </p>
                <div className="player-help-table-wrap">
                  <table className="player-help-table">
                    <thead>
                      <tr>
                        {projectStatTableHeaders(rankTierCount).map((h) => (
                          <th key={h} scope="col" style={thStyle}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {appearedCatalog.map((p) => {
                        const status = resolveProjectStatus(game, me, p.id);
                        return (
                          <tr key={p.id}>
                            <ProjectStatTableCells
                              name={p.name}
                              era={p.era}
                              projectType={p.type}
                              catalog={p}
                              statusChip={status.chip}
                              statusTooltip={status.tooltip}
                              statusChipColor={status.chipColor}
                              game={game}
                            />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      );
    }

    if (tabId === "buffs") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {HELP_BUFF_GUIDE_SECTIONS.map((section) => (
              <div key={section.title}>
                <div
                  style={{
                    fontSize: uiRem(0.72),
                    fontWeight: 800,
                    color: "var(--color-text-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  {section.title}
                </div>
                <ul className="player-guide-buff-rules" style={{ fontSize: uiRem(0.78) }}>
                  {section.bullets.map((line, i) => (
                    <li key={`${section.title}-${i}`}>
                      <BuffDescText text={line} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {hasAuctionSessionWins && (
            <p
              style={{
                margin: 0,
                fontSize: uiRem(0.72),
                color: "var(--color-text-muted)",
                lineHeight: 1.4,
              }}
            >
              拍得标注仅统计拍卖成交，不代表仍在手牌（可能已使用或被烧毁）
            </p>
          )}
          {buffEntries.map((b, index) => {
            const winners = auctionWinnersByCardId.get(b.cardId) ?? [];
            const prev = buffEntries[index - 1];
            const sectionBreak = !!prev?.everyAuction && !b.everyAuction;
            return (
            <React.Fragment key={b.cardId}>
              {sectionBreak && (
                <div
                  role="presentation"
                  style={{
                    height: 0,
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    margin: "0.15rem 0",
                  }}
                />
              )}
            <div
              style={{
                padding: "0.65rem 0.75rem",
                borderRadius: "0.75rem",
                border: `1px solid ${b.color}33`,
                background: `${b.color}10`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.25rem",
                }}
              >
                <span aria-hidden style={{ fontSize: uiRem(1.2) }}>
                  {b.icon}
                </span>
                <span style={{ fontWeight: 800, color: b.color, fontSize: uiRem(0.95) }}>{b.name}</span>
                <span
                  className="player-help-buff-chip player-help-buff-chip--pool"
                  title="该道具出现在第几场拍卖"
                  style={buffHelpChipBaseStyle}
                >
                  {b.everyAuction ? "每场" : `第${b.auctionRound}场`}
                </span>
                {winners.map((row) => {
                  const isMe = row.playerId === me.id;
                  const label = row.count > 1 ? `${row.playerName} ×${row.count}` : row.playerName;
                  const ariaLabel =
                    row.count > 1
                      ? `拍卖拍得 ${row.playerName} ${row.count} 张，不含是否已使用`
                      : `拍卖拍得 ${row.playerName}，不含是否已使用`;
                  return (
                    <span
                      key={row.playerId}
                      className={`player-help-buff-chip player-help-buff-chip--winner${isMe ? " player-help-buff-chip--winner-me" : ""}`}
                      title="本局拍卖拍得，不含是否已使用"
                      aria-label={ariaLabel}
                      style={buffHelpChipBaseStyle}
                    >
                      <span className="player-help-buff-chip-prefix" aria-hidden>拍得</span>
                      {label}
                    </span>
                  );
                })}
              </div>
              <BuffHelpCardBody entry={b} />
            </div>
            </React.Fragment>
            );
          })}
        </div>
      );
    }

    if (tabId === "projects_rules") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <p
            style={{
              margin: 0,
              padding: "0.55rem 0.75rem",
              borderRadius: "0.65rem",
              background: "rgba(96,165,250,0.08)",
              border: "1px solid rgba(96,165,250,0.22)",
              color: "#93c5fd",
              fontSize: uiRem(0.9),
              fontWeight: 700,
              lineHeight: 1.45,
            }}
          >
            项目的总收益 = 基础收益 + 排名奖惩 + 时代奖励
          </p>
          <ProjectTypesRulesTable
            lineFont={uiRem(0.82)}
            introLead={SIDEBAR_PROJECT_TYPES_RULE_LEAD}
            boardRemindersSectionId="player-guide-project-board-reminders"
          />
        </div>
      );
    }

    if (tabId === "flow") {
      return <GuideFlowBlock overview={HELP_FLOW_OVERVIEW} lineFont={uiRem(0.82)} />;
    }

    if (tabId === "resources") {
      return <GuideResourcesBlock lineFont={uiRem(0.82)} />;
    }

    if (tabId === "misc") {
      return <GuideChatBlock lineFont={uiRem(0.82)} />;
    }

    return null;
  };

  const renderGuidePanel = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {GUIDE_MERGED_TAB_IDS.map((tabId) => {
        const def = HELP_TABS.find((t) => t.id === tabId);
        return (
          <section key={tabId} aria-labelledby={`player-guide-section-${tabId}`}>
            <h3
              id={`player-guide-section-${tabId}`}
              style={{
                margin: "0 0 0.5rem",
                fontSize: uiRem(0.95),
                fontWeight: 800,
                color: "white",
              }}
            >
              {def ? (
                <>
                  <span aria-hidden style={{ marginRight: "0.25rem" }}>{def.icon}</span>
                  {def.title}
                </>
              ) : (
                tabId
              )}
            </h3>
            {renderTabBody(tabId)}
          </section>
        );
      })}
    </div>
  );

  return (
    <>
      {useDrawerOverlay && (
        <button
          type="button"
          className="player-help-backdrop"
          aria-label="关闭侧栏"
          onClick={() => onPanelChange(null)}
        />
      )}
      {useDesktopOverlay && <div className="player-help-rail-spacer" aria-hidden />}
      <aside
        ref={asideRef}
        className={`player-help-sidebar${open ? " player-help-sidebar--open" : ""}${
          useDrawerOverlay ? " player-help-sidebar--drawer" : ""
        }${useDesktopOverlay ? " player-help-sidebar--overlay" : ""}${
          embedInTutorial ? " player-help-sidebar--tutorial-embed" : ""
        }${isResizing ? " player-help-sidebar--resizing" : ""}`}
        style={openSidebarWidthPx != null ? { width: openSidebarWidthPx } : undefined}
        aria-label="玩家侧栏"
      >
        <div
          className="player-help-sidebar-rail"
          role="tablist"
          aria-orientation="vertical"
          aria-label="侧栏入口"
          onKeyDown={handleActivityKeyDown}
        >
          {SIDEBAR_ACTIVITY_ITEMS.map((item) => {
            const active = panel === item.id;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  activityRefs.current[item.id] = el;
                }}
                type="button"
                role="tab"
                id={`player-sidebar-tab-${item.id}`}
                className={`player-help-activity-item${active ? " player-help-activity-item--active" : ""}`}
                aria-label={item.title}
                aria-selected={open && active}
                tabIndex={open ? (active ? 0 : -1) : 0}
                aria-controls="player-help-sidebar-panel"
                title={item.title}
                onClick={() => selectActivity(item.id)}
              >
                <span className="player-help-activity-icon" aria-hidden>{item.icon}</span>
                <span className="player-help-activity-label">{item.label}</span>
              </button>
            );
          })}
        </div>

        {open && panel && (
          <div
            id="player-help-sidebar-panel"
            role="tabpanel"
            aria-labelledby={`player-sidebar-tab-${panel}`}
            className="player-help-sidebar-panel"
          >
            <div className="player-help-sidebar-header">
              <h2 id="player-help-title" style={{ margin: 0, fontWeight: 800, fontSize: uiRem(1.05), color: "white" }}>
                {PANEL_TITLE[panel]}
              </h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPanelChange(null)} aria-label="收起">
                收起
              </button>
            </div>

            {panel === "projects" && <ProjectSettlementLegend />}

            <div ref={sidebarBodyRef} className="player-help-sidebar-body">
              {panel === "projects" && renderTabBody("projects_table")}
              {panel === "buffs" && renderTabBody("buffs")}
              {panel === "guide" && renderGuidePanel()}
              {panel === "history" && <PlayerSettlementHistory game={game} me={me} />}
            </div>
          </div>
        )}

        {open && isDesktopLayout && !embedInTutorial && (
          <div
            className="player-help-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="拖动调整侧栏宽度"
            title="拖动调整宽度"
            onPointerDown={onResizeHandlePointerDown}
            onPointerMove={onResizeHandlePointerMove}
            onPointerUp={endResizeHandle}
            onPointerCancel={endResizeHandle}
          />
        )}
      </aside>
    </>
  );
};
