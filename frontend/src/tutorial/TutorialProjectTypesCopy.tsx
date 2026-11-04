import React from "react";
import { ProjectTypesRulesTable } from "../components/help/ProjectTypesRulesTable";
import { TUTORIAL_PROJECT_TYPES_INTRO_LEAD } from "../config/tutorialProjectTypes";

export const TutorialProjectTypesCopy: React.FC<{ lineFont: string; fitViewport: boolean }> = ({
  lineFont,
  fitViewport,
}) => (
  <ProjectTypesRulesTable
    lineFont={lineFont}
    fitViewport={fitViewport}
    introLead={TUTORIAL_PROJECT_TYPES_INTRO_LEAD}
    showPlayJump
  />
);
