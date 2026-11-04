import React, { useEffect, useRef } from "react";
import { uiRem } from "../../utils/typography";
import { GameState } from "../../types";
import { TUTORIAL_SLIDES } from "../../tutorialData";
import { TutorialSlidePanel } from "../../tutorial/TutorialSlidePanel";
import { preloadTutorialProjectCovers } from "../../tutorial/preloadTutorialImages";
import { isAiPlayer } from "../../utils/isAiPlayer";
import { useMediaQuery } from "../../hooks/useMediaQuery";

interface Props {
  game: GameState;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

export const AdminTutorialHostSection: React.FC<Props> = ({
  game,
  onPrev,
  onNext,
  onFinish,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const total = TUTORIAL_SLIDES.length;
  const rawStep = game.tutorialStep ?? 0;
  const step = Math.min(Math.max(rawStep, 0), total - 1);
  const isLastStep = step >= total - 1;
  const slide = TUTORIAL_SLIDES[step];
  const demoPlayerName =
    game.players.find((p) => !isAiPlayer(p))?.name ?? "示例玩家";
  const fitViewport = useMediaQuery("(min-width: 1024px)", false);

  useEffect(() => {
    preloadTutorialProjectCovers();
  }, []);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "ArrowLeft" && step > 0) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && !isLastStep) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, isLastStep, onPrev, onNext]);

  const handleFinish = () => {
    if (isLastStep) {
      onFinish();
      return;
    }
    if (
      window.confirm(
        "提前结束教程？玩家将退出教程页并回到「时代介绍」，之后可点击顶栏「开局」开始正式对局。"
      )
    ) {
      onFinish();
    }
  };

  return (
    <div
      ref={rootRef}
      style={{
        background: "var(--color-bg-card)",
        border: "2px solid rgba(59,130,246,0.35)",
        borderRadius: "1.25rem",
        overflow: "visible",
        marginBottom: "1.5rem",
        boxShadow: "0 0 40px rgba(59,130,246,0.12)",
      }}
    >
      <div
        style={{
          padding: "0.75rem 1.25rem",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontWeight: 800, color: "#60a5fa", fontSize: uiRem(1.05) }}>
          教程同步面板（与玩家屏幕一致）
        </span>
        <span style={{ fontSize: uiRem(0.85), color: "var(--color-text-muted)" }}>
          教程进行中 · {step + 1} / {total}
          <span style={{ marginLeft: "0.75rem", opacity: 0.85 }}>← → 快捷键翻页</span>
        </span>
      </div>

      <TutorialSlidePanel
        step={step}
        playerName={demoPlayerName}
        compact
        fitViewport={fitViewport}
        hidePageFooter
      />

      <div
        style={{
          margin: "0 1.25rem 1.25rem",
          padding: "1rem 1.25rem",
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.35)",
          borderRadius: "0.875rem",
          textAlign: "left",
        }}
      >
        <div
          style={{
            fontSize: uiRem(0.75),
            fontWeight: 700,
            color: "#fbbf24",
            marginBottom: "0.5rem",
            letterSpacing: "0.05em",
          }}
        >
          主持提示
        </div>
        <p
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            fontSize: uiRem(0.95),
            lineHeight: 1.65,
          }}
        >
          {slide.hostNotes}
        </p>
      </div>

      <div
        style={{
          padding: "0 1.25rem 1.5rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={step === 0}
          onClick={onPrev}
          aria-label="上一页教程"
        >
          上一页
        </button>
        {!isLastStep && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onNext}
            aria-label="下一页教程"
          >
            下一页
          </button>
        )}
        {isLastStep && (
          <span style={{ fontSize: uiRem(0.85), color: "var(--color-text-muted)" }}>已是最后一页</span>
        )}
        <button
          type="button"
          className={`btn btn-sm ${isLastStep ? "btn-success" : "btn-ghost"}`}
          onClick={handleFinish}
        >
          {isLastStep ? "完成教程" : "提前完成教程"}
        </button>
      </div>
    </div>
  );
};
