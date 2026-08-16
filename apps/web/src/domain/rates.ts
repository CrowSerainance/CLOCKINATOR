export type RateSubject = "workspace" | "project" | "task" | "user";
export type RateKind = "billable" | "cost";

export interface RateLayers {
  task: string | null;
  project: string | null;
  workspace: string;
}

/**
 * Live hierarchy: task override → project override → workspace default.
 * Historic lookup (if present) already selected the correct layer before calling this.
 */
export function pickBillableRate(layers: RateLayers): string {
  if (layers.task != null && layers.task !== "") return layers.task;
  if (layers.project != null && layers.project !== "") return layers.project;
  return layers.workspace;
}

export interface HistoricRate {
  subject_type: RateSubject;
  subject_id: string;
  rate_kind: RateKind;
  amount: string;
  effective_from: string;
  effective_to: string | null;
}

/** Most specific historic row that covers `at`, else null (caller falls back to live columns). */
export function historicRateAt(
  rows: HistoricRate[],
  kind: RateKind,
  atIso: string,
  order: Array<{ type: RateSubject; id: string | null }>,
): string | null {
  for (const subject of order) {
    if (!subject.id) continue;
    const match = rows.find(
      (row) =>
        row.rate_kind === kind &&
        row.subject_type === subject.type &&
        row.subject_id === subject.id &&
        row.effective_from <= atIso &&
        (row.effective_to == null || row.effective_to > atIso),
    );
    if (match) return match.amount;
  }
  return null;
}
