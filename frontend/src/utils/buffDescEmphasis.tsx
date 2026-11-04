import React from "react";

export type BuffDescSegment = { type: "text"; value: string } | { type: "bold"; value: string };

/** 解析道具文案中的 **强调** 标记 */
export function parseBuffDescSegments(text: string): BuffDescSegment[] {
  const segments: BuffDescSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("**", i);
    if (open === -1) {
      if (i < text.length) segments.push({ type: "text", value: text.slice(i) });
      break;
    }
    if (open > i) segments.push({ type: "text", value: text.slice(i, open) });
    const close = text.indexOf("**", open + 2);
    if (close === -1) {
      segments.push({ type: "text", value: text.slice(open) });
      break;
    }
    const inner = text.slice(open + 2, close);
    if (inner) segments.push({ type: "bold", value: inner });
    i = close + 2;
  }
  return segments;
}

export function stripBuffDescEmphasis(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}

type BuffDescTextProps = {
  text: string;
  className?: string;
  style?: React.CSSProperties;
};

/** 渲染道具描述（支持换行与 **粗体**） */
export const BuffDescText: React.FC<BuffDescTextProps> = ({ text, className, style }) => {
  const lines = text.split("\n");
  return (
    <span className={className} style={{ whiteSpace: "pre-line", ...style }}>
      {lines.map((line, lineIdx) => (
        <React.Fragment key={lineIdx}>
          {lineIdx > 0 && "\n"}
          {parseBuffDescSegments(line).map((seg, segIdx) =>
            seg.type === "bold" ? (
              <strong key={segIdx} style={{ fontWeight: 700, color: "inherit" }}>
                {seg.value}
              </strong>
            ) : (
              <React.Fragment key={segIdx}>{seg.value}</React.Fragment>
            )
          )}
        </React.Fragment>
      ))}
    </span>
  );
};
