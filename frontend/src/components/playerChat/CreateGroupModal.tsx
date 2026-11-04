import React, { memo, useMemo, useState } from "react";
import { uiRem } from "../../utils/typography";
import type { Player } from "../../types";
import { isAiPlayer } from "../../utils/isAiPlayer";

type Props = {
  open: boolean;
  meId: string;
  players: Player[];
  onClose: () => void;
  onCreate: (memberIds: string[], name: string) => void;
};

export const CreateGroupModal = memo<Props>(function CreateGroupModal({
  open,
  meId,
  players,
  onClose,
  onCreate,
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [name, setName] = useState("");

  const candidates = useMemo(
    () => players.filter((p) => p.id !== meId && !isAiPlayer(p)),
    [players, meId]
  );

  if (!open) return null;

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit = picked.size >= 2;

  return (
    <div className="player-chat-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="player-chat-modal"
        role="dialog"
        aria-labelledby="create-group-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="create-group-title" style={{ margin: "0 0 0.75rem", fontSize: uiRem(0.95) }}>
          建群聊
        </h3>
        <p style={{ margin: "0 0 0.65rem", fontSize: uiRem(0.78), color: "var(--color-text-muted)" }}>
          至少再选 2 名玩家（群内不可转账，仅文字）
        </p>
        <input
          className="input"
          placeholder="群名称（可选）"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          style={{ marginBottom: "0.65rem", width: "100%" }}
        />
        <ul className="player-chat-modal-member-list">
          {candidates.map((p) => (
            <li key={p.id}>
              <label className="player-chat-modal-member-row">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                <span>{p.name}</span>
              </label>
            </li>
          ))}
        </ul>
        {candidates.length < 2 && (
          <p style={{ fontSize: uiRem(0.75), color: "var(--color-text-muted)" }}>
            至少需要 3 名真人玩家才能建群
          </p>
        )}
        <div className="player-chat-modal-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canSubmit}
            onClick={() => {
              onCreate([...picked], name.trim());
              setPicked(new Set());
              setName("");
              onClose();
            }}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
});
