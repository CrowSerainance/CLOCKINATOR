import { useEffect, useState } from "react";
import { formatDuration } from "../domain/duration";
import { useStore, useStoreRevision } from "./useClockinator";

export function useTimer() {
  const store = useStore();
  useStoreRevision();
  const session = store.getOpenSession();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session || (session.status !== "running" && session.status !== "on_break")) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session?.id, session?.status]);

  const at = new Date(now);
  const elapsed = session ? store.elapsedFor(session.id, at) : 0;
  const breakElapsed = session?.status === "on_break" ? store.breakElapsedFor(session.id, at) : 0;
  const week = store.listWeekGroups(at);

  return {
    session,
    elapsed,
    elapsedLabel: formatDuration(elapsed),
    breakElapsed,
    breakLabel: formatDuration(breakElapsed),
    isRunning: session?.status === "running",
    isPaused: session?.status === "paused",
    isOnBreak: session?.status === "on_break",
    isIdle: !session,
    projects: store.listActiveProjects(),
    tags: store.listTags(),
    groups: week.groups,
    weekTotal: week.weekTotal,
    start: store.start.bind(store),
    pause: store.pause.bind(store),
    resume: store.resume.bind(store),
    stop: store.stop.bind(store),
    split: store.split.bind(store),
    beginBreak: store.beginBreak.bind(store),
    finishBreak: store.finishBreak.bind(store),
    restartFrom: store.restartFrom.bind(store),
    addManual: store.createManualEntry.bind(store),
  };
}
