import { getProjectImageDisplay } from "../utils/gameImageDisplay";
import {
  TUTORIAL_ERA_SAMPLE_PROJECT,
  TUTORIAL_LONG_PROJECT,
  TUTORIAL_RISK_PROJECT,
  TUTORIAL_SHORT_PROJECT,
} from "./tutorialMock";

const TUTORIAL_PRELOAD_PROJECTS = [
  TUTORIAL_SHORT_PROJECT,
  TUTORIAL_LONG_PROJECT,
  TUTORIAL_RISK_PROJECT,
  TUTORIAL_ERA_SAMPLE_PROJECT,
];

/** 进入教程时预取试玩项目封面，减少翻到项目页才加载导致的空白。 */
export function preloadTutorialProjectCovers() {
  for (const project of TUTORIAL_PRELOAD_PROJECTS) {
    const { src } = getProjectImageDisplay(project.id, project.name, {});
    const img = new Image();
    img.src = src;
  }
}
