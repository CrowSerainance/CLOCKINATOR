import { useMemo, useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { addDays, formatDuration, startOfLocalDay, startOfLocalWeek } from "../domain/duration";
import { buildTimeSummaryPdf, downloadBlob } from "../domain/reports";
import { formatAmount as moneyFmt } from "../domain/money";
import { btn, card, fieldStyle, pagePad } from "../components/ui";
import { Modal, labelStyle } from "../components/Modal";
import type { InvoiceDetail, InvoiceListRow } from "../types";

type RangePreset = "week" | "last30" | "last90";

export function Invoices() {
  const store = useStore();
  useStoreRevision();
  const rows = store.listInvoices();
  const clients = store.listClients();
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Invoices</div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
            Draft from billable time for a client. PDF matches the summary-report export layout.
          </div>
        </div>
        <button onClick={() => setCreating(true)} style={btn(theme.accent, theme.accentInk)}>
          + New invoice
        </button>
      </div>

      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "100px 1.4fr 90px 100px 90px 100px 160px",
            gap: 12,
            padding: "12px 18px",
            fontSize: 11,
            fontWeight: 700,
            color: theme.textFaint,
            letterSpacing: ".06em",
            background: theme.surfaceAlt,
          }}
        >
          <span>NUMBER</span>
          <span>CLIENT</span>
          <span>STATUS</span>
          <span>ISSUED</span>
          <span>HOURS</span>
          <span>AMOUNT</span>
          <span />
        </div>
        {rows.map((row) => (
          <InvoiceRow
            key={row.id}
            row={row}
            onOpen={() => setDetail(store.getInvoice(row.id) ?? null)}
            onExport={() => exportInvoicePdf(store.getInvoice(row.id), store.workspaceName)}
            onStatus={(status) => store.setInvoiceStatus(row.id, status)}
          />
        ))}
        {rows.length === 0 && (
          <div style={{ padding: "28px 18px", color: theme.textMuted, fontSize: 13 }}>
            No invoices yet. Create a draft from billable time for a client.
          </div>
        )}
      </div>

      {creating && (
        <Modal title="New invoice" onClose={() => setCreating(false)}>
          <CreateInvoiceForm
            clients={clients}
            onCancel={() => setCreating(false)}
            onCreate={(input) => {
              const id = store.createInvoiceFromRange(input);
              setCreating(false);
              setDetail(store.getInvoice(id) ?? null);
            }}
          />
        </Modal>
      )}

      {detail && (
        <Modal title={`Invoice ${detail.number}`} onClose={() => setDetail(null)}>
          <InvoiceDetailPanel
            invoice={detail}
            workspaceName={store.workspaceName}
            onClose={() => setDetail(null)}
            onStatus={(status) => {
              store.setInvoiceStatus(detail.id, status);
              setDetail(store.getInvoice(detail.id) ?? null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function InvoiceRow({
  row,
  onOpen,
  onExport,
  onStatus,
}: {
  row: InvoiceListRow;
  onOpen: () => void;
  onExport: () => void;
  onStatus: (s: InvoiceListRow["status"]) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1.4fr 90px 100px 90px 100px 160px",
        gap: 12,
        padding: "12px 18px",
        borderTop: `1px solid ${theme.border}`,
        alignItems: "center",
        fontSize: 13,
      }}
    >
      <button onClick={onOpen} style={{ background: "none", border: "none", color: theme.text, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: 0 }}>
        {row.number}
      </button>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.client}</span>
      <span style={{ textTransform: "capitalize", color: theme.textMuted }}>{row.status}</span>
      <span className="mono" style={{ fontSize: 12 }}>{row.issueDate}</span>
      <span className="mono">{formatDuration(Math.round(row.hours * 3600))}</span>
      <span className="mono">${moneyFmt(row.amount)}</span>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onExport} style={btn(theme.surfaceAlt, theme.text, { padding: "6px 10px", fontSize: 12 })}>
          PDF
        </button>
        {row.status === "draft" && (
          <button onClick={() => onStatus("sent")} style={btn(theme.accent, theme.accentInk, { padding: "6px 10px", fontSize: 12 })}>
            Send
          </button>
        )}
        {row.status === "sent" && (
          <button onClick={() => onStatus("paid")} style={btn(theme.accent, theme.accentInk, { padding: "6px 10px", fontSize: 12 })}>
            Paid
          </button>
        )}
      </div>
    </div>
  );
}

function CreateInvoiceForm({
  clients,
  onCreate,
  onCancel,
}: {
  clients: Array<{ id: string; name: string }>;
  onCreate: (input: { clientId: string; from: Date; toExclusive: Date }) => void;
  onCancel: () => void;
}) {
  const store = useStore();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [preset, setPreset] = useState<RangePreset>("last30");
  const [error, setError] = useState("");
  const range = useMemo(() => rangeFor(preset), [preset]);
  const available = clientId ? store.countInvoiceableEntries(clientId, range.from, range.to) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label>
        <span style={labelStyle}>CLIENT</span>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...fieldStyle, width: "100%" }}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span style={labelStyle}>RANGE</span>
        <select value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)} style={{ ...fieldStyle, width: "100%" }}>
          <option value="week">This week</option>
          <option value="last30">Last 30 days</option>
          <option value="last90">Last 90 days</option>
        </select>
      </label>
      <div style={{ fontSize: 13, color: theme.textMuted }}>
        {available} billable entr{available === 1 ? "y" : "ies"} available (not yet invoiced).
      </div>
      {error && <div style={{ color: theme.danger, fontSize: 12 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onCancel} style={btn(theme.surfaceAlt, theme.text)}>
          Cancel
        </button>
        <button
          onClick={() => {
            try {
              setError("");
              onCreate({ clientId, from: range.from, toExclusive: range.to });
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
          style={btn(theme.accent, theme.accentInk)}
          disabled={!clientId || available === 0}
        >
          Create draft
        </button>
      </div>
    </div>
  );
}

function InvoiceDetailPanel({
  invoice,
  workspaceName,
  onClose,
  onStatus,
}: {
  invoice: InvoiceDetail;
  workspaceName: string;
  onClose: () => void;
  onStatus: (s: InvoiceListRow["status"]) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, color: theme.textMuted }}>
        {invoice.client} · {invoice.status} · ${moneyFmt(invoice.amount)} · {formatDuration(Math.round(invoice.hours * 3600))}
      </div>
      <div style={{ maxHeight: 280, overflowY: "auto", border: `1px solid ${theme.border}`, borderRadius: 10 }}>
        {invoice.lines.map((line) => (
          <div
            key={line.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 70px 80px",
              gap: 8,
              padding: "8px 12px",
              borderBottom: `1px solid ${theme.border}`,
              fontSize: 12,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.description}</span>
            <span className="mono">{line.quantityHours.toFixed(2)}h</span>
            <span className="mono">${moneyFmt(line.rate)}</span>
            <span className="mono">${moneyFmt(line.amount)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        {invoice.status === "draft" && (
          <button onClick={() => onStatus("sent")} style={btn(theme.surfaceAlt, theme.text)}>
            Mark sent
          </button>
        )}
        {(invoice.status === "draft" || invoice.status === "sent") && (
          <button onClick={() => onStatus("paid")} style={btn(theme.surfaceAlt, theme.text)}>
            Mark paid
          </button>
        )}
        <button onClick={onClose} style={btn(theme.surfaceAlt, theme.text)}>
          Close
        </button>
        <button onClick={() => exportInvoicePdf(invoice, workspaceName)} style={btn(theme.accent, theme.accentInk)}>
          Export PDF
        </button>
      </div>
    </div>
  );
}

function exportInvoicePdf(invoice: InvoiceDetail | undefined | null, workspaceName: string): void {
  if (!invoice) return;
  const byProject = new Map<string, { seconds: number; amount: number }>();
  const byDescription = new Map<string, { seconds: number; amount: number }>();
  const nested = new Map<string, { seconds: number; children: Map<string, { seconds: number; amount: number }> }>();

  for (const line of invoice.lines) {
    const parts = line.description.split(" — ");
    const project = line.project ?? parts[0] ?? "No project";
    const description = parts.length > 1 ? parts.slice(1).join(" — ") : line.description;
    const seconds = Math.round(line.quantityHours * 3600);

    const p = byProject.get(project) ?? { seconds: 0, amount: 0 };
    p.seconds += seconds;
    p.amount += line.amount;
    byProject.set(project, p);

    const d = byDescription.get(description) ?? { seconds: 0, amount: 0 };
    d.seconds += seconds;
    d.amount += line.amount;
    byDescription.set(description, d);

    const n = nested.get(project) ?? { seconds: 0, children: new Map() };
    n.seconds += seconds;
    const child = n.children.get(description) ?? { seconds: 0, amount: 0 };
    child.seconds += seconds;
    child.amount += line.amount;
    n.children.set(description, child);
    nested.set(project, n);
  }

  const from = invoice.rangeFrom ? new Date(invoice.rangeFrom) : new Date(invoice.issueDate);
  const toExclusive = invoice.rangeTo ? addDays(startOfLocalDay(new Date(invoice.rangeTo)), 1) : addDays(startOfLocalDay(from), 1);

  const blob = buildTimeSummaryPdf({
    title: `Invoice ${invoice.number}`,
    from,
    toExclusive,
    totalSeconds: Math.round(invoice.hours * 3600),
    subtitle: `Client: ${invoice.client} · Amount: $${moneyFmt(invoice.amount)} · Status: ${invoice.status}`,
    byProject: [...byProject.entries()]
      .map(([title, v]) => ({ title, seconds: v.seconds, amount: `$${moneyFmt(v.amount)}` }))
      .sort((a, b) => b.seconds - a.seconds),
    byDescription: [...byDescription.entries()]
      .map(([title, v]) => ({ title, seconds: v.seconds, amount: `$${moneyFmt(v.amount)}` }))
      .sort((a, b) => b.seconds - a.seconds),
    nested: [...nested.entries()]
      .map(([project, v]) => ({
        project,
        seconds: v.seconds,
        children: [...v.children.entries()]
          .map(([title, c]) => ({ title, seconds: c.seconds, amount: `$${moneyFmt(c.amount)}` }))
          .sort((a, b) => b.seconds - a.seconds),
      }))
      .sort((a, b) => b.seconds - a.seconds),
    workspaceName,
  });

  downloadBlob(`clockinator-${invoice.number.toLowerCase()}.pdf`, blob);
}

function rangeFor(preset: RangePreset): { from: Date; to: Date } {
  const now = new Date();
  const to = addDays(startOfLocalDay(now), 1);
  if (preset === "week") {
    const from = startOfLocalWeek(now);
    return { from, to: addDays(from, 7) };
  }
  if (preset === "last90") {
    return { from: addDays(startOfLocalDay(now), -89), to };
  }
  return { from: addDays(startOfLocalDay(now), -29), to };
}
