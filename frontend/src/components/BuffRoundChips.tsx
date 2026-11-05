import React, { useState } from "react";
import { uiRem } from "../utils/typography";
import { BuffRoundNote, Player } from "../types";
import { BUFF_CARD_DEFS, getBuffDef } from "../config/buffCards";
import { socket } from "../socket";

interface Props {
  me: Player;
  /** 锁定、已进讨论队列、或非投资阶段时禁用摸鱼快捷按钮 */
  actionsDisabled?: boolean;
  /** 仅投资阶段可发动快捷按钮 */
  canAct?: boolean;
  compact?: boolean;
}

export const BuffRoundChips: React.FC<Props> = ({
  me,
  actionsDisabled = false,
  canAct = true,
  compact,
}) => {
  const notes = me.buffRoundNotes ?? [];
  const [expanded, setExpanded] = useState<number | null>(null);

  const hasWorkRest = me.activeBuffs?.some((b) => b.cardId === "buff_work_rest");
  const hitBySlack = notes.some((n) => n.role === "hit" && n.cardId === "buff_slack");
  const showSlackActions = hitBySlack && !hasWorkRest;
  const hasSlackCard = me.inventory.includes("buff_slack");
  const buttonsDisabled = actionsDisabled || !canAct;

  if (notes.length === 0 && !showSlackActions && !hasWorkRest) return null;

  const labelFor = (note: BuffRoundNote) => {
    const def = getBuffDef(note.cardId);
    const name = def?.name || note.cardId;
    return note.role === "used" ? `已用·${name}` : `被用·${name}`;
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: compact ? "0.35rem" : "0.5rem",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {notes.map((note, idx) => {
        const open = expanded === idx;
        const def = getBuffDef(note.cardId);
        const color = def?.color || "#94a3b8";
        return (
          <button
            key={`${note.cardId}-${note.role}-${idx}`}
            type="button"
            onClick={() => setExpanded(open ? null : idx)}
            title={note.text}
            style={{
              border: `1px solid ${color}55`,
              background: open ? `${color}22` : "rgba(255,255,255,0.04)",
              color: open ? "white" : "var(--color-text-secondary)",
              borderRadius: "9999px",
              padding: compact ? "0.15rem 0.55rem" : "0.25rem 0.7rem",
              fontSize: uiRem(compact ? 0.68 : 0.75),
              fontWeight: 600,
              cursor: "pointer",
              maxWidth: open ? "22rem" : undefined,
              textAlign: "left",
              lineHeight: 1.35,
            }}
          >
            {open ? note.text : labelFor(note)}
          </button>
        );
      })}

      {hasWorkRest && (
        <span
          title="本卡生效轮次内被摸鱼传染时不减精力，+8 精力；发动时追溯改判已发生的摸鱼"
          style={{
            border: `1px solid ${BUFF_CARD_DEFS.buff_work_rest?.color ?? "#10b981"}55`,
            background: "rgba(16,185,129,0.12)",
            color: "#6ee7b7",
            borderRadius: "9999px",
            padding: compact ? "0.15rem 0.55rem" : "0.25rem 0.7rem",
            fontSize: uiRem(compact ? 0.68 : 0.75),
            fontWeight: 700,
          }}
        >
          ⚖️ 劳逸结合 · 被摸鱼 +8
        </span>
      )}

      {showSlackActions && (
        <>
          <button
            type="button"
            className="btn btn-sm"
            disabled={buttonsDisabled || !hasSlackCard}
            onClick={() => {
              if (buttonsDisabled || !hasSlackCard) return;
              socket.emit("useBuffCard", { cardId: "buff_slack", targetPlayerId: me.id });
            }}
            style={{
              fontSize: uiRem(0.72),
              padding: "0.2rem 0.65rem",
              opacity: buttonsDisabled || !hasSlackCard ? 0.45 : 1,
            }}
          >
            开始摸鱼
          </button>
        </>
      )}
    </div>
  );
};
