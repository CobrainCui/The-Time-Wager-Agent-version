import React, { useEffect } from "react";
import { GameState, Player } from "../types";
import { TutorialSlidePanel } from "../tutorial/TutorialSlidePanel";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { preloadTutorialProjectCovers } from "../tutorial/preloadTutorialImages";

interface Props {
  game: GameState;
  me: Player;
}

export const TutorialView: React.FC<Props> = ({ game, me }) => {
  const step = game.tutorialStep ?? 0;
  const fitViewport = useMediaQuery("(min-width: 1024px)", false);

  useEffect(() => {
    preloadTutorialProjectCovers();
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, [step]);

  return (
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
          playerName={me.name}
          footerHint="请听主持人讲解"
          fitViewport={fitViewport}
        />
      </div>
    </div>
  );
};
