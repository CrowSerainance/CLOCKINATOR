import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ClockinatorStore } from "../db/store";
import { theme } from "../theme";

const StoreContext = createContext<ClockinatorStore | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<ClockinatorStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("../db/open")
      .then(({ openClockinatorStore }) => openClockinatorStore())
      .then((next) => {
        if (!cancelled) setStore(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 40, color: theme.text }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Could not open local database</div>
        <div style={{ color: theme.textMuted, fontSize: 14 }}>{error}</div>
        <div style={{ color: theme.textFaint, fontSize: 13, marginTop: 12 }}>
          Hard-refresh this tab (Ctrl+Shift+R). Leave the Clockinator console window open.
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: theme.textMuted,
          background: theme.bg,
        }}
      >
        Loading local workspace…
      </div>
    );
  }

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): ClockinatorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}

export function useStoreRevision(): number {
  const store = useStore();
  const [revision, setRevision] = useState(store.revision);
  useEffect(() => store.subscribe(() => setRevision(store.revision)), [store]);
  return revision;
}
