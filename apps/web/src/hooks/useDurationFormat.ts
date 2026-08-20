import { useEffect, useState } from "react";
import { getDurationFormat, setDurationFormat, type DurationFormat } from "../domain/preferences";

export function useDurationFormat(): [DurationFormat, (format: DurationFormat) => void] {
  const [format, setFormat] = useState<DurationFormat>(() => getDurationFormat());

  useEffect(() => {
    const sync = () => setFormat(getDurationFormat());
    window.addEventListener("clockinator:prefs", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("clockinator:prefs", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return [
    format,
    (next) => {
      setDurationFormat(next);
      setFormat(next);
    },
  ];
}
