import { theme } from "../theme";
import type { CSSProperties } from "react";

export function btn(background: string, color: string, extra?: CSSProperties): CSSProperties {
  return {
    background,
    color,
    border: "none",
    borderRadius: 10,
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    ...extra,
  };
}

export const fieldStyle: CSSProperties = {
  background: theme.surfaceAlt,
  color: theme.text,
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
};

export const pagePad: CSSProperties = {
  padding: "22px 28px 32px",
  overflowY: "auto",
  flex: 1,
};

export const card: CSSProperties = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  overflow: "hidden",
};
