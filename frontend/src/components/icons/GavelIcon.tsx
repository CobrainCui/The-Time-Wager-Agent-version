import React from "react";

/**
 * 拍卖统一法槌图标（Lucide gavel, ISC）
 * @see https://lucide.dev/icons/gavel
 * Vendored copy: frontend/public/icons/gavel-lucide.svg
 */

const DEFAULT_COLOR = "#c084fc";

type Props = {
  size?: number;
  style?: React.CSSProperties;
  /** 父级已有标题时用，避免重复读屏 */
  decorative?: boolean;
};

const GAVEL_PATHS = [
  "m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8",
  "m16 16 6-6",
  "m8 8 6-6",
  "m9 7 8 8",
  "m21 11-8-8",
] as const;

export const GavelIcon: React.FC<Props> = ({
  size = 56,
  style,
  decorative = false,
}) => {
  const { color: styleColor, ...restStyle } = style ?? {};
  const color = styleColor ?? DEFAULT_COLOR;
  const strokeWidth = size <= 20 ? 1.75 : 2;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : "拍卖"}
      style={{ color, flexShrink: 0, ...restStyle }}
    >
      {GAVEL_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
};
