/** 与 index.css 中 --text-ui-scale 保持一致，仅作脚本/文档参考 */
export const UI_TEXT_SCALE = 1.2;

/** 非标题 UI 字号：在原有 rem 上乘以 --text-ui-scale（单一旋钮） */
export function uiRem(baseRem: number): string {
  return `calc(${baseRem}rem * var(--text-ui-scale))`;
}

/** 是否视为「标题/大号展示」，保持原字号不缩放 */
export function isDisplayTitleSize(baseRem: number): boolean {
  return baseRem >= 1.35;
}
