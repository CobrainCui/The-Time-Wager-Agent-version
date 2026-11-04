import React, { useEffect, useState } from "react";
import { uiRem } from "../utils/typography";
import { TYPE_COLORS } from "../components/ProjectCard";
import { TUTORIAL_SLIDES } from "../tutorialData";
import { TutorialDemoShell } from "./TutorialDemoShell";
import { TUTORIAL_DEMO_BY_KEY } from "./tutorialDemos";
import { GavelIcon } from "../components/icons/GavelIcon";
import { TutorialProjectTypesCopy } from "./TutorialProjectTypesCopy";
import { EnergyScheduleMiniTable } from "../components/help/EnergyScheduleMiniTable";
import { TUTORIAL_PROJECT_TYPES_PLAY_HINT } from "../config/playerHelpReference";

const PROJECT_TYPE_LINE_KEY: Record<string, keyof typeof TYPE_COLORS> = {
  短期项目: "short",
  长期项目: "long",
  风险项目: "risk",
};

function renderTutorialLine(line: string) {
  const match = line.match(/^(短期项目|长期项目|风险项目)：(.+)$/);
  if (!match) return { bullet: "•", body: line, accent: "#60a5fa" as const };

  const label = match[1];
  const typeKey = PROJECT_TYPE_LINE_KEY[label];
  const color = TYPE_COLORS[typeKey].border;
  return {
    swatch: color,
    body: (
      <>
        <strong style={{ color }}>{label}</strong>
        <span style={{ color: "var(--color-text-secondary)" }}>：{match[2]}</span>
      </>
    ),
  };
}

export interface TutorialSlidePanelProps {
  step: number;
  playerName?: string;
  /** 例如玩家端：「请听主持人讲解」；Admin 不传则只显示页码 */
  footerHint?: string;
  /** Admin inline 时略紧凑 */
  compact?: boolean;
  /** 玩家端桌面一屏：flex 分区 + 紧凑 demo */
  fitViewport?: boolean;
  /** 外层已有页码时隐藏底部 n/total */
  hidePageFooter?: boolean;
}

export const TutorialSlidePanel: React.FC<TutorialSlidePanelProps> = ({
  step: rawStep,
  playerName = "玩家",
  footerHint,
  compact = false,
  fitViewport = false,
  hidePageFooter = false,
}) => {
  const total = TUTORIAL_SLIDES.length;
  const step = Math.min(Math.max(rawStep, 0), total - 1);
  const slide = TUTORIAL_SLIDES[step];
  const progress = ((step + 1) / total) * 100;
  const [demoResetKey, setDemoResetKey] = useState(0);

  useEffect(() => {
    setDemoResetKey(0);
  }, [step]);

  const DemoComponent = slide.demoKey ? TUTORIAL_DEMO_BY_KEY[slide.demoKey] : undefined;
  const isIntro = Boolean(slide.intro);
  const isFinale = Boolean(slide.finale);
  const isHero = isIntro || isFinale;

  const iconSize = isIntro
    ? fitViewport
      ? "4.5rem"
      : compact
        ? "4.25rem"
        : "5.5rem"
    : isFinale
      ? fitViewport
        ? "3.75rem"
        : compact
          ? "3.75rem"
          : "5rem"
      : fitViewport
        ? "2.5rem"
        : compact
          ? "3rem"
          : "4rem";
  const titleSize = isIntro
    ? fitViewport
      ? "2.35rem"
      : compact
        ? "2.25rem"
        : "3rem"
    : isFinale
      ? fitViewport
        ? "2.05rem"
        : compact
          ? "2rem"
          : "2.75rem"
      : fitViewport
        ? "1.5rem"
        : compact
          ? "1.75rem"
          : "2.25rem";
  const contentPadding = isIntro
    ? fitViewport
      ? "2rem 1.75rem"
      : compact
        ? "2rem 1.75rem"
        : "3.25rem 2.75rem"
    : isFinale
      ? fitViewport
        ? "1.75rem 1.5rem"
        : compact
          ? "1.75rem 1.5rem"
          : "3rem 2.5rem"
      : fitViewport
        ? "1.5rem 1.25rem"
        : compact
          ? "1.5rem 1.25rem"
          : "2.5rem 2rem";
  const iconMb = isIntro
    ? fitViewport
      ? "1rem"
      : "1.5rem"
    : isFinale
      ? fitViewport
        ? "0.85rem"
        : "1.35rem"
      : fitViewport
        ? "0.5rem"
        : compact
          ? "1rem"
          : "1.25rem";
  const titleMb = isIntro
    ? fitViewport
      ? "1.15rem"
      : "1.65rem"
    : isFinale
      ? fitViewport
        ? "1rem"
        : "1.5rem"
      : fitViewport
        ? "0.65rem"
        : compact
          ? "1rem"
          : "1.5rem";
  const lineFont = isIntro
    ? uiRem(fitViewport ? 1.18 : 1.22)
    : isFinale
      ? uiRem(fitViewport ? 1.1 : 1.15)
      : fitViewport
        ? uiRem(0.9)
        : uiRem(1);
  const linePad = isIntro ? "0.65rem 0" : isFinale ? "0.55rem 0" : fitViewport ? "0.35rem 0" : "0.5rem 0";
  const copyPadding = isIntro
    ? fitViewport
      ? "1.5rem 1.75rem"
      : "1.75rem 2rem"
    : isFinale
      ? fitViewport
        ? "1.35rem 1.5rem"
        : "1.5rem 1.75rem"
      : fitViewport
        ? "0.75rem"
        : "1.25rem";
  const dotsMt = isHero ? (fitViewport ? "1rem" : "1.75rem") : fitViewport ? "0.65rem" : "1.5rem";
  const footerMt = fitViewport ? "0.5rem" : "1rem";
  const footerFont = isIntro ? uiRem(0.95) : isFinale ? uiRem(0.9) : uiRem(0.8);
  const bulletFont = isIntro ? uiRem(1.12) : isFinale ? uiRem(1.05) : undefined;
  const heroCopyClass = isHero ? " tutorial-slide-panel__copy--hero" : "";

  const gavelIconPx = (() => {
    const rem = parseFloat(iconSize);
    return Number.isFinite(rem) ? Math.round(rem * 16) : 56;
  })();
  const slideIcon =
    slide.gavelIcon ? (
      <span className="tutorial-slide-icon-gavel" style={{ display: "inline-flex", justifyContent: "center" }}>
        <GavelIcon size={gavelIconPx} decorative />
      </span>
    ) : (
      slide.icon
    );

  const isProjectTypesSlide = slide.demoKey === "projectTypes";
  const isResourcesSlide = slide.demoKey === "resources";

  const projectTypesLineFont =
    isProjectTypesSlide && fitViewport ? uiRem(0.84) : isProjectTypesSlide ? uiRem(0.88) : lineFont;

  const copyBlock = (
    <div
      className={
        fitViewport
          ? `tutorial-slide-panel__copy${heroCopyClass}${isProjectTypesSlide ? " tutorial-slide-panel__copy--project-types" : ""}`
          : isHero
            ? `tutorial-slide-panel__copy${heroCopyClass}${isProjectTypesSlide ? " tutorial-slide-panel__copy--project-types" : ""}`
            : isProjectTypesSlide
              ? "tutorial-slide-panel__copy tutorial-slide-panel__copy--project-types"
              : undefined
      }
      style={{
        background: "rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: fitViewport ? "0.75rem" : "1rem",
        padding: copyPadding,
        textAlign: "left",
        marginBottom: fitViewport ? 0 : "0.5rem",
      }}
    >
      {isProjectTypesSlide ? (
        <TutorialProjectTypesCopy lineFont={projectTypesLineFont} fitViewport={fitViewport} />
      ) : null}
      {!isProjectTypesSlide &&
      slide.content.map((line, i) => {
        const rendered = renderTutorialLine(line);
        const showEnergyTableAfter = isResourcesSlide && i === 0;
        const isLastLine = i === slide.content.length - 1;
        return (
          <React.Fragment key={i}>
          <div
            style={{
              display: "flex",
              gap: fitViewport ? "0.5rem" : "0.75rem",
              padding: linePad,
              borderBottom:
                showEnergyTableAfter || isLastLine ? "none" : "1px solid rgba(255,255,255,0.04)",
              alignItems: "flex-start",
            }}
          >
            {rendered.swatch ? (
              <span
                aria-hidden
                style={{
                  width: "0.75rem",
                  height: "0.75rem",
                  borderRadius: "0.2rem",
                  background: rendered.swatch,
                  flexShrink: 0,
                  marginTop: "0.35rem",
                  boxShadow: `0 0 0 1px ${rendered.swatch}55`,
                }}
              />
            ) : (
              <span
                style={{
                  color: rendered.accent,
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: "0.1rem",
                  fontSize: bulletFont,
                }}
              >
                {rendered.bullet}
              </span>
            )}
            <span style={{ fontSize: lineFont, lineHeight: fitViewport ? 1.45 : 1.6 }}>
              {typeof rendered.body === "string" ? (
                <span style={{ color: "var(--color-text-secondary)" }}>{rendered.body}</span>
              ) : (
                rendered.body
              )}
            </span>
            </div>
            {showEnergyTableAfter && (
              <div
                style={{
                  paddingLeft: fitViewport ? "1.25rem" : "1.5rem",
                  borderBottom: isLastLine ? "none" : "1px solid rgba(255, 255, 255, 0.04)",
                }}
              >
                <EnergyScheduleMiniTable lineFont={lineFont} fitViewport={fitViewport} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  const demoPlayHint = slide.demoKey === "projectTypes" ? TUTORIAL_PROJECT_TYPES_PLAY_HINT : undefined;

  const demoBlock =
    DemoComponent &&
    (fitViewport ? (
      <div className="tutorial-slide-panel__demo">
        <TutorialDemoShell
          dense
          playHint={demoPlayHint}
          onReset={() => setDemoResetKey((k) => k + 1)}
        >
          <div key={`${step}-${demoResetKey}`} className="tutorial-slide-panel__demo-inner">
            <DemoComponent playerName={playerName} />
          </div>
        </TutorialDemoShell>
      </div>
    ) : (
      <TutorialDemoShell playHint={demoPlayHint} onReset={() => setDemoResetKey((k) => k + 1)}>
        <div key={`${step}-${demoResetKey}`}>
          <DemoComponent playerName={playerName} />
        </div>
      </TutorialDemoShell>
    ));

  const footerBlock = (
    <>
      <div
        className={fitViewport ? "tutorial-slide-panel__dots" : undefined}
        style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", marginTop: dotsMt }}
      >
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === step ? "1.5rem" : "0.375rem",
              height: "0.375rem",
              borderRadius: "9999px",
              background: i === step ? "#60a5fa" : "rgba(255,255,255,0.15)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      {!hidePageFooter && (
        <div style={{ marginTop: footerMt, fontSize: footerFont, color: "var(--color-text-muted)" }}>
          {footerHint ? `${footerHint} · ${step + 1} / ${total}` : `${step + 1} / ${total}`}
        </div>
      )}
    </>
  );

  return (
    <>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        教程第 {step + 1} 页，共 {total} 页：{slide.title}
      </div>

      <div
        className={
          fitViewport
            ? `tutorial-slide-panel tutorial-slide-panel--fit${DemoComponent ? "" : " tutorial-slide-panel--no-demo"}${isIntro ? " tutorial-slide-panel--intro" : ""}${isFinale ? " tutorial-slide-panel--finale" : ""}`
            : `tutorial-slide-panel${isIntro ? " tutorial-slide-panel--intro" : ""}${isFinale ? " tutorial-slide-panel--finale" : ""}`
        }
        data-demo-key={slide.demoKey ?? "none"}
        style={fitViewport ? { display: "flex", flexDirection: "column", width: "100%" } : undefined}
      >
        <div style={{ width: "100%", height: "3px", background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #3b82f6, #a855f7)",
              transition: "width 0.5s ease",
            }}
          />
        </div>

        {fitViewport ? (
          <div className="tutorial-slide-panel__body" style={{ textAlign: "center" }}>
            <div className="tutorial-slide-panel__header">
              <div
                style={{
                  fontSize: iconSize,
                  marginBottom: iconMb,
                  animation: "float 3s ease-in-out infinite",
                }}
              >
                {slideIcon}
              </div>
              <h1
                style={{
                  fontSize: titleSize,
                  fontWeight: 900,
                  background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  marginBottom: titleMb,
                  lineHeight: 1.2,
                }}
              >
                {slide.title}
              </h1>
            </div>
            {copyBlock}
            {demoBlock}
            <div className="tutorial-slide-panel__footer">{footerBlock}</div>
          </div>
        ) : (
          <div style={{ padding: contentPadding, textAlign: "center" }}>
            <div
              style={{
                fontSize: iconSize,
                marginBottom: iconMb,
                animation: "float 3s ease-in-out infinite",
              }}
            >
              {slideIcon}
            </div>

            <h1
              style={{
                fontSize: titleSize,
                fontWeight: 900,
                background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                marginBottom: titleMb,
                lineHeight: 1.2,
              }}
            >
              {slide.title}
            </h1>

            {copyBlock}
            {demoBlock}
            {footerBlock}
          </div>
        )}
      </div>
    </>
  );
};
