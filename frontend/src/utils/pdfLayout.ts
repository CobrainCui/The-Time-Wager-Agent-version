/** 封面第 1 页：模板图含「Dear 」字样，仅叠加玩家昵称（与参考手册 PDF 坐标一致，单位 mm） */
export const PDF_COVER_PLAYER_NAME = {
  x: 44,
  y: 125,
  fontSize: 24,
} as const;

/** A4 第 2 页图表占位（mm），与 pdf_templates 各人格 2.jpg 版式一致 */
export const PDF_PAGE2_CHARTS = {
  /** 雷达在 PDF 中的占位区（mm）：顶边 y、最大高度 h，嵌入时保持截图比例不拉伸 */
  radar: { x: 37, y: 114, w: 136, h: 58 },
  wealthLine: { x: 28, y: 184, w: 154, h: 70 },
} as const;

/** 截图像素与 PDF mm 同比例，避免 addImage 拉伸 */
export const PDF_CHART_CAPTURE_PX_PER_MM = 10;

export function pdfChartCaptureSize(box: { w: number; h: number }) {
  const scale = PDF_CHART_CAPTURE_PX_PER_MM;
  return {
    width: Math.round(box.w * scale),
    height: Math.round(box.h * scale),
  };
}

export const PDF_RADAR_CAPTURE = {
  /** 比 PDF 占位更窄，使 Chart 少留左右空白；嵌入时仍按 radar.w × radar.h mm */
  width: Math.round(PDF_PAGE2_CHARTS.radar.w * PDF_CHART_CAPTURE_PX_PER_MM * 0.68),
  height: Math.round(PDF_PAGE2_CHARTS.radar.h * PDF_CHART_CAPTURE_PX_PER_MM),
};

/** 雷达 html2canvas 后再裁掉左右各多少比例（0–0.5） */
export const PDF_RADAR_CAPTURE_CROP_X = 0.08;
export const PDF_LINE_CAPTURE = pdfChartCaptureSize(PDF_PAGE2_CHARTS.wealthLine);

/** 模板页码 4（遗憾遗产 5.jpg）项目参与柱形图标题 */
export const PDF_PAGE5_BAR_TITLE = {
  text: "项目参与结果分布：",
  x: 28,
  y: 148,
  fontSize: 20,
} as const;

/** 模板页码 4（遗憾遗产 5.jpg）项目参与柱形图（纵向拉长） */
export const PDF_PAGE5_PROJECT_BAR = { x: 28, y: 154, w: 154, h: 56 } as const;

/** 柱形图绘图区占 capture 宽度的比例（与 Chart.js layout.padding 共用） */
export const PDF_PROJECT_BAR_PLOT = {
  yAxisInsetRatio: 0.062,
  rightInsetRatio: 0.025,
} as const;

/** 未完成长期项目表：不得侵入柱图标题区 */
export const PDF_PAGE5_UNFINISHED_TABLE = {
  startY: 105,
  nameX: 60,
  progressX: 160,
  lineHeight: 10,
  nameColumnWidthMm: 88,
  /** 标题 baseline 上方留白（避免与表格底边/边框重叠） */
  maxY: PDF_PAGE5_BAR_TITLE.y - 14,
} as const;

export const PDF_PAGE5_PROJECT_NAMES = {
  /** 柱图底边 (y+h) 下方留白后起排（与 Chart 内 X 轴标签错开） */
  topY: PDF_PAGE5_PROJECT_BAR.y + PDF_PAGE5_PROJECT_BAR.h + 8,
  fontSize: 18,
  lineHeight: 6.4,
  /** 状态标签与项目名之间的空行数 */
  blankLinesBefore: 1,
  maxY: 268,
} as const;

/** 与 Chart.js 柱形图 capture 对齐的柱心与列宽（mm） */
export function pdfProjectBarColumnLayout(): { centers: number[]; maxWidth: number } {
  const { x, w } = PDF_PAGE5_PROJECT_BAR;
  const { yAxisInsetRatio, rightInsetRatio } = PDF_PROJECT_BAR_PLOT;
  const plotW = w * (1 - yAxisInsetRatio - rightInsetRatio);
  const plotX = x + w * yAxisInsetRatio;
  const slotW = plotW / 3;
  const centers = [0, 1, 2].map((i) => plotX + slotW * (i + 0.5));
  return { centers, maxWidth: Math.max(28, slotW - 2) };
}

export function pdfProjectBarChartLayoutPaddingPx(captureWidthPx: number) {
  const { yAxisInsetRatio, rightInsetRatio } = PDF_PROJECT_BAR_PLOT;
  return {
    top: 8,
    /** 容纳 X 轴中文标签（font ~34px） */
    bottom: 28,
    left: Math.round(captureWidthPx * yAxisInsetRatio),
    right: Math.round(captureWidthPx * rightInsetRatio),
  };
}

export const PDF_PROJECT_BAR_CAPTURE = pdfChartCaptureSize(PDF_PAGE5_PROJECT_BAR);
