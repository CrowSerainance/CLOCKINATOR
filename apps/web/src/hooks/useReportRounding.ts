import { useEffect, useState } from "react";
import {
  getReportRounding,
  setReportRounding,
  type RoundingSettings,
} from "../domain/preferences";

export function useReportRounding(): [RoundingSettings, (settings: RoundingSettings) => void] {
  const [settings, setSettings] = useState<RoundingSettings>(() => getReportRounding());

  useEffect(() => {
    const sync = () => setSettings(getReportRounding());
    window.addEventListener("clockinator:prefs", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("clockinator:prefs", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return [
    settings,
    (next) => {
      setReportRounding(next);
      setSettings(next);
    },
  ];
}
