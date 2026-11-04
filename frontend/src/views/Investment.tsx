import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { uiRem } from "../utils/typography";
import { GameState, Player } from "../types";
import { socket } from "../socket";
import { ProjectCard } from "../components/ProjectCard";
import { EraThemeBanner } from "../components/EraThemeBanner";
import { useActionCountdown } from "../hooks/useActionCountdown";
import { useFixedDockClearance } from "../hooks/useFixedDockClearance";
import { useServerClockSkewRef } from "../hooks/useServerClockSkewRef";
import { getRemainingMs } from "../utils/actionCountdown";
import { LONG_CONTINUE_MIN_ENERGY, needsLongContinueWarn, sanitizeLongContribution } from "../config/longTermRules";
import {
  resolveRankPlayerCountFromGame,
  resolveRankRewardTierCountFromGame,
} from "../config/projectCatalog";
import { CoffeeRoundIndicators } from "../components/CoffeeRoundIndicators";
import { CoffeeUnsubscribeModal } from "../components/CoffeeUnsubscribeModal";
import { BuffRoundChips } from "../components/BuffRoundChips";
import { COFFEE_ENERGY_GAIN, COFFEE_WEALTH_COST } from "../config/coffeeConfig";
import {
  HELP_BUFF_LOCKOUT,
  HELP_INVESTMENT_ADVANCE_WHEN_ALL_LOCKED,
  HELP_INVESTMENT_SELF_UNLOCK,
} from "../config/playerHelpReference";
import { isInvestmentBuffLockout } from "../utils/investmentBuffLockout";
import {
  formatWealthHoldNote,
  playerAvailableWealth,
  playerLeadingBidReservedWealth,
  playerPendingTransferOutWealth,
} from "../utils/availableWealth";
import { ProjectDetailModal } from "../components/ProjectDetailModal";
import type { ActiveProject } from "../types";

function clampDraftToEnergy(
  draft: Record<number, number>,
  energy: number,
  projects: ActiveProject[]
): Record<number, number> {
  const out: Record<number, number> = {};
  let remaining = Math.max(0, typeof energy === "number" && Number.isFinite(energy) ? Math.floor(energy) : 0);
  for (const proj of projects) {
    let val = Math.max(0, Math.floor(Number(draft[proj.id] ?? 0)));
    val = Math.min(val, remaining);
    if (val > 0) {
      out[proj.id] = val;
      remaining -= val;
    }
  }
  return out;
}

interface Props {
  game: GameState;
  me: Player;
  mode: "discussion" | "investment";
  projectImages?: Record<number, number>;
  /** 跨阶段保留的预填（由 GameRoom 持有） */
  draft: Record<number, number>;
  onDraftChange: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  /** 分段顶栏已展示倒计时时隐藏本页内倒计时 */
  hideCountdown?: boolean;
  /** 主持嵌入观战：底栏 clearance 不写 document */
  embed?: boolean;
}

// ——— 顶部状态栏 ———
const StatusBar: React.FC<{
  game: GameState;
  me: Player;
  remainingEnergy: number;
  showCountdown: boolean;
  investmentEndsAt?: number;
  investmentTimerPausedAt?: number;
  serverNow?: number;
  onCoffee: () => void;
  coffeeLoading: boolean;
  coffeeLocked?: boolean;
  coffeePurchases: number;
  onOpenUnsubscribe: () => void;
  actionsDisabled?: boolean;
  buffActionsEnabled?: boolean;
  /** 主持公共预览：隐藏咖啡与个人财富 */
  embed?: boolean;
}> = ({
  me,
  remainingEnergy,
  showCountdown,
  investmentEndsAt,
  investmentTimerPausedAt,
  serverNow,
  onCoffee,
  coffeeLoading,
  coffeeLocked,
  coffeePurchases,
  onOpenUnsubscribe,
  actionsDisabled,
  buffActionsEnabled,
  embed = false,
  game,
}) => {
  const availableWealth = playerAvailableWealth(game, me);
  const wealthHoldNote = formatWealthHoldNote(
    playerLeadingBidReservedWealth(game, me.id),
    playerPendingTransferOutWealth(game, me.id)
  );
  const canAffordCoffee = availableWealth >= COFFEE_WEALTH_COST;

  const timerPaused = typeof investmentTimerPausedAt === "number";
  const timeLeft = useActionCountdown(
    showCountdown && !!investmentEndsAt,
    investmentEndsAt,
    serverNow,
    investmentTimerPausedAt
  );

  const mins = Math.floor(timeLeft / 60);
  const secs = (timeLeft % 60).toString().padStart(2, "0");
  const isUrgent = !timerPaused && timeLeft < 60 && timeLeft > 0;
  const isDanger = !timerPaused && timeLeft < 20 && timeLeft > 0;

  return (
    <div className="status-bar">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: "1100px", margin: "0 auto" }}>
        {/* 左侧：精力 + 财富 */}
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
            {!embed && (
              <CoffeeRoundIndicators
                count={coffeePurchases}
                disabled={!!coffeeLocked}
                onOpenUnsubscribe={onOpenUnsubscribe}
              />
            )}
            <span style={{ fontSize: uiRem(1.1) }}>⚡</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: uiRem(1.2),
                color: remainingEnergy < 0 ? "#ef4444" : "#34d399",
              }}
            >
              {Math.max(0, remainingEnergy)}
            </span>
            <span
              style={{
                color:
                  typeof me.energy === "number" && Number.isFinite(me.energy) && me.energy < 0
                    ? "#ef4444"
                    : "var(--color-text-muted)",
                fontSize: uiRem(0.85),
              }}
            >
              /{" "}
              {typeof me.energy === "number" && Number.isFinite(me.energy)
                ? Math.floor(me.energy)
                : 0}
            </span>
          </div>
          {!embed && (
            <>
              <div
                className="auction-my-wealth-row"
                aria-label={`可用财富 ${availableWealth}`}
                title={wealthHoldNote ? `可用财富 ${availableWealth}（${wealthHoldNote}）` : undefined}
              >
                <span style={{ fontSize: uiRem(1.05) }} aria-hidden>💰</span>
                <strong className="auction-mono-amount auction-mono-amount--wealth">
                  {availableWealth}
                </strong>
                {wealthHoldNote ? (
                  <span className="auction-wealth-hold">{wealthHoldNote}</span>
                ) : null}
              </div>
              <BuffRoundChips
                me={me}
                actionsDisabled={!!actionsDisabled || !!coffeeLocked}
                canAct={!!buffActionsEnabled}
                compact
              />
            </>
          )}
        </div>

        {/* 右侧：倒计时 + 咖啡 */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {showCountdown && investmentEndsAt && (
            <div
              className="action-countdown-chip"
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: "1.4rem",
                lineHeight: 1.2,
                color: timerPaused
                  ? "#fbbf24"
                  : isDanger
                    ? "#ef4444"
                    : isUrgent
                      ? "#f97316"
                      : "#60a5fa",
                animation:
                  !timerPaused && (isDanger || isUrgent)
                    ? `countdown-urgent ${isDanger ? "0.5s" : "1s"} ease-in-out infinite`
                    : undefined,
                background: timerPaused
                  ? "#2a2210"
                  : isDanger
                    ? "#321414"
                    : isUrgent
                      ? "#2e1c10"
                      : "#121a2c",
                padding: "0.375rem 0.875rem",
                borderRadius: "0.5rem",
                border: `1px solid ${
                  timerPaused
                    ? "rgba(251,191,36,0.45)"
                    : isDanger
                      ? "rgba(239,68,68,0.55)"
                      : isUrgent
                        ? "rgba(249,115,22,0.5)"
                        : "rgba(59,130,246,0.4)"
                }`,
                isolation: "isolate",
              }}
            >
              ⏱ {mins}:{secs}
              {timerPaused ? (
                <span style={{ fontSize: "0.75rem", fontWeight: 600, marginLeft: "0.4rem" }}>已暂停</span>
              ) : null}
            </div>
          )}
          {!embed && (
            <button
              onClick={onCoffee}
              disabled={coffeeLoading || !canAffordCoffee || coffeeLocked}
              className="btn btn-sm"
              style={{
                background: "rgba(180,83,9,0.2)",
                border: "1px solid rgba(180,83,9,0.4)",
                color: canAffordCoffee ? "#fcd34d" : "var(--color-text-muted)",
              }}
              title={
                coffeeLoading
                  ? "正在购买…"
                  : !canAffordCoffee
                    ? `财富不足（需要 ${COFFEE_WEALTH_COST}💰）`
                    : `消耗${COFFEE_WEALTH_COST}财富换${COFFEE_ENERGY_GAIN}精力`
              }
            >
              ☕{" "}
              {coffeeLoading
                ? "..."
                : `来杯咖啡（-${COFFEE_WEALTH_COST}💰+${COFFEE_ENERGY_GAIN}⚡）`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ——— 主组件 ———
export const Investment: React.FC<Props> = ({
  game,
  me,
  mode: _mode,
  projectImages = {},
  draft: investments,
  onDraftChange: setInvestments,
  hideCountdown = false,
  embed = false,
}) => {
  const [coffeeLoading, setCoffeeLoading] = useState(false);
  const [coffeeSuccessToast, setCoffeeSuccessToast] = useState<string | null>(null);
  /** 服务端未下发 coffeePurchasesThisRound 时，用资源变化推断杯数 */
  const [inferredCoffeeCups, setInferredCoffeeCups] = useState(0);
  const [unsubscribeOpen, setUnsubscribeOpen] = useState(false);
  const [detailProjectId, setDetailProjectId] = useState<number | null>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);

  const handleOpenDetail = useCallback((id: number, trigger?: HTMLElement) => {
    detailReturnFocusRef.current = trigger ?? null;
    setDetailProjectId(id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailProjectId(null);
    const el = detailReturnFocusRef.current;
    detailReturnFocusRef.current = null;
    requestAnimationFrame(() => el?.focus());
  }, []);
  const coffeePendingRef = useRef(0);
  const coffeeAttemptSnapRef = useRef<{ energy: number; wealth: number } | null>(null);
  const prevCoffeePurchasesRef = useRef(me.coffeePurchasesThisRound ?? 0);
  const coffeeRoundSigRef = useRef(
    `${game.currentEra}-${game.roundInEra}-${game.globalRound}`
  );
  const prevCoffeeForDraftRef = useRef(me.coffeePurchasesThisRound ?? 0);
  const draftSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSubmittedRef = useRef(false);
  const prevReadyRef = useRef(me.ready);
  const prevAdminDraftRevRef = useRef(me.investmentDraftAdminRevision ?? 0);
  const [reopenEditHint, setReopenEditHint] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const isSubmittedRef = useRef(false);
  const investmentsRef = useRef(investments);
  investmentsRef.current = investments;
  const clockSkewRef = useServerClockSkewRef(game.serverNow);
  const [, lockoutTick] = useState(0);

  useEffect(() => {
    if (game.phase !== "INVESTMENT" || !game.investmentEndsAt) return;
    const id = window.setInterval(() => lockoutTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [game.phase, game.investmentEndsAt]);

  const buffLockoutActive = isInvestmentBuffLockout(game, clockSkewRef.current);
  const canSelfUnlock =
    game.phase === "INVESTMENT" &&
    !!game.investmentEndsAt &&
    me.ready &&
    getRemainingMs(game.investmentEndsAt, clockSkewRef.current, game.investmentTimerPausedAt) > 0;

  const currentAllocated = Object.values(investments).reduce((a, b) => a + b, 0);
  const isSubmitted = me.ready && game.phase === "INVESTMENT";
  // 本轮已入账后 energy 已扣；本地预填仍保留分配额，不可再减一次
  const investmentCommitted =
    me.ready || (game.readyPlayers ?? []).includes(me.id);
  const investmentApplied = investmentCommitted || submitPending;
  const safeEnergy =
    typeof me.energy === "number" && Number.isFinite(me.energy) ? Math.max(0, me.energy) : 0;
  // 提交中乐观视为已扣，避免顶栏算出「负剩余 / 0」
  const remainingEnergy = investmentApplied ? safeEnergy : safeEnergy - currentAllocated;
  isSubmittedRef.current = isSubmitted || submitPending;
  const formLocked = investmentCommitted || submitPending;
  const { contentRef: investmentMainRef, dockRef: submitDockRef } = useFixedDockClearance(
    !embed,
    `${isSubmitted}-${me.ready}`,
    !embed
  );

  const flushDraftToServer = () => {
    if (draftSyncTimerRef.current) {
      clearTimeout(draftSyncTimerRef.current);
      draftSyncTimerRef.current = null;
    }
    if (isSubmittedRef.current) return;
    if (game.phase !== "BUFF_USAGE" && game.phase !== "INVESTMENT") return;
    socket.emit("syncInvestmentDraft", { investment: investmentsRef.current });
  };

  useEffect(() => {
    const wasReady = prevReadyRef.current;
    prevReadyRef.current = me.ready;
    if (game.phase !== "INVESTMENT" || !wasReady || me.ready) return;
    autoSubmittedRef.current = false;
    setSubmitPending(false);
    const nextDraft = me.investmentDraft ? { ...me.investmentDraft } : {};
    setInvestments(nextDraft);
    investmentsRef.current = nextDraft;
    setReopenEditHint(true);
    socket.emit("syncInvestmentDraft", { investment: nextDraft });
  }, [game.phase, me.ready, me.investmentDraft, me.id, setInvestments]);

  useEffect(() => {
    const rev = me.investmentDraftAdminRevision ?? 0;
    if (rev === prevAdminDraftRevRef.current) return;
    prevAdminDraftRevRef.current = rev;
    if (game.phase !== "INVESTMENT" || me.ready) return;
    const nextDraft = me.investmentDraft ? { ...me.investmentDraft } : {};
    setInvestments(nextDraft);
    investmentsRef.current = nextDraft;
  }, [
    game.phase,
    me.ready,
    me.investmentDraft,
    me.investmentDraftAdminRevision,
    setInvestments,
  ]);

  useEffect(() => {
    if (investmentCommitted) setSubmitPending(false);
  }, [investmentCommitted]);

  useEffect(() => {
    if (!reopenEditHint) return;
    const t = window.setTimeout(() => setReopenEditHint(false), 10_000);
    return () => window.clearTimeout(t);
  }, [reopenEditHint]);

  useEffect(() => {
    if (!coffeeSuccessToast) return;
    const t = window.setTimeout(() => setCoffeeSuccessToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [coffeeSuccessToast]);

  const showCoffeePurchaseSuccess = useCallback((cupsAfter: number) => {
    setCoffeeSuccessToast(
      `咖啡购买成功（本轮第 ${cupsAfter} 杯） · -${COFFEE_WEALTH_COST}💰 +${COFFEE_ENERGY_GAIN}⚡`
    );
  }, []);

  const showCoffeeRefundSuccess = useCallback((refunded: number, cupsRemaining: number) => {
    setCoffeeSuccessToast(
      `咖啡退订成功（${refunded} 杯） · +${refunded * COFFEE_WEALTH_COST}💰 −${refunded * COFFEE_ENERGY_GAIN}⚡ · 本轮剩余 ${cupsRemaining} 杯`
    );
  }, []);

  useEffect(() => {
    autoSubmittedRef.current = false;
    setSubmitPending(false);
  }, [game.investmentEndsAt, game.phase, game.globalRound]);

  useEffect(() => {
    if (isSubmitted) return;
    if (game.phase !== "BUFF_USAGE" && game.phase !== "INVESTMENT") return;

    if (draftSyncTimerRef.current) clearTimeout(draftSyncTimerRef.current);
    draftSyncTimerRef.current = setTimeout(() => {
      socket.emit("syncInvestmentDraft", { investment: investments });
    }, 400);

    return () => {
      if (draftSyncTimerRef.current) clearTimeout(draftSyncTimerRef.current);
    };
  }, [investments, isSubmitted, game.phase]);

  useEffect(() => {
    return () => {
      flushDraftToServer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase]);

  const handleInputChange = (projectId: number, val: number) => {
    if (val < 0) return;
    setInvestments((prev) => ({ ...prev, [projectId]: val }));
  };

  const commitInvestment = (payload: Record<number, number>) => {
    setSubmitPending(true);
    socket.emit("syncInvestmentDraft", { investment: payload });
    socket.emit("submitInvestment", { investment: payload });
  };

  const handleSubmit = (auto = false) => {
    const raw = investmentsRef.current;
    // 与服务端 sanitizeInvestments / sanitizeLongContribution 对齐后再提交
    const payload: Record<number, number> = {};
    for (const proj of game.activeProjects) {
      let val = Math.max(0, Math.floor(Number(raw[proj.id] ?? 0)));
      if (proj.type === "long") {
        val = sanitizeLongContribution(me.longTerm[proj.id]?.status, val);
      }
      if (val > 0) payload[proj.id] = val;
    }

    if (auto) {
      commitInvestment(payload);
      return;
    }

    if (remainingEnergy < 0) {
      alert("精力分配超限！");
      return;
    }

    const abandonWarnings: string[] = [];
    for (const proj of game.activeProjects) {
      if (!needsLongContinueWarn(proj, me)) continue;
      const rawVal = Math.max(0, Math.floor(Number(raw[proj.id] ?? 0)));
      const val = payload[proj.id] || 0;
      if (val < LONG_CONTINUE_MIN_ENERGY) {
        const note =
          rawVal > 0 && rawVal < LONG_CONTINUE_MIN_ENERGY
            ? `「${proj.name}」(本轮 ${rawVal} 将按规则视为 0)`
            : `「${proj.name}」`;
        abandonWarnings.push(note);
      }
    }

    if (abandonWarnings.length > 0) {
      if (
        !window.confirm(
          `确认提交？注意：你对 ${abandonWarnings.join(", ")} 本轮投入不足 ${LONG_CONTINUE_MIN_ENERGY}，将视为放弃：累计投入按 1:1 结算为财富，并退出该项目完成时的排名与时代加成。`
        )
      ) {
        return;
      }
    } else {
      if (
        !window.confirm(
          `确认提交投资方案吗？提交后将锁定方案；倒计时结束前可自行解锁修改。${HELP_INVESTMENT_ADVANCE_WHEN_ALL_LOCKED}`
        )
      ) {
        return;
      }
    }

    commitInvestment(payload);
  };

  useEffect(() => {
    const end = game.investmentEndsAt;
    if (!end || isSubmitted || submitPending) return;
    if (game.phase !== "INVESTMENT") return;
    if (typeof game.investmentTimerPausedAt === "number") return;

    const tick = () => {
      if (typeof game.investmentTimerPausedAt === "number") return;
      const msLeft = getRemainingMs(end, clockSkewRef.current);
      if (msLeft <= 1500 && msLeft > 0) {
        socket.emit("syncInvestmentDraft", { investment: investmentsRef.current });
      }
      if (msLeft > 0) return;
      if (autoSubmittedRef.current) return;
      autoSubmittedRef.current = true;
      handleSubmit(true);
    };

    const id = setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
  }, [
    game.investmentEndsAt,
    game.investmentTimerPausedAt,
    game.phase,
    game.serverNow,
    isSubmitted,
    submitPending,
    clockSkewRef,
  ]);

  // 须在杯数变化 effect 之前：新轮清零 coffeePurchases 时不应误报购买/退订 toast
  useEffect(() => {
    setInferredCoffeeCups(0);
    prevCoffeePurchasesRef.current = me.coffeePurchasesThisRound ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅轮次切换时对齐 prev，不随每次退订/购买触发
  }, [game.globalRound, game.currentEra, game.roundInEra]);

  useEffect(() => {
    const cups = me.coffeePurchasesThisRound ?? 0;
    const roundSig = `${game.currentEra}-${game.roundInEra}-${game.globalRound}`;
    if (coffeeRoundSigRef.current !== roundSig) {
      coffeeRoundSigRef.current = roundSig;
      prevCoffeePurchasesRef.current = cups;
      return;
    }

    const prevCups = prevCoffeePurchasesRef.current;
    const inCoffeeWindow = game.phase === "BUFF_USAGE" || game.phase === "INVESTMENT";

    if (cups > prevCups) {
      setInferredCoffeeCups(0);
      const delta = cups - prevCups;
      if (inCoffeeWindow) {
        showCoffeePurchaseSuccess(cups);
      }
      coffeePendingRef.current = Math.max(0, coffeePendingRef.current - delta);
      coffeeAttemptSnapRef.current = null;
      setCoffeeLoading(false);
    } else if (cups < prevCups) {
      const refunded = prevCups - cups;
      if (refunded > 0 && inCoffeeWindow) {
        showCoffeeRefundSuccess(refunded, cups);
      }
      setInferredCoffeeCups((n) => Math.max(0, Math.min(n, cups)));
    }

    const snap = coffeeAttemptSnapRef.current;
    const wealthOk =
      snap && coffeePendingRef.current > 0 && me.wealth <= snap.wealth - COFFEE_WEALTH_COST;
    const energyOk = snap && me.energy >= snap.energy + COFFEE_ENERGY_GAIN;
    if (coffeePendingRef.current > 0 && snap && wealthOk && energyOk) {
      coffeePendingRef.current = 0;
      coffeeAttemptSnapRef.current = null;
      setCoffeeLoading(false);
      if (cups <= prevCups) {
        const after = cups + 1;
        setInferredCoffeeCups((n) => n + 1);
        showCoffeePurchaseSuccess(after);
      }
    } else if (coffeePendingRef.current > 0 && snap && wealthOk && !energyOk) {
      coffeePendingRef.current = 0;
      coffeeAttemptSnapRef.current = null;
      setCoffeeLoading(false);
      if (cups <= prevCups) {
        setInferredCoffeeCups((n) => n + 1);
        showCoffeePurchaseSuccess(cups + 1);
      }
    }

    prevCoffeePurchasesRef.current = cups;
  }, [
    me.coffeePurchasesThisRound,
    me.energy,
    me.wealth,
    showCoffeePurchaseSuccess,
    showCoffeeRefundSuccess,
    game.phase,
    game.currentEra,
    game.roundInEra,
    game.globalRound,
  ]);

  useEffect(() => {
    const curr = me.coffeePurchasesThisRound ?? 0;
    if (curr < prevCoffeeForDraftRef.current) {
      const serverDraft = me.investmentDraft;
      if (serverDraft && Object.keys(serverDraft).length > 0) {
        setInvestments({ ...serverDraft });
      } else {
        setInvestments((prev) => clampDraftToEnergy(prev, me.energy, game.activeProjects));
      }
    }
    prevCoffeeForDraftRef.current = curr;
  }, [me.coffeePurchasesThisRound, me.investmentDraft, me.energy, game.activeProjects, setInvestments]);

  useEffect(() => {
    if (formLocked) return;
    if (game.phase !== "BUFF_USAGE" && game.phase !== "INVESTMENT") return;
    const book =
      typeof me.energy === "number" && Number.isFinite(me.energy) ? me.energy : 0;
    if (book >= 0) return;
    const hasServerDraft = me.investmentDraft && Object.keys(me.investmentDraft).length > 0;
    if (hasServerDraft) return;
    const allocated = Object.values(investments).reduce((a, b) => a + b, 0);
    if (allocated === 0) return;
    setInvestments({});
    investmentsRef.current = {};
  }, [
    formLocked,
    game.phase,
    me.energy,
    me.investmentDraft,
    investments,
    setInvestments,
  ]);

  useEffect(() => {
    if (isSubmitted) return;
    const allocated = Object.values(investments).reduce((a, b) => a + b, 0);
    if (allocated <= safeEnergy) return;
    setInvestments((prev) => clampDraftToEnergy(prev, safeEnergy, game.activeProjects));
  }, [safeEnergy, isSubmitted, game.activeProjects, investments, setInvestments]);

  useEffect(() => {
    if (formLocked) setUnsubscribeOpen(false);
  }, [formLocked]);

  useEffect(() => {
    if (!coffeeLoading) return;
    const t = window.setTimeout(() => {
      if (coffeePendingRef.current <= 0) return;
      coffeePendingRef.current = 0;
      coffeeAttemptSnapRef.current = null;
      setCoffeeLoading(false);
      alert("购买咖啡未确认。若财富已扣除仍无 ☕ 图标，请硬刷新页面；持续异常请联系主持检查服务端是否已部署最新版本。");
    }, 4_000);
    return () => window.clearTimeout(t);
  }, [coffeeLoading]);

  useEffect(() => {
    const onError = () => {
      coffeePendingRef.current = 0;
      coffeeAttemptSnapRef.current = null;
      setCoffeeLoading(false);
      setSubmitPending(false);
    };
    socket.on("error", onError);
    return () => {
      socket.off("error", onError);
    };
  }, []);

  const serverCoffeeCups = me.coffeePurchasesThisRound ?? 0;
  const effectiveCoffeeCups = Math.max(serverCoffeeCups, inferredCoffeeCups);

  const handleCoffee = () => {
    if (coffeeLoading || playerAvailableWealth(game, me) < COFFEE_WEALTH_COST || formLocked) return;
    coffeeAttemptSnapRef.current = { energy: me.energy, wealth: me.wealth };
    coffeePendingRef.current += 1;
    setCoffeeLoading(true);
    socket.emit("performCoffee");
  };

  const eraCard = game.currentEraCard;
  const coffeePurchases = effectiveCoffeeCups;

  const investSecondsLeft = useActionCountdown(
    game.phase === "INVESTMENT" && !!game.investmentEndsAt && !isSubmitted,
    game.investmentEndsAt,
    game.serverNow,
    game.investmentTimerPausedAt
  );

  const longAbandonRiskNames = useMemo(() => {
    const names: string[] = [];
    for (const proj of game.activeProjects) {
      if (!needsLongContinueWarn(proj, me)) continue;
      const val = investments[proj.id] ?? 0;
      if (val < LONG_CONTINUE_MIN_ENERGY) names.push(proj.name);
    }
    return names;
  }, [game.activeProjects, me, investments]);

  const showLongAutoAbandonWarn =
    game.phase === "INVESTMENT" &&
    !formLocked &&
    investSecondsLeft > 0 &&
    investSecondsLeft <= 60 &&
    longAbandonRiskNames.length > 0;

  const detailProject = useMemo(
    () => (detailProjectId != null ? game.activeProjects.find((p) => p.id === detailProjectId) ?? null : null),
    [detailProjectId, game.activeProjects]
  );

  useEffect(() => {
    if (detailProjectId == null) return;
    if (!game.activeProjects.some((p) => p.id === detailProjectId)) {
      setDetailProjectId(null);
      detailReturnFocusRef.current = null;
    }
  }, [detailProjectId, game.activeProjects]);

  return (
    <div className="investment-view" style={{ minHeight: "100dvh", background: "#070b14" }}>
      {coffeeSuccessToast ? (
        <div className="player-notify-toast" role="status" aria-live="polite">
          {coffeeSuccessToast}
        </div>
      ) : null}
      <CoffeeUnsubscribeModal
        open={unsubscribeOpen}
        maxPurchased={coffeePurchases}
        wealth={me.wealth}
        energy={me.energy}
        onClose={() => setUnsubscribeOpen(false)}
        onRefunded={(count) =>
          setInferredCoffeeCups((n) => Math.max(0, n - count))
        }
      />
      <ProjectDetailModal
        project={detailProject}
        eraTheme={eraCard?.era}
        uploadedVersion={detailProject ? projectImages[detailProject.id] : undefined}
        playerCount={resolveRankRewardTierCountFromGame(game)}
        seatedPlayerCount={resolveRankPlayerCountFromGame(game)}
        onClose={handleCloseDetail}
      />
      {/* 顶部状态栏 */}
      <StatusBar
        game={game}
        me={me}
        remainingEnergy={remainingEnergy}
        showCountdown={!hideCountdown && game.phase === "INVESTMENT" && !!game.investmentEndsAt}
        investmentEndsAt={game.investmentEndsAt}
        investmentTimerPausedAt={game.investmentTimerPausedAt}
        serverNow={game.serverNow}
        onCoffee={handleCoffee}
        coffeeLoading={coffeeLoading}
        coffeeLocked={formLocked}
        coffeePurchases={coffeePurchases}
        actionsDisabled={formLocked || me.ready || embed}
        buffActionsEnabled={
          !embed &&
          (game.phase === "INVESTMENT" || game.phase === "BUFF_USAGE") &&
          !me.ready &&
          !submitPending &&
          !buffLockoutActive
        }
        embed={embed}
        onOpenUnsubscribe={() => {
          if (formLocked || coffeePurchases <= 0) return;
          setUnsubscribeOpen(true);
        }}
      />

      <div
        ref={investmentMainRef}
        className="investment-page-main"
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          paddingTop: "1.5rem",
          paddingLeft: "1rem",
          paddingRight: "1rem",
        }}
      >
        {buffLockoutActive && !embed && game.phase === "INVESTMENT" && (
          <div
            role="status"
            style={{
              background: "rgba(251,191,36,0.1)",
              border: "1px solid rgba(251,191,36,0.35)",
              borderRadius: "0.875rem",
              padding: "0.65rem 1rem",
              marginBottom: "1rem",
              color: "#fcd34d",
              fontSize: uiRem(0.82),
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {HELP_BUFF_LOCKOUT}
          </div>
        )}

        {reopenEditHint && game.phase === "INVESTMENT" && !formLocked && (
          <div
            role="status"
            style={{
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(59,130,246,0.35)",
              borderRadius: "0.875rem",
              padding: "0.75rem 1.25rem",
              marginBottom: "1.25rem",
              color: "#93c5fd",
              fontSize: uiRem(0.9),
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            已解锁投资方案：请调整分配后重新提交。
          </div>
        )}

        {showLongAutoAbandonWarn && (
          <div
            role="alert"
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: "0.875rem",
              padding: "0.75rem 1.25rem",
              marginBottom: "1.25rem",
              color: "#fecaca",
              fontSize: uiRem(0.9),
              fontWeight: 600,
              textAlign: "center",
              animation: investSecondsLeft <= 20 ? "pulse 0.8s infinite" : undefined,
            }}
          >
            倒计时结束将自动提交当前方案：{longAbandonRiskNames.join("、")} 未满 {LONG_CONTINUE_MIN_ENERGY}{" "}
            精力，将视为放弃（1:1 结算累计投入，退出完成排名）。
          </div>
        )}

        {eraCard && (
          <div style={{ marginBottom: "2rem" }}>
            <EraThemeBanner eraCard={eraCard} currentEra={game.currentEra} />
          </div>
        )}

        {/* 标题 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "white" }}>
            📊 投资决策
          </h2>
          {remainingEnergy !== 0 && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: uiRem(0.875),
                color: remainingEnergy < 0 ? "#ef4444" : remainingEnergy > 0 ? "#fbbf24" : "#34d399",
                fontWeight: 700,
              }}
            >
              {remainingEnergy > 0 ? `剩余 ${remainingEnergy} 精力未分配` : remainingEnergy < 0 ? `超出 ${-remainingEnergy} 精力！` : "精力已全部分配"}
            </div>
          )}
        </div>

        {/* 项目网格 */}
        <div className="player-responsive-grid investment-project-grid" style={{ marginBottom: "2rem" }}>
          {game.activeProjects.map((proj) => (
            <ProjectCard
              key={proj.id}
              project={proj}
              myInvest={investments[proj.id] || 0}
              onChange={handleInputChange}
              disabled={formLocked}
              remainingEnergy={remainingEnergy}
              eraTheme={eraCard?.era}
              me={me}
              uploadedVersion={projectImages[proj.id]}
              onOpenDetail={handleOpenDetail}
            />
          ))}
          {game.activeProjects.length === 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: "3rem",
                color: "var(--color-text-muted)",
                border: "1px dashed var(--color-border)",
                borderRadius: "1rem",
                fontSize: uiRem(1.1),
              }}
            >
              暂无可投资项目
            </div>
          )}
        </div>
      </div>

        {/* 提交区域；置于主内容外，避免挤占滚动高度计算 */}
        {!embed && (
        <div
          ref={submitDockRef}
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
          {formLocked ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.65rem",
                padding: "0.75rem 1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  background: "rgba(16,185,129,0.1)",
                  border: "1px solid rgba(16,185,129,0.3)",
                  borderRadius: "9999px",
                  padding: "0.875rem 2.5rem",
                }}
              >
                <span
                  style={{
                    width: "0.625rem",
                    height: "0.625rem",
                    borderRadius: "50%",
                    background: "#34d399",
                    animation: "pulse 1.5s infinite",
                    display: "inline-block",
                  }}
                />
                <span style={{ fontWeight: 700, color: "#34d399", fontSize: uiRem(1) }}>
                  {isSubmitted ? "已锁定，等待其他在线玩家…" : "正在提交…"}
                </span>
              </div>
              {isSubmitted && (
                <p
                  style={{
                    margin: 0,
                    maxWidth: "28rem",
                    textAlign: "center",
                    fontSize: uiRem(0.78),
                    color: "var(--color-text-muted)",
                    lineHeight: 1.45,
                  }}
                >
                  {HELP_INVESTMENT_ADVANCE_WHEN_ALL_LOCKED}
                </p>
              )}
              {canSelfUnlock && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `解锁后可修改投资并重新提交，倒计时继续。\n${HELP_INVESTMENT_SELF_UNLOCK}\n确认解锁？`
                      )
                    ) {
                      return;
                    }
                    socket.emit("unlockOwnInvestment");
                  }}
                >
                  解锁并修改
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => handleSubmit(false)}
              disabled={remainingEnergy < 0 || submitPending}
              className="btn btn-success btn-lg"
              style={{
                padding: "1rem 4rem",
                fontSize: uiRem(1.15),
                letterSpacing: "0.05em",
                minWidth: "280px",
              }}
            >
              {remainingEnergy < 0 ? "⚠️ 精力超限" : "🔒 锁定并提交投资"}
            </button>
          )}
        </div>
        )}
    </div>
  );
};
