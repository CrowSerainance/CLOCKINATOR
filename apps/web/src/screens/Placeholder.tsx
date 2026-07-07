import { theme } from "../theme";

export function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 14, color: theme.textMuted }}>Screen coming soon — see design/Clockinator.html for the target layout.</div>
    </div>
  );
}
