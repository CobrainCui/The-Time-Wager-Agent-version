import React, { useEffect, useState } from "react";
import { TUTORIAL_SLIDES } from "../tutorialData";
import { TutorialSlidePanel } from "../tutorial/TutorialSlidePanel";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { preloadTutorialProjectCovers } from "../tutorial/preloadTutorialImages";
import { uiRem } from "../utils/typography";

/**
 * 玩家版【教程】：与主持人在房间内统一开启的教程完全相同（同一份 TUTORIAL_SLIDES、
 * 同一 TutorialSlidePanel、同一六人场数值），区别仅在于：
 *  - 只显示在玩家自己的页面上（大厅，进入房间之前）
 *  - 玩家可自行翻页（← → 或按钮），随时关闭
 */
interface Props {
  /** 大厅里已输入的昵称，用于试玩演示中的称呼；未填则用默认 */
  playerName?: string;
  onClose: () => void;
}

export const LobbyTutorial: React.FC<Props> = ({ playerName, onClose }) => {
  const [step, setStep] = useState(0);
  const total = TUTORIAL_SLIDES.length;
  const fitViewport = useMediaQuery("(min-width: 1024px)", false);

  useEffect(() => {
    preloadTutorialProjectCovers();
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, [step]);

  // 键盘翻页：← → 上一页/下一页，Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, total - 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, onClose]);

  const goPrev = () => setStep((s) => Math.max(s - 1, 0));
  const goNext = () => setStep((s) => Math.min(s + 1, total - 1));

  return (
    <div
      className="lobby-tutorial-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="游戏教程"
    >
      <div
        className={`tutorial-view-shell${fitViewport ? " tutorial-view-shell--fit" : ""}`}
        style={{
          background: `radial-gradient(ellipse at 50% 30%, rgba(59,130,246,0.1) 0%, transparent 60%), #070b14`,
        }}
      >
        <div
          className="tutorial-view-card animate-scaleIn"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "1.5rem",
            overflow: "visible",
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          }}
        >
          <TutorialSlidePanel
            step={step}
            playerName={playerName?.trim() || "玩家"}
            footerHint="自行翻阅：← → 键或下方按钮"
            fitViewport={fitViewport}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.75rem",
              padding: "0.9rem 1rem 1.1rem",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={goPrev}
              disabled={step === 0}
              style={{ fontSize: uiRem(0.82), minWidth: "5.5rem" }}
            >
              ← 上一页
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              style={{ fontSize: uiRem(0.82) }}
            >
              关闭教程
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={step === total - 1 ? onClose : goNext}
              style={{ fontSize: uiRem(0.82), minWidth: "5.5rem" }}
            >
              {step === total - 1 ? "完成 ✓" : "下一页 →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
