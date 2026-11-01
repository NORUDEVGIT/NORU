import { useEffect, useRef, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

/* ------------------------------------------------------------------ */
/* Export to PDF by date.                                              */
/* The "More" menu opens ExportPdfDialog, the user picks Today,        */
/* Last 7 days or a Custom range, and the chosen range is sent to      */
/* whichever directory is on screen (via a window event). That         */
/* directory filters its rows by the date a profile was created.       */
/* ------------------------------------------------------------------ */

export const EXPORT_PDF_EVENT = "guest-directory:export-pdf";

export type ExportPreset = "today" | "last7" | "custom" | "all";

export type ExportRange = {
  preset: ExportPreset;
  /** First day included, as YYYY-MM-DD. null = no lower limit. */
  from: string | null;
  /** Last day included, as YYYY-MM-DD. null = no upper limit. */
  to: string | null;
  /** Text shown in the PDF header. */
  label: string;
};

export const EXPORT_ALL: ExportRange = {
  preset: "all",
  from: null,
  to: null,
  label: "All dates",
};

export type ExportRow = {
  profileNo: string;
  name: string;
  type: string;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  nationality?: string | null | undefined;
  vip: boolean;
  status: string;
  /** Date the profile was created (ISO string or YYYY-MM-DD). */
  createdAt?: string | null | undefined;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local calendar day as YYYY-MM-DD. */
function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Turns the dialog choice into a concrete date range. */
export function resolveExportRange(
  preset: ExportPreset,
  customFrom = "",
  customTo = "",
): ExportRange {
  const today = new Date();

  if (preset === "today") {
    const key = toDateKey(today);
    return { preset, from: key, to: key, label: `Today (${formatKey(key)})` };
  }

  if (preset === "last7") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    const from = toDateKey(start);
    const to = toDateKey(today);
    return {
      preset,
      from,
      to,
      label: `Last 7 days (${formatKey(from)} – ${formatKey(to)})`,
    };
  }

  if (preset === "custom") {
    return {
      preset,
      from: customFrom || null,
      to: customTo || null,
      label: `${customFrom ? formatKey(customFrom) : "Start"} – ${
        customTo ? formatKey(customTo) : "Today"
      }`,
    };
  }

  return EXPORT_ALL;
}

/** Reads a record's created date without depending on the exact row type. */
export function createdAtOf(record: unknown): string | null {
  const value = (record as { createdAt?: unknown } | null)?.createdAt;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

/** True when the date falls inside the range. No range = everything. */
export function inExportRange(
  value: string | null | undefined,
  range: ExportRange,
): boolean {
  if (range.from === null && range.to === null) return true;
  if (!value) return false;

  let key: string;
  if (DATE_ONLY.test(value)) {
    key = value;
  } else {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return false;
    key = toDateKey(parsed);
  }

  return (!range.from || key >= range.from) && (!range.to || key <= range.to);
}

/** Subscribe a directory to the "Export to PDF" action of the More menu. */
export function useGuestExportPdf(handler: (range: ExportRange) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onExport = (event: Event) => {
      const range =
        (event as CustomEvent<{ range?: ExportRange }>).detail?.range ??
        EXPORT_ALL;
      handlerRef.current(range);
    };
    window.addEventListener(EXPORT_PDF_EVENT, onExport);
    return () => window.removeEventListener(EXPORT_PDF_EVENT, onExport);
  }, []);
}

/** Opens a print view of the rows; choose "Save as PDF" in the print dialog. */
export function exportProfilesToPdf({
  title,
  restaurantName,
  rangeLabel,
  rows,
}: {
  title: string;
  restaurantName: string;
  rangeLabel?: string;
  rows: ExportRow[];
}) {
  const printWindow = window.open("", "_blank", "width=1000,height=700");

  if (!printWindow) {
    window.alert("Please allow pop-ups to export the list as PDF.");
    return;
  }

  const escapeHtml = (value: unknown) =>
    String(value ?? "—")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const formatCreated = (value: string | null | undefined) => {
    if (!value) return "—";
    if (DATE_ONLY.test(value)) return formatKey(value);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? "—"
      : parsed.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
  };

  const body = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.profileNo)}</td>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.type)}</td>
          <td>${escapeHtml(row.phone)}</td>
          <td>${escapeHtml(row.email)}</td>
          <td>${escapeHtml(row.nationality)}</td>
          <td>${row.vip ? "VIP" : "—"}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(formatCreated(row.createdAt))}</td>
        </tr>`,
    )
    .join("");

  const period = rangeLabel
    ? ` · Created: ${escapeHtml(rangeLabel)}`
    : "";

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)} - ${escapeHtml(restaurantName)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #2b1a10; padding: 24px; }
          h1 { margin: 0 0 6px; color: #4a2c1a; font-size: 22px; }
          .meta { margin: 0 0 20px; color: #666; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #4a2c1a; color: #fff; text-align: left; }
          th, td { border: 1px solid #d9c8a4; padding: 8px; }
          tbody tr:nth-child(even) { background: #f7f7f7; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">${escapeHtml(restaurantName)}${period} · Exported ${escapeHtml(new Date().toLocaleString())} · ${rows.length} records</p>
        <table>
          <thead><tr><th>Profile No.</th><th>Name</th><th>Type</th><th>Phone</th><th>Email</th><th>Nationality</th><th>VIP</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>${body || '<tr><td colspan="9">No profiles were created in this period.</td></tr>'}</tbody>
        </table>
        <script>window.onload = () => { window.focus(); window.print(); };</script>
      </body>
    </html>`);
  printWindow.document.close();
}

const PRESET_OPTIONS: { value: ExportPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 days" },
  { value: "custom", label: "Custom" },
  { value: "all", label: "All dates" },
];

/** Asks which period to export, then calls onExport with the chosen range. */
export function ExportPdfDialog({
  open,
  onOpenChange,
  onExport,
  title = "Export to PDF",
  description = "Choose the period. Only profiles created in that period are exported.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (range: ExportRange) => void;
  /** Dialog heading. Defaults to "Export to PDF". */
  title?: string;
  /** Explains which date the period applies to on the page using the dialog. */
  description?: string;
}) {
  const [preset, setPreset] = useState<ExportPreset>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const customInvalid =
    preset === "custom" && (!from || !to || from > to);

  const error =
    preset === "custom" && from && to && from > to
      ? "The start date must be on or before the end date."
      : null;

  function confirm() {
    if (customInvalid) return;
    onExport(resolveExportRange(preset, from, to));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="guest-export-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Export period"
        >
          {PRESET_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={preset === option.value}
              onClick={() => setPreset(option.value)}
              className={cn(
                "h-9 rounded-full border px-4 text-sm font-semibold transition-colors",
                preset === option.value
                  ? "border-[#c9a24a] bg-[#f5ead0] text-[#4a2c1a]"
                  : "border-[#e9dfd0] bg-white text-[#7A6B58] hover:bg-[#faf7f1]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {preset === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs font-semibold text-[#4a2c1a]">
              From
              <Input
                type="date"
                className="h-9"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
                aria-label="Export from date"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#4a2c1a]">
              To
              <Input
                type="date"
                className="h-9"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                aria-label="Export to date"
              />
            </label>
          </div>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#c9a24a] font-bold text-[#2b1a10] hover:bg-[#c9a24a]/90"
            disabled={customInvalid}
            onClick={confirm}
            data-testid="guest-export-confirm"
          >
            Export PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}