import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameState } from "../../types";
import { socket } from "../../socket";
import { uiRem } from "../../utils/typography";
import { isAiPlayer } from "../../utils/isAiPlayer";

type PreviewPayload = {
  ok: boolean;
  message?: string;
  projectName?: string;
  playerName?: string;
  energyBefore?: number;
  energyAfter?: number;
  stakeBefore?: number;
  stakeAfter?: number;
  wealthDeltas?: Record<string, number>;
  hostRevision?: number;
};

type Props = {
  game: GameState;
};

export const AdminProjectAdjustPanel: React.FC<Props> = ({ game }) => {
  const hostRevision = game.hostRevision ?? 0;
  const humanPlayers = useMemo(
    () => game.players.filter((p) => !isAiPlayer(p)),
    [game.players]
  );
  const boardProjects = useMemo(() => {
    if (game.phase === "SETTLEMENT" && game.settlementBaselineActiveProjects?.length) {
      return game.settlementBaselineActiveProjects;
    }
    return game.activeProjects;
  }, [game.phase, game.activeProjects, game.settlementBaselineActiveProjects]);

  const [projectId, setProjectId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [pendingAction, setPendingAction] = useState<
    | { kind: "stake"; projectId: number; playerId: string; delta: number }
    | { kind: "withdraw"; projectId: number }
    | null
  >(null);
  const awaitingCommitRef = useRef(false);
  const revisionAtCommitRef = useRef(hostRevision);

  const phaseOk = game.phase === "INVESTMENT" || game.phase === "SETTLEMENT";
  const baselineMissing =
    game.phase === "SETTLEMENT" && !game.settlementBaselineActiveProjects?.length;
  const disabledReason = !phaseOk
    ? "仅投资或结算阶段可调整"
    : baselineMissing
      ? "本轮尚无结算快照，无法在此阶段调整"
      : boardProjects.length === 0
        ? "当前无牌面项目"
        : null;

  useEffect(() => {
    setProjectId("");
    setPlayerId("");
    setPreview(null);
    setPendingAction(null);
  }, [game.roomId, game.phase, game.globalRound]);

  useEffect(() => {
    const onPreview = (payload: PreviewPayload & { roomId?: string }) => {
      if (payload.roomId !== game.roomId) return;
      setPending(false);
      setPreview(payload);
    };
    const onError = () => {
      setPending(false);
      awaitingCommitRef.current = false;
    };
    socket.on("adminProjectAdjustPreview", onPreview);
    socket.on("error", onError);
    return () => {
      socket.off("adminProjectAdjustPreview", onPreview);
      socket.off("error", onError);
    };
  }, [game.roomId]);

  useEffect(() => {
    if (!awaitingCommitRef.current) return;
    if (hostRevision > revisionAtCommitRef.current) {
      awaitingCommitRef.current = false;
      setPreview(null);
      setPendingAction(null);
      setPending(false);
    }
  }, [hostRevision]);

  const requestPreview = useCallback(
    (
      action:
        | { kind: "stake"; projectId: number; playerId: string; delta: number }
        | { kind: "withdraw"; projectId: number }
    ) => {
      setPending(true);
      setPendingAction(action);
      socket.emit("adminPreviewProjectAdjust", {
        roomId: game.roomId,
        ...action,
      });
    },
    [game.roomId]
  );

  const commit = useCallback(() => {
    if (!pendingAction || !preview?.ok) return;
    setPending(true);
    revisionAtCommitRef.current = hostRevision;
    awaitingCommitRef.current = true;
    socket.emit("adminCommitProjectAdjust", {
      roomId: game.roomId,
      expectedRevision: hostRevision,
      ...pendingAction,
    });
  }, [game.roomId, hostRevision, pendingAction, preview]);

  const undo = useCallback(() => {
    setPending(true);
    socket.emit("adminUndoProjectAdjust", {
      roomId: game.roomId,
      expectedRevision: hostRevision,
    });
    setTimeout(() => setPending(false), 500);
  }, [game.roomId, hostRevision]);

  const pid = Number(projectId);
  const amt = Math.floor(Number(amount));
  const canStake =
    !disabledReason &&
    Number.isFinite(pid) &&
    playerId &&
    Number.isSafeInteger(amt) &&
    amt > 0;

  const formatWealthDeltas = (deltas?: Record<string, number>) => {
    if (!deltas || Object.keys(deltas).length === 0) return null;
    return Object.entries(deltas)
      .map(([id, d]) => {
        const name = game.players.find((p) => p.id === id)?.name ?? id;
        return `${name} ${d > 0 ? "+" : ""}${d}`;
      })
      .join("；");
  };

  const confirmText = useMemo(() => {
    if (!preview?.ok || !pendingAction) return "";
    if (pendingAction.kind === "withdraw") {
      return `确认强制撤场「${preview.projectName ?? pid}」？本轮已扣精力将退回，历史长期财富不退。`;
    }
    const wealth = formatWealthDeltas(preview.wealthDeltas);
    return [
      `确认将 ${preview.playerName ?? playerId} 在「${preview.projectName}」本轮投入从 ${preview.stakeBefore} 调整为 ${preview.stakeAfter}？`,
      preview.energyBefore !== undefined
        ? `精力：${preview.energyBefore} → ${preview.energyAfter}`
        : null,
      wealth ? `结算财富变化：${wealth}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }, [preview, pendingAction, pid, playerId, game.players]);

  return (
    <div
      style={{
        marginTop: "1.5rem",
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "1.25rem",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--color-border)" }}>
        <h2 style={{ fontWeight: 700, fontSize: uiRem(1), margin: 0 }}>项目调整</h2>
        <p style={{ margin: "0.35rem 0 0", fontSize: uiRem(0.75), color: "var(--color-text-muted)" }}>
          加减本轮精力或强制撤场 · 版本 {hostRevision}
          {game.phase === "SETTLEMENT" ? " · 结算阶段将重算本轮结果" : ""}
        </p>
        {disabledReason && (
          <p style={{ margin: "0.5rem 0 0", fontSize: uiRem(0.75), color: "#f87171" }}>
            {disabledReason}
          </p>
        )}
      </div>
      <div style={{ padding: "1rem 1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
        <label style={{ fontSize: uiRem(0.75) }}>
          项目
          <select
            className="input"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!!disabledReason || pending}
            style={{ display: "block", marginTop: "0.25rem", minWidth: "10rem" }}
          >
            <option value="">选择…</option>
            {boardProjects.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name} ({p.type})
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: uiRem(0.75) }}>
          玩家
          <select
            className="input"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            disabled={!!disabledReason || pending}
            style={{ display: "block", marginTop: "0.25rem", minWidth: "8rem" }}
          >
            <option value="">选择…</option>
            {humanPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: uiRem(0.75) }}>
          精力数额
          <input
            type="number"
            min={1}
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!!disabledReason || pending}
            style={{ display: "block", marginTop: "0.25rem", width: "5rem" }}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!canStake || pending}
          onClick={() =>
            requestPreview({ kind: "stake", projectId: pid, playerId, delta: amt })
          }
        >
          增加
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!canStake || pending}
          onClick={() =>
            requestPreview({ kind: "stake", projectId: pid, playerId, delta: -amt })
          }
        >
          减少
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!!disabledReason || !Number.isFinite(pid) || pending}
          onClick={() => requestPreview({ kind: "withdraw", projectId: pid })}
        >
          强制撤场
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!!disabledReason || pending || hostRevision === 0}
          onClick={undo}
        >
          撤销上一次
        </button>
      </div>
      {preview && pendingAction && (
        <div
          style={{
            padding: "0.75rem 1.25rem 1rem",
            borderTop: "1px solid var(--color-border)",
            fontSize: uiRem(0.8),
          }}
        >
          {!preview.ok ? (
            <span style={{ color: "#f87171" }}>{preview.message ?? "无法预览"}</span>
          ) : (
            <>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                {confirmText}
              </pre>
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={commit}>
                  确认提交
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setPreview(null);
                    setPendingAction(null);
                  }}
                >
                  取消
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
