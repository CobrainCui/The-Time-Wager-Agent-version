import React, { useState, useEffect } from "react";
import { uiRem } from "../utils/typography";
import { GameState, Player } from "../types";
import { socket } from "../socket";
import { useServerClockSkewRef } from "../hooks/useServerClockSkewRef";
import { isInvestmentBuffLockout } from "../utils/investmentBuffLockout";
import {
  HELP_BUFF_LOCKOUT,
  HELP_BUFF_SETTLEMENT_BULLETS,
  HELP_BUFF_USE_TIMING_BULLETS,
  HELP_INVESTMENT_SELF_UNLOCK,
} from "../config/playerHelpReference";
import { GuideBulletList } from "../components/help/GuideBulletList";

import {
  BUFF_CARD_DEFS,
  BUFF_UI_SNIPPETS,
  getBuffDef,
  LIGHTER_BURN_TARGET_OPTIONS,
} from "../config/buffCards";
import type { PlayerSidebarPanelId } from "../config/playerHelpReference";
import { BuffCardArt } from "../components/BuffCardArt";
import { BuffRoundChips } from "../components/BuffRoundChips";
import { formatBuffTargetPlayerOption } from "../utils/buffTargetPlayerLabel";
import { BuffDescText, stripBuffDescEmphasis } from "../utils/buffDescEmphasis";

interface Props {
  game: GameState;
  me: Player;
  buffImages?: Record<string, number>;
  /** 分屏嵌入时收紧标题区 */
  hideDock?: boolean;
  /** 已锁定投资时只读展示手牌 */
  readOnly?: boolean;
  /** 打开侧栏「道具」百科（指南列表） */
  onOpenBuffHelp?: (panel: PlayerSidebarPanelId) => void;
}

function canUseBuffs(
  game: GameState,
  me: Player,
  readOnly: boolean,
  buffLockout: boolean
): boolean {
  if (readOnly || me.ready || buffLockout) return false;
  return game.phase === "INVESTMENT" || game.phase === "BUFF_USAGE";
}

export const BuffUsage: React.FC<Props> = ({
  game,
  me,
  buffImages = {},
  hideDock = false,
  readOnly = false,
  onOpenBuffHelp,
}) => {
  const [selection, setSelection] = useState<{ index: number; cardId: string } | null>(null);
  const [targetPlayer, setTargetPlayer] = useState("");
  const [targetProject, setTargetProject] = useState<number | undefined>(undefined);
  const [burnCardId, setBurnCardId] = useState("");
  const clockSkewRef = useServerClockSkewRef(game.serverNow);
  const [, lockoutTick] = useState(0);

  useEffect(() => {
    if (game.phase !== "INVESTMENT" || !game.investmentEndsAt) return;
    const id = window.setInterval(() => lockoutTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [game.phase, game.investmentEndsAt]);

  const buffLockoutActive = isInvestmentBuffLockout(game, clockSkewRef.current);
  const actionsEnabled = canUseBuffs(game, me, readOnly, buffLockoutActive);
  const actionsLocked = !actionsEnabled;

  const selectedCard =
    selection && me.inventory[selection.index] === selection.cardId ? selection.cardId : null;

  useEffect(() => {
    if (actionsLocked) setSelection(null);
  }, [actionsLocked]);

  useEffect(() => {
    if (!selection) return;
    if (
      selection.index >= me.inventory.length ||
      me.inventory[selection.index] !== selection.cardId
    ) {
      setSelection(null);
    }
  }, [me.inventory, selection]);

  useEffect(() => {
    if (selectedCard === "buff_lighter" && targetPlayer === me.id) {
      setTargetPlayer("");
      setBurnCardId("");
    }
  }, [selectedCard, targetPlayer, me.id]);

  useEffect(() => {
    if (selectedCard === "buff_work_rest" && !targetPlayer) {
      setTargetPlayer(me.id);
    }
  }, [selectedCard, targetPlayer, me.id]);

  const handleUse = () => {
    if (actionsLocked) return;
    if (!selectedCard) return;
    const effectiveTargetPlayer =
      selectedCard === "buff_work_rest" ? targetPlayer || me.id : targetPlayer;
    if (selectedCard === "buff_force_buy") {
      alert("强买强卖请在拍卖阶段对主持标出的当前卡使用");
      return;
    }
    if (
      (selectedCard === "buff_slack" || selectedCard === "buff_lighter" || selectedCard === "buff_work_rest") &&
      !effectiveTargetPlayer
    ) {
      alert("请选择目标玩家");
      return;
    }
    if (selectedCard === "buff_lighter" && targetPlayer === me.id) {
      alert("打火机不能烧毁自己的卡");
      return;
    }
    if (selectedCard === "buff_short" && !targetProject) {
      alert("请选择目标项目");
      return;
    }
    if (selectedCard === "buff_lighter" && !burnCardId) {
      alert("请选择目标卡牌");
      return;
    }
    if (selectedCard === "buff_lighter") {
      const targetName = game.players.find((p) => p.id === targetPlayer)?.name ?? "对方";
      const cardName = BUFF_CARD_DEFS[burnCardId]?.name ?? burnCardId;
      const ok = window.confirm(
        stripBuffDescEmphasis(BUFF_UI_SNIPPETS.lighterUseConfirm(targetName, cardName))
      );
      if (!ok) return;
    }
    if (selectedCard === "buff_work_rest" && effectiveTargetPlayer !== me.id) {
      const targetName = game.players.find((p) => p.id === effectiveTargetPlayer)?.name ?? "对方";
      const ok = window.confirm(stripBuffDescEmphasis(BUFF_UI_SNIPPETS.workRestUseConfirm(targetName)));
      if (!ok) return;
    }
    const inventoryIndex =
      selection && me.inventory[selection.index] === selectedCard ? selection.index : undefined;
    socket.emit("useBuffCard", {
      cardId: selectedCard,
      inventoryIndex,
      targetPlayerId: effectiveTargetPlayer || undefined,
      targetProjectId: targetProject,
      burnCardId: burnCardId || undefined,
    });
    setSelection(null);
    setTargetPlayer("");
    setTargetProject(undefined);
    setBurnCardId("");
  };

  const selectedDef = selectedCard ? getBuffDef(selectedCard) : null;

  return (
    <div
      className="buff-usage-page"
      style={{
        minHeight: hideDock ? "100%" : "100vh",
        background: `radial-gradient(ellipse at 50% 0%, rgba(168,85,247,0.12) 0%, transparent 55%), #070b14`,
        paddingTop: "1.5rem",
        paddingLeft: "1rem",
        paddingRight: "1rem",
        paddingBottom: "1.5rem",
      }}
    >
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
          <h1
            style={{
              fontSize: hideDock ? "1.5rem" : "2.25rem",
              fontWeight: 900,
              background: "linear-gradient(135deg, #a855f7, #ec4899)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              marginBottom: "0.375rem",
            }}
          >
            🔮 道具
          </h1>
          <div
            style={{
              color: "var(--color-text-secondary)",
              fontSize: uiRem(hideDock ? 0.75 : 0.82),
              lineHeight: 1.55,
              maxWidth: hideDock ? "100%" : "36rem",
              margin: "0 auto",
              padding: hideDock ? "0 0.25rem" : undefined,
            }}
          >
            <GuideBulletList
              items={[...HELP_BUFF_USE_TIMING_BULLETS, ...HELP_BUFF_SETTLEMENT_BULLETS]}
              fontSize={uiRem(hideDock ? 0.75 : 0.82)}
            />
            {!hideDock && (
              <p style={{ margin: "0.35rem 0 0", fontSize: uiRem(0.82), color: "var(--color-text-secondary)" }}>
                {HELP_INVESTMENT_SELF_UNLOCK}
              </p>
            )}
            {hideDock && !readOnly && (
              <p style={{ margin: "0.35rem 0 0", fontSize: uiRem(0.72) }}>
                你已锁定投资时不可再发动道具。
              </p>
            )}
            {buffLockoutActive && (
              <p style={{ margin: "0.5rem 0 0", color: "#fbbf24", fontWeight: 600 }}>
                {HELP_BUFF_LOCKOUT}
              </p>
            )}
            {hideDock && onOpenBuffHelp && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: "0.65rem", fontSize: uiRem(0.78) }}
                onClick={() => onOpenBuffHelp("buffs")}
              >
                {BUFF_UI_SNIPPETS.buffHelpLinkLabel}
              </button>
            )}
          </div>
          {!hideDock && (
            <div style={{ marginTop: "0.75rem" }}>
              <BuffRoundChips
                me={me}
                actionsDisabled={actionsLocked}
                canAct={actionsEnabled}
              />
            </div>
          )}
        </div>

        <div className="player-responsive-split">
          <div
            style={{
              opacity: actionsLocked && !readOnly ? 0.55 : 1,
              pointerEvents: actionsLocked ? "none" : "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <h3 style={{ fontWeight: 700, fontSize: uiRem(1), color: "white" }}>📦 我的手牌</h3>
              <span
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "9999px",
                  padding: "0.125rem 0.625rem",
                  fontSize: uiRem(0.75),
                  color: "var(--color-text-muted)",
                }}
              >
                {me.inventory.length} 张
              </span>
            </div>

            {me.inventory.length === 0 ? (
              <div
                style={{
                  border: "2px dashed var(--color-border)",
                  borderRadius: "1rem",
                  height: "12rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-text-muted)",
                  gap: "0.5rem",
                }}
              >
                <span style={{ fontSize: "2.5rem" }}>🤷</span>
                <span>暂无可用卡牌</span>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.875rem" }}>
                {me.inventory.map((cardId, idx) => {
                  const def = getBuffDef(cardId);
                  const isSelected = selection?.index === idx;
                  const duplicateTotal = me.inventory.filter((id) => id === cardId).length;
                  const duplicateNo =
                    duplicateTotal > 1
                      ? me.inventory.slice(0, idx + 1).filter((id) => id === cardId).length
                      : 0;
                  return (
                    <button
                      key={idx}
                      onClick={() =>
                        !actionsLocked &&
                        setSelection(isSelected ? null : { index: idx, cardId })
                      }
                      disabled={actionsLocked}
                      style={{
                        border: `2px solid ${isSelected ? def.color : "var(--color-border)"}`,
                        borderRadius: "1rem",
                        background: isSelected ? `${def.color}18` : "var(--color-bg-card)",
                        padding: "0.65rem",
                        cursor: actionsLocked ? "not-allowed" : "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                        transition: "all 0.2s ease",
                        transform: isSelected ? "scale(1.04)" : undefined,
                        boxShadow: isSelected ? `0 0 20px ${def.color}40` : undefined,
                        textAlign: "left",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <span style={{ fontSize: uiRem(0.65), color: "var(--color-text-muted)" }}>
                          {isSelected ? "已选" : ""}
                        </span>
                        {isSelected && <span style={{ color: def.color, fontSize: uiRem(1) }}>✓</span>}
                      </div>
                      <BuffCardArt cardId={cardId} buffImages={buffImages} compact />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: uiRem(0.85), color: isSelected ? def.color : "white", marginBottom: "0.2rem" }}>
                          {def.name}
                          {duplicateNo > 0 ? (
                            <span style={{ fontWeight: 600, color: "var(--color-text-muted)", marginLeft: "0.35rem" }}>
                              #{duplicateNo}
                            </span>
                          ) : null}
                        </div>
                        <div
                          style={{
                            fontSize: uiRem(0.72),
                            color: "var(--color-text-muted)",
                            lineHeight: 1.35,
                            ...(cardId === "buff_lighter"
                              ? {}
                              : {
                                  overflow: "hidden",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical",
                                }),
                          }}
                        >
                          <BuffDescText text={def.desc} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!readOnly && (
          <div>
            <div
              style={{
                background: "var(--color-bg-card)",
                border: `1px solid ${selectedDef ? selectedDef.color + "44" : "var(--color-border)"}`,
                borderRadius: "1rem",
                padding: "1.25rem",
                position: "sticky",
                top: "calc(var(--buff-invest-tab-h, 0px) + 1rem)",
                transition: "border-color 0.25s ease",
                boxShadow: selectedDef ? `0 0 20px ${selectedDef.color}18` : undefined,
              }}
            >
              <h4 style={{ fontWeight: 700, color: selectedDef ? selectedDef.color : "var(--color-text-muted)", marginBottom: "1rem", fontSize: uiRem(0.95) }}>
                {selectedDef ? `⚡ ${selectedDef.name}` : "请先选择卡牌"}
              </h4>

              {!selectedCard ? (
                <div
                  style={{
                    height: "8rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-text-muted)",
                    fontSize: uiRem(0.875),
                  }}
                >
                  👈 点击左侧卡牌发动
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {(selectedCard === "buff_slack" ||
                    selectedCard === "buff_lighter" ||
                    selectedCard === "buff_work_rest") && (
                    <div>
                      <label style={{ display: "block", fontSize: uiRem(0.7), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
                        目标玩家
                      </label>
                      <select
                        className="input"
                        value={
                          selectedCard === "buff_work_rest" ? targetPlayer || me.id : targetPlayer
                        }
                        onChange={(e) => {
                          setTargetPlayer(e.target.value);
                          setBurnCardId("");
                        }}
                        style={{ fontSize: uiRem(0.9) }}
                      >
                        {selectedCard !== "buff_work_rest" && (
                          <option value="">-- 选择目标 --</option>
                        )}
                        {(selectedCard === "buff_lighter"
                          ? game.players.filter((p) => p.id !== me.id)
                          : game.players
                        ).map((p) => (
                          <option key={p.id} value={p.id}>
                            {formatBuffTargetPlayerOption(p, me.id, {
                              markSelf: selectedCard !== "buff_lighter",
                            })}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedCard === "buff_lighter" && targetPlayer && (
                    <div>
                      <label style={{ display: "block", fontSize: uiRem(0.7), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
                        目标卡牌
                      </label>
                      <select
                        className="input"
                        value={burnCardId || ""}
                        onChange={(e) => setBurnCardId(e.target.value)}
                      >
                        <option value="">-- 选择卡牌 --</option>
                        {LIGHTER_BURN_TARGET_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedCard === "buff_short" && (
                    <div>
                      <label style={{ display: "block", fontSize: uiRem(0.7), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>目标项目</label>
                      <select
                        className="input"
                        value={targetProject ?? ""}
                        onChange={(e) => setTargetProject(e.target.value ? Number(e.target.value) : undefined)}
                      >
                        <option value="">-- 选择项目 --</option>
                        {game.activeProjects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedDef && (
                    <div
                      style={{
                        fontSize: uiRem(0.825),
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.6,
                        background: "rgba(15,23,42,0.5)",
                        border: `1px solid ${selectedDef.color}33`,
                        borderRadius: "0.625rem",
                        padding: "0.75rem",
                      }}
                    >
                      <BuffDescText text={selectedDef.desc} />
                    </div>
                  )}

                  {onOpenBuffHelp && selectedDef && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-full"
                      style={{ fontSize: uiRem(0.8) }}
                      onClick={() => onOpenBuffHelp("buffs")}
                    >
                      {BUFF_UI_SNIPPETS.buffHelpLinkLabel}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleUse}
                    disabled={actionsLocked}
                    className="btn btn-purple btn-full"
                    style={{
                      background: selectedDef
                        ? `linear-gradient(135deg, ${selectedDef.color}, ${selectedDef.color}bb)`
                        : undefined,
                    }}
                  >
                    ✨ 立即发动
                  </button>
                  <button onClick={() => setSelection(null)} className="btn btn-ghost btn-full">
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};
