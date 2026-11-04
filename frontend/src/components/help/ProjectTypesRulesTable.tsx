import React, { useId, useState } from "react";
import { uiRem } from "../../utils/typography";
import { TYPE_COLORS } from "../ProjectCard";
import type { CatalogProjectType } from "../../config/projectCatalog";
import {
  TUTORIAL_PROJECT_BOARD_REMINDER_ROWS,
  TUTORIAL_PROJECT_RULE_COLUMNS,
  TUTORIAL_PROJECT_RULE_MATRIX,
  TUTORIAL_PROJECT_TYPE_LABEL,
} from "../../config/tutorialProjectTypes";
import { TUTORIAL_PROJECT_TYPES_PLAY_ID } from "../../config/playerHelpReference";

const TYPES: CatalogProjectType[] = ["short", "long", "risk"];

export interface ProjectTypesRulesTableProps {
  lineFont: string;
  fitViewport?: boolean;
  /** 表前说明；省略则不展示 */
  introLead?: string;
  showPlayJump?: boolean;
  showBoardReminders?: boolean;
  boardRemindersSectionId?: string;
}

export const ProjectTypesRulesTable: React.FC<ProjectTypesRulesTableProps> = ({
  lineFont,
  fitViewport = false,
  introLead,
  showPlayJump = false,
  showBoardReminders = true,
  boardRemindersSectionId,
}) => {
  const tableId = useId();
  const remindersTitleId = boardRemindersSectionId ?? `${tableId}-board-reminders`;
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});

  const toggleType = (type: CatalogProjectType) => {
    setExpandedTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const scrollToPlay = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById(TUTORIAL_PROJECT_TYPES_PLAY_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="tutorial-project-types-copy">
      {introLead && (
        <p
          className="tutorial-project-types-copy__lead"
          style={{
            margin: "0 0 0.65rem",
            fontSize: lineFont,
            lineHeight: fitViewport ? 1.45 : 1.55,
            color: "var(--color-text-secondary)",
          }}
        >
          {introLead}
          {showPlayJump && (
            <a
              href={`#${TUTORIAL_PROJECT_TYPES_PLAY_ID}`}
              className="tutorial-project-types-copy__play-jump"
              onClick={scrollToPlay}
            >
              前往试玩区
            </a>
          )}
        </p>
      )}
      <div className="tutorial-project-types-copy__table-wrap">
        <table
          id={tableId}
          className="tutorial-project-types-copy__table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: lineFont,
            marginBottom: showBoardReminders ? "0.5rem" : 0,
          }}
        >
          <caption className="sr-only">短期、长期、风险三类项目：结算时机、基础回报、排名奖惩、时代加成</caption>
          <thead>
            <tr style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.78) }}>
              <th
                scope="col"
                className="tutorial-project-types-copy__th-type"
                style={{ textAlign: "left", padding: "0.35rem 0.5rem", fontWeight: 700 }}
              >
                类型
              </th>
              {TUTORIAL_PROJECT_RULE_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="tutorial-project-types-copy__th-rule"
                  style={{ textAlign: "left", padding: "0.35rem 0.5rem", fontWeight: 700 }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TYPES.map((type) => {
              const tc = TYPE_COLORS[type];
              const label = TUTORIAL_PROJECT_TYPE_LABEL[type];
              const row = TUTORIAL_PROJECT_RULE_MATRIX[type];
              const expanded = Boolean(expandedTypes[type]);
              const detailRowId = `${tableId}-detail-${type}`;
              return (
                <React.Fragment key={type}>
                  <tr style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                    <td
                      className="tutorial-project-types-copy__cell-type"
                      style={{
                        padding: "0.45rem 0.5rem",
                        verticalAlign: "top",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <strong style={{ color: tc.text, display: "block", marginBottom: "0.25rem" }}>
                        {label}
                      </strong>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm tutorial-project-types-copy__cell-toggle"
                        onClick={() => toggleType(type)}
                        aria-expanded={expanded}
                        aria-controls={detailRowId}
                      >
                        {expanded ? "收起说明" : "展开说明"}
                        <span className="sr-only">{label}完整规则</span>
                      </button>
                    </td>
                    {TUTORIAL_PROJECT_RULE_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className="tutorial-project-types-copy__cell-rule"
                        style={{ padding: "0.4rem 0.45rem", verticalAlign: "top" }}
                      >
                        <span className="tutorial-project-types-copy__rule-brief">{row[col.key].brief}</span>
                      </td>
                    ))}
                  </tr>
                  {expanded && (
                    <tr className="tutorial-project-types-copy__detail-row">
                      <td
                        id={detailRowId}
                        colSpan={1 + TUTORIAL_PROJECT_RULE_COLUMNS.length}
                        style={{ padding: "0 0.5rem 0.65rem", verticalAlign: "top" }}
                      >
                        <div
                          className="tutorial-project-types-copy__rule-detail"
                          role="region"
                          aria-label={`${label}完整说明`}
                          style={{
                            borderColor: `${tc.border}44`,
                            background: tc.bg,
                            fontSize: fitViewport ? uiRem(0.78) : lineFont,
                          }}
                        >
                          <dl className="tutorial-project-types-copy__detail-dl">
                            {TUTORIAL_PROJECT_RULE_COLUMNS.map((col) => (
                              <div key={col.key} className="tutorial-project-types-copy__detail-item">
                                <dt>{col.label}</dt>
                                <dd>{row[col.key].detail}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {showBoardReminders && (
        <section aria-labelledby={remindersTitleId}>
          <h4
            id={remindersTitleId}
            className="tutorial-project-types-copy__reminders-title"
            style={{
              margin: "0.75rem 0 0.35rem",
              fontSize: uiRem(0.82),
              fontWeight: 800,
              color: "var(--color-text-muted)",
            }}
          >
            牌桌提示
          </h4>
          <div className="tutorial-project-types-copy__reminders tutorial-project-types-copy__reminders-table-wrap">
            <table
              className="tutorial-project-types-copy__reminders-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: lineFont,
              }}
            >
              <caption className="sr-only">牌面存续、发牌与查阅</caption>
              <tbody>
                {TUTORIAL_PROJECT_BOARD_REMINDER_ROWS.map((row) => (
                  <tr
                    key={row.topic}
                    style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
                  >
                    <th
                      scope="row"
                      style={{
                        textAlign: "left",
                        padding: fitViewport ? "0.35rem 0.5rem 0.35rem 0" : "0.45rem 0.55rem 0.45rem 0",
                        verticalAlign: "top",
                        fontWeight: 700,
                        color: "#93c5fd",
                        whiteSpace: "nowrap",
                        width: "4.5rem",
                      }}
                    >
                      {row.topic}
                    </th>
                    <td
                      style={{
                        padding: fitViewport ? "0.35rem 0" : "0.45rem 0",
                        verticalAlign: "top",
                        lineHeight: fitViewport ? 1.45 : 1.55,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {row.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
