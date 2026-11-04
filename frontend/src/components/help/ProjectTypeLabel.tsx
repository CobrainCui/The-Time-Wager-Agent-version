import React from "react";
import { CatalogProjectType, TYPE_LABEL, TYPE_TEXT_COLOR } from "../../config/projectCatalog";

export const ProjectTypeLabel: React.FC<{ type: CatalogProjectType }> = ({ type }) => (
  <span style={{ color: TYPE_TEXT_COLOR[type], fontWeight: 700 }}>{TYPE_LABEL[type]}</span>
);
