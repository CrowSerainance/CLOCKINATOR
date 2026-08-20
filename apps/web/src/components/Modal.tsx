import type { CSSProperties, ReactNode } from "react";
import { theme } from "../theme";

export function Modal({
  title,
  children,
  onClose,
  width = 520,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          padding: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ marginLeft: "auto", background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 18 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: theme.textFaint,
  letterSpacing: ".06em",
  display: "block",
  marginBottom: 6,
};
