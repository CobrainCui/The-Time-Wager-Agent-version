import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { uiRem } from "../utils/typography";
import { EraIntro } from "../views/EraIntro";
import { BuffUsage } from "../views/BuffUsage";
import { Investment } from "../views/Investment";
import { Settlement } from "../views/Settlement";
import { AuctionView } from "../views/AuctionView";
import { BuffInvestmentSplit } from "../components/BuffInvestmentSplit";
import {
  DEVICE_PREVIEW_PAGES,
  DevicePreviewPageId,
  getDevicePreviewGame,
  getDevicePreviewMe,
} from "./mockGame";
import { enterDevicePreviewSession, leaveDevicePreviewSession } from "./session";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";

const GameOver = lazy(() =>
  import("../views/GameOver").then((m) => ({ default: m.GameOver }))
);

interface Props {
  onClose: () => void;
}

export const DevicePreviewShell: React.FC<Props> = ({ onClose }) => {
  const [pageId, setPageId] = useState<DevicePreviewPageId>("era_intro");
  const [investmentDraft, setInvestmentDraft] = useState<Record<number, number>>({ 1: 4, 2: 3 });

  // 首帧就要进预览会话，否则 EraIntro 等会按正式局路径解析图（占位时代 → 缺图）
  enterDevicePreviewSession();

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      leaveDevicePreviewSession();
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const game = useMemo(() => getDevicePreviewGame(pageId), [pageId]);
  const me = useMemo(() => getDevicePreviewMe(game), [game]);

  const renderInvestBuffPage = () => (
    <BuffInvestmentSplit
      game={game}
      left={
        <BuffUsage
          game={game}
          me={me}
          buffImages={{}}
          hideDock
        />
      }
      right={
        <Investment
          game={game}
          me={me}
          mode="investment"
          projectImages={{}}
          draft={investmentDraft}
          onDraftChange={setInvestmentDraft}
          hideCountdown
        />
      }
    />
  );

  const renderPage = () => {
    switch (pageId) {
      case "era_intro":
        return <EraIntro game={game} me={me} eraImages={{}} />;
      case "invest":
        return renderInvestBuffPage();
      case "settlement":
        return <Settlement game={game} me={me} />;
      case "auction":
        return <AuctionView game={game} me={me} buffImages={{}} />;
      case "game_over":
        return (
          <Suspense
            fallback={
              <div className="page-center" style={{ minHeight: "40vh", color: "var(--color-text-muted)" }}>
                加载终局…
              </div>
            }
          >
            <GameOver game={game} me={me} personaImages={{}} />
          </Suspense>
        );
      default:
        return null;
    }
  };

  const shell = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="设备预览"
      className="device-preview-shell"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        flexDirection: "row",
        height: "100dvh",
        maxHeight: "100dvh",
        background: "#070b14",
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <PreviewErrorBoundary onClose={onClose}>
          <div
            className="device-preview-stage"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
            }}
          >
            <div key={pageId} className="device-preview-static">
              {renderPage()}
            </div>
          </div>
        </PreviewErrorBoundary>
      </div>

      <aside
        className="device-preview-rail"
        aria-label="预览页面"
        style={{
          flexShrink: 0,
          width: "min(42vw, 11.5rem)",
          maxWidth: "11.5rem",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(7,11,20,0.98)",
          display: "flex",
          flexDirection: "column",
          padding: "0.75rem 0.65rem",
          gap: "0.75rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: uiRem(0.8),
              fontWeight: 800,
              color: "#93c5fd",
              letterSpacing: "0.06em",
            }}
          >
            预览
          </div>
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: uiRem(0.65),
              lineHeight: 1.45,
              color: "var(--color-text-muted)",
            }}
          >
            仅排版与图片；可切换投资 / 道具
          </p>
        </div>

        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
          }}
        >
          {DEVICE_PREVIEW_PAGES.map((p) => {
            const active = p.id === pageId;
            return (
              <button
                key={p.id}
                type="button"
                className={active ? "btn btn-sm btn-primary" : "btn btn-sm btn-ghost"}
                onClick={() => setPageId(p.id)}
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  fontSize: uiRem(0.72),
                  padding: "0.45rem 0.65rem",
                  textAlign: "left",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </nav>

        <button type="button" className="btn btn-sm btn-ghost btn-full" onClick={onClose}>
          返回
        </button>
      </aside>
    </div>
  );

  return createPortal(shell, document.body);
};
