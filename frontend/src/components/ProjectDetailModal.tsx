import React, { useCallback, useEffect, useId, useRef } from "react";
import { uiRem } from "../utils/typography";
import { ActiveProject } from "../types";
import { getProjectImageDisplay } from "../utils/gameImageDisplay";
import { getProjectInvestorBrief } from "../config/projectDescriptions";
import {
  PROJECT_CATALOG_BY_ID,
  getRiskRate,
  rankRewardRows,
  CatalogProjectType,
  SETTLEMENT_TIMING_DETAIL,
  PROJECT_BOARD_PERSISTENCE_DETAIL,
  effectiveRankRewards,
  ERA_BONUS_SHORT,
  ERA_BONUS_LONG,
} from "../config/projectCatalog";
import { LONG_CONTINUE_MIN_ENERGY } from "../config/longTermRules";
import { BUFF_UI_SNIPPETS } from "../config/buffCards";
import { ProjectTypeLabel } from "./help/ProjectTypeLabel";
import { TYPE_COLORS } from "./ProjectCard";
import { useImageWithFallback } from "../hooks/useImageWithFallback";

interface Props {
  project: ActiveProject | null;
  eraTheme?: string;
  uploadedVersion?: number;
  /** 排名奖/投爆罚档位数（1–3 人为五人档）；缺省按六人展示 */
  playerCount?: number;
  /** 实际开局人数，用于 1–3 人时的说明文案 */
  seatedPlayerCount?: number;
  onClose: () => void;
}

const ruleLabel: React.CSSProperties = {
  fontSize: uiRem(0.72),
  fontWeight: 700,
  color: "var(--color-text-muted)",
  marginBottom: "0.25rem",
};

const ruleValue: React.CSSProperties = {
  fontSize: uiRem(0.85),
  color: "var(--color-text-secondary)",
  lineHeight: 1.55,
  margin: 0,
};

function resolveRankRewards(
  project: ActiveProject,
  tierCount?: number,
  seatedCount?: number
): number[] | undefined {
  const onCard = project.rankRewards;
  const tier = tierCount && tierCount > 0 ? tierCount : 6;
  const rawForScale = seatedCount && seatedCount > 0 ? seatedCount : tier;
  if (onCard?.length) {
    if (tier === 4 || tier === 5) {
      if (onCard.length === tier) return onCard;
      const catalog = PROJECT_CATALOG_BY_ID[project.id]?.rankRewards;
      const rescale = effectiveRankRewards(catalog, rawForScale);
      if (rescale?.length) return rescale;
    }
    return onCard;
  }
  const catalog = PROJECT_CATALOG_BY_ID[project.id]?.rankRewards;
  return effectiveRankRewards(catalog, rawForScale);
}

function RankRewardPlayerCountNote({
  tierCount,
  seatedCount,
}: {
  tierCount?: number;
  seatedCount?: number;
}) {
  const tier = tierCount && tierCount > 0 ? tierCount : 6;
  if (tier !== 4 && tier !== 5) return null;
  const seated = seatedCount && seatedCount > 0 ? seatedCount : tier;
  const text =
    seated >= 1 && seated <= 3
      ? `本局 ${seated} 人，排名奖按五人档（总池与六人版一致）`
      : `本局 ${tier} 人：第 1–${tier} 名奖励如下（总池与六人版一致）`;
  return (
    <p
      style={{
        ...ruleValue,
        marginTop: "0.25rem",
        marginBottom: "0.35rem",
        fontSize: uiRem(0.75),
        color: "#c084fc",
      }}
    >
      {text}
    </p>
  );
}

function resolvePenalties(project: ActiveProject, tierCount?: number): number[] | undefined {
  const base = project.overInvestPenalty ?? PROJECT_CATALOG_BY_ID[project.id]?.overInvestPenalty;
  if (!base?.length) return undefined;
  const tier = tierCount && tierCount > 0 ? tierCount : 6;
  return base.slice(0, Math.min(tier, base.length));
}

function RulesSection({
  project,
  tierCount,
  seatedCount,
}: {
  project: ActiveProject;
  tierCount?: number;
  seatedCount?: number;
}) {
  const type = project.type as CatalogProjectType;
  const rankRows = rankRewardRows(resolveRankRewards(project, tierCount, seatedCount));
  const penaltyRows = rankRewardRows(resolvePenalties(project, tierCount));
  const settlementDetail = SETTLEMENT_TIMING_DETAIL[type] ?? SETTLEMENT_TIMING_DETAIL.short;

  const settlementBlock = (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div>
        <div style={ruleLabel}>结算时间</div>
        <p style={ruleValue}>{settlementDetail}</p>
      </div>
      <div>
        <div style={ruleLabel}>牌面</div>
        <p style={ruleValue}>{PROJECT_BOARD_PERSISTENCE_DETAIL}</p>
      </div>
    </div>
  );

  if (type === "short") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {settlementBlock}
        <div>
          <div style={ruleLabel}>基础回报</div>
          <p style={ruleValue}>本轮每投入 1 点精力，回报 10 财富（只发给本轮投入的人）</p>
        </div>
        {rankRows.length > 0 && (
          <div>
            <div style={ruleLabel}>排名奖励（恰好满额时，按历史总投入；投入相同则并列共享）</div>
            <RankRewardPlayerCountNote tierCount={tierCount} seatedCount={seatedCount} />
            <table style={{ width: "100%", fontSize: uiRem(0.8), borderCollapse: "collapse" }}>
              <tbody>
                {rankRows.map(({ rank, value }) => (
                  <tr key={rank}>
                    <td style={{ padding: "0.2rem 0", color: "var(--color-text-muted)" }}>第 {rank} 名档</td>
                    <td style={{ padding: "0.2rem 0", fontFamily: "var(--font-mono)", textAlign: "right" }}>
                      +{value} 财富
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...ruleValue, marginTop: "0.35rem", fontSize: uiRem(0.75), color: "var(--color-text-muted)" }}>
              并列时均分所占用名次档位合计（向零取整）
            </p>
          </div>
        )}
        {penaltyRows.length > 0 && (
          <div>
            <div style={ruleLabel}>超过上限的投资失败惩罚（按历史总投入；投入相同则并列共享）</div>
            <table style={{ width: "100%", fontSize: uiRem(0.8), borderCollapse: "collapse" }}>
              <tbody>
                {penaltyRows.map(({ rank, value }) => (
                  <tr key={rank}>
                    <td style={{ padding: "0.2rem 0", color: "var(--color-text-muted)" }}>第 {rank} 名档</td>
                    <td style={{ padding: "0.2rem 0", fontFamily: "var(--font-mono)", textAlign: "right", color: "#fca5a5" }}>
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...ruleValue, marginTop: "0.35rem", fontSize: uiRem(0.75), color: "var(--color-text-muted)" }}>
              并列时均分所占用惩罚档位合计（向零取整）
            </p>
          </div>
        )}
        <div>
          <div style={ruleLabel}>时代加成</div>
          <p style={ruleValue}>主题契合且历史总投入第 1（并列则均分）：+{ERA_BONUS_SHORT}（仅恰好满额；超过上限投资失败则没有）</p>
        </div>
      </div>
    );
  }

  if (type === "long") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {settlementBlock}
        <div>
          <div style={ruleLabel}>跟投要求</div>
          <p style={ruleValue}>
            参与投资后，每轮至少投入 {LONG_CONTINUE_MIN_ENERGY} 点精力，否则视为放弃：累计投入的每 1 点精力返还 1 点财富，并退出完成时的排名与时代加成
          </p>
        </div>
        <div>
          <div style={ruleLabel}>完成回报</div>
          <p style={ruleValue}>达到或超过上限后：个人历史累计投入的每 1 点精力回报 15 财富（超额完成同样发放，没有短期项目那种超额投资惩罚）</p>
        </div>
        {rankRows.length > 0 && (
          <div>
            <div style={ruleLabel}>排名奖励（完成时，按历史总投入；投入相同则并列共享）</div>
            <RankRewardPlayerCountNote tierCount={tierCount} seatedCount={seatedCount} />
            <table style={{ width: "100%", fontSize: uiRem(0.8), borderCollapse: "collapse" }}>
              <tbody>
                {rankRows.map(({ rank, value }) => (
                  <tr key={rank}>
                    <td style={{ padding: "0.2rem 0", color: "var(--color-text-muted)" }}>第 {rank} 名档</td>
                    <td style={{ padding: "0.2rem 0", fontFamily: "var(--font-mono)", textAlign: "right" }}>
                      +{value} 财富
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...ruleValue, marginTop: "0.35rem", fontSize: uiRem(0.75), color: "var(--color-text-muted)" }}>
              并列时均分所占用名次档位合计（向零取整）
            </p>
          </div>
        )}
        <div>
          <div style={ruleLabel}>时代加成</div>
          <p style={ruleValue}>主题契合且历史总投入第 1（并列则均分）：+{ERA_BONUS_LONG}（满额或超填）</p>
        </div>
      </div>
    );
  }

  const rate = getRiskRate(project.name);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {settlementBlock}
      <div>
        <div style={ruleLabel}>基础回报</div>
        <p style={ruleValue}>未超过上限：本轮每投入 1 点精力，回报 {rate} 财富</p>
      </div>
      <div>
        <div style={ruleLabel}>超过上限，投资失败</div>
        <p style={ruleValue}>追回你在本项目上的全部历史风险收益</p>
      </div>
      <p style={{ ...ruleValue, fontSize: uiRem(0.75), color: "var(--color-text-muted)" }}>
        无排名奖励与时代加成
      </p>
    </div>
  );
}

export const ProjectDetailModal: React.FC<Props> = ({
  project,
  eraTheme,
  uploadedVersion,
  playerCount,
  seatedPlayerCount,
  onClose,
}) => {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  const open = project != null;
  const close = useCallback(() => onClose(), [onClose]);

  const display = project
    ? getProjectImageDisplay(project.id, project.name, {}, uploadedVersion)
    : { src: "", source: "default" as const };
  const defaultCoverSrc = project
    ? getProjectImageDisplay(project.id, project.name, {}, 0).src
    : "";
  const cover = useImageWithFallback(
    display.src,
    display.source === "custom" ? defaultCoverSrc : null,
  );

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onFocusIn = (e: FocusEvent) => {
      const root = dialogRef.current;
      if (!root || root.contains(e.target as Node)) return;
      e.stopPropagation();
      closeRef.current?.focus();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, close]);

  if (!open || !project) return null;

  const catalog = PROJECT_CATALOG_BY_ID[project.id];
  const era = project.era ?? catalog?.era ?? "—";
  const maxEnergy = project.maxEnergy ?? catalog?.maxEnergy ?? 0;
  const tc = TYPE_COLORS[project.type] || TYPE_COLORS.short;
  const isEraMatch = eraTheme && project.era === eraTheme && project.type !== "risk";

  const imageUrl = cover.src;

  const brief = getProjectInvestorBrief(project.id);

  return (
    <div className="modal-overlay leave-game-modal project-detail-overlay" onClick={close}>
      <div
        ref={dialogRef}
        className="modal-box project-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
        style={{
          textAlign: "left",
          maxWidth: "32rem",
          width: "min(100vw - 2rem, 32rem)",
          maxHeight: "min(90vh, 40rem)",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={close}
          ref={closeRef}
          aria-label="关闭"
          className="project-detail-modal-close"
        >
          ×
        </button>

        <div className="project-detail-modal-scroll">
          <div className="project-detail-modal-cover">
            {cover.showPlaceholder ? (
              <div
                aria-hidden
                className="project-detail-modal-cover-img"
                style={{
                  minHeight: "8rem",
                  background: "rgba(0,0,0,0.35)",
                }}
              />
            ) : (
              <img
                className="project-detail-modal-cover-img"
                src={imageUrl}
                alt=""
                onError={cover.onError}
              />
            )}
          </div>

          <div className="project-detail-modal-body">
          <h2
            id={titleId}
            style={{ margin: "0 0 0.5rem", fontSize: uiRem(1.15), fontWeight: 800, color: "white" }}
          >
            {project.name}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
            <ProjectTypeLabel type={project.type as CatalogProjectType} />
            <span
              style={{
                fontSize: uiRem(0.75),
                fontWeight: 700,
                padding: "0.15rem 0.5rem",
                borderRadius: "9999px",
                background: "rgba(255,255,255,0.08)",
                color: "var(--color-text-secondary)",
              }}
            >
              时代 · {era}
            </span>
            {isEraMatch && (
              <span style={{ fontSize: uiRem(0.72), fontWeight: 700, color: "#fbbf24" }}>🔥 时代UP</span>
            )}
          </div>

          <p
            id={descId}
            style={{ fontSize: uiRem(0.88), color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 1rem" }}
          >
            {brief}
          </p>

          <div
            style={{
              fontSize: uiRem(0.8),
              color: "var(--color-text-muted)",
              marginBottom: "0.75rem",
              fontFamily: "var(--font-mono)",
            }}
          >
            本局总投入 {project.accumulatedInvested} / 上限 {maxEnergy} 精力
          </div>

          <h3 style={{ fontSize: uiRem(0.8), fontWeight: 800, color: tc.text, margin: "0 0 0.5rem" }}>
            投资与回报
          </h3>
          <RulesSection project={project} tierCount={playerCount} seatedCount={seatedPlayerCount} />

          <p style={{ margin: "1rem 0 0", fontSize: uiRem(0.68), color: "var(--color-text-muted)", lineHeight: 1.45 }}>
            {BUFF_UI_SNIPPETS.goldSettlementFootnote()}
          </p>

          <button
            type="button"
            ref={doneRef}
            className="btn btn-primary"
            onClick={close}
            style={{ width: "100%", marginTop: "1.25rem" }}
          >
            知道了
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};
