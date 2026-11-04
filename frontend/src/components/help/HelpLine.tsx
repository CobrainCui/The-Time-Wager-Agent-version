import React from "react";
import { uiRem } from "../../utils/typography";
import type { CatalogProjectType } from "../../config/projectCatalog";
import { ProjectTypeLabel } from "./ProjectTypeLabel";
import { GavelIcon } from "../icons/GavelIcon";

export const HelpLine: React.FC<{
  icon?: string;
  gavelIcon?: boolean;
  projectType?: CatalogProjectType;
  children: React.ReactNode;
}> = ({ icon, gavelIcon, projectType, children }) => (
  <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", padding: "0.35rem 0" }}>
    <span aria-hidden style={{ flexShrink: 0, fontSize: uiRem(1.05), display: "flex", alignItems: "center" }}>
      {gavelIcon ? (
        <GavelIcon size={18} decorative style={{ color: "#c084fc" }} />
      ) : projectType ? (
        <ProjectTypeLabel type={projectType} />
      ) : (
        icon
      )}
    </span>
    <span style={{ color: "var(--color-text-secondary)", fontSize: uiRem(0.88), lineHeight: 1.5 }}>{children}</span>
  </div>
);
