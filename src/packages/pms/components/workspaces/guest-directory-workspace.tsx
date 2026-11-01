import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarPlus,
  ChevronDown,
  Download,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestMergeDialog } from "@/packages/pms/components/guests/guest-merge-dialog";
import { GuestRestrictionBadges } from "@/packages/pms/components/guests/guest-bits";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";
import { companyDirectorySecondary } from "@/packages/pms/lib/guest-profile-company";
import { taDirectorySecondary } from "@/packages/pms/lib/guest-profile-travel-agency";
import { accountListItems, type GuestAccountType } from "@/packages/pms/lib/guest-profile-wave4";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
import {
  DUPLICATE_PREVENTION_TIP,
  LAST_STAY_PRESET_LABELS,
  LAST_STAY_PRESETS,
  LISTING_DEFAULT_PAGE_SIZE,
  LISTING_PAGE_SIZES,
  displayProfileNumber,
  invalidateGuestWorkspaceQueries,
  type GuestListSort,
  type LastStayPreset,
} from "@/packages/pms/lib/guest-profile-listing";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  createGuest,
  getGuestsAccess,
  listGuests,
  setGuestStatus,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
import { cn } from "@/shared/lib/utils";
import {
  EXPORT_PDF_EVENT,
  ExportPdfDialog,
  createdAtOf,
  exportProfilesToPdf,
  inExportRange,
  useGuestExportPdf,
  type ExportRange,
} from "@/packages/pms/components/guests/guest-export-pdf";

// Pages that still import these from this file keep working.
// New pages should import them straight from guest-export-pdf.
export {
  exportProfilesToPdf,
  useGuestExportPdf,
  type ExportRow,
} from "@/packages/pms/components/guests/guest-export-pdf";

const ALL = "all";
const VIP_ONLY = "vip";

/** Gold-outlined pill used by the search box and Filter button. */
export const PILL =
  "h-9 rounded-full border-[#c9a24a] bg-white text-sm font-medium";

/**
 * Individual and Travel agent rows are white.
 * Company and Group rows use a subtle grey background.
 */
export function guestRowClass(type?: string): string {
  return type === "company" || type === "group"
    ? "bg-[#fbfbfb] hover:bg-[#f1f1f1]"
    : "bg-white hover:bg-[#faf7f1]";
}

/* ------------------------------------------------------------------ */
/* Shared row action menu for guest, company, travel agency and group. */
/* ------------------------------------------------------------------ */

export type GuestRowKind = "guest" | "company" | "travel-agency" | "group";
type LinkTarget = GuestRowKind;

const KIND_CONFIG: Record<
  GuestRowKind,
  {
    section: "guests" | "companies" | "travel-agencies" | "groups";
    viewLabel: string;
    editLabel: string;
    reservationLabel: string;
    toggleLabels: { deactivate: string; activate: string };
    quickViewHeading: boolean;
    linkTargets: LinkTarget[];
  }
> = {
  guest: {
    section: "guests",
    viewLabel: "View Profile",
    editLabel: "Edit Guest",
    reservationLabel: "New Reservation",
    toggleLabels: {
      deactivate: "Deactivate",
      activate: "Activate",
    },
    quickViewHeading: false,
    linkTargets: [],
  },
  company: {
    section: "companies",
    viewLabel: "View Profile",
    editLabel: "Edit Company",
    reservationLabel: "New Reservation",
    toggleLabels: {
      deactivate: "Deactivate Account",
      activate: "Activate Account",
    },
    quickViewHeading: true,
    linkTargets: ["guest"],
  },
  "travel-agency": {
    section: "travel-agencies",
    viewLabel: "View Profile",
    editLabel: "Edit Travel Agency",
    reservationLabel: "New Booking",
    toggleLabels: {
      deactivate: "Deactivate Account",
      activate: "Activate Account",
    },
    quickViewHeading: true,
    linkTargets: [],
  },
  group: {
    section: "groups",
    viewLabel: "View Profile",
    editLabel: "Edit Group",
    reservationLabel: "Add Reservation",
    toggleLabels: {
      deactivate: "Deactivate Account",
      activate: "Activate Account",
    },
    quickViewHeading: false,
    linkTargets: [],
  },
};

const LINK_LABELS: Record<LinkTarget, string> = {
  guest: "Link Guest",
  company: "Link Company",
  "travel-agency": "Link Travel Agency",
  group: "Link Group",
};

const MENU_ITEM = "gap-3 rounded-lg px-3 py-2 text-sm font-medium";
const MENU_ICON = "size-4 text-foreground/80";

const IMPORT_GUESTS_EVENT = "guest-directory:import-guests";

/* ------------------------------------------------------------------ */
/* Import Guests: CSV file -> preview -> create guests one by one.     */
/* ------------------------------------------------------------------ */

type ImportRow = {
  line: number;
  fullName: string;
  phone: string;
  email: string;
  nationality: string;
  vip: boolean;
  error?: string;
};

type ParsedImport = { rows: ImportRow[]; fatal?: string };

const IMPORT_HEADER_ALIASES: Record<string, string[]> = {
  fullName: ["full name", "fullname", "name", "guest name", "guest"],
  phone: ["phone", "phone number", "mobile", "tel", "telephone"],
  email: ["email", "e-mail", "email address"],
  nationality: ["nationality", "country"],
  vip: ["vip", "vip status"],
};

const IMPORT_MAX_ROWS = 500;

/** Small CSV parser: handles quoted fields, escaped quotes and CRLF. */
function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function parseGuestImport(text: string): ParsedImport {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { rows: [], fatal: "The file has no guest rows. Add a header row and at least one guest." };
  }

  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const col = (key: string) =>
    header.findIndex((h) => IMPORT_HEADER_ALIASES[key]!.includes(h));
  const idx = {
    fullName: col("fullName"),
    phone: col("phone"),
    email: col("email"),
    nationality: col("nationality"),
    vip: col("vip"),
  };

  if (idx.fullName === -1) {
    return { rows: [], fatal: 'Could not find a "Full Name" or "Name" column in the header row.' };
  }
  if (table.length - 1 > IMPORT_MAX_ROWS) {
    return { rows: [], fatal: `This file has more than ${IMPORT_MAX_ROWS} guests. Split it into smaller files.` };
  }

  const get = (cells: string[], i: number) => (i === -1 ? "" : (cells[i] ?? "").trim());
  const seenEmails = new Set<string>();

  const rows = table.slice(1).map((cells, n): ImportRow => {
    const fullName = get(cells, idx.fullName);
    const phone = get(cells, idx.phone);
    const email = get(cells, idx.email);
    const nationality = get(cells, idx.nationality);
    const vip = /^(1|true|yes|y|vip)$/i.test(get(cells, idx.vip));
    const row: ImportRow = { line: n + 2, fullName, phone, email, nationality, vip };

    if (!fullName) row.error = "Name is required";
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) row.error = "Invalid email";
    else if (email && seenEmails.has(email.toLowerCase())) row.error = "Duplicate email in this file";

    if (email) seenEmails.add(email.toLowerCase());
    return row;
  });

  return { rows };
}

function downloadImportTemplate() {
  const csv =
    "Full Name,Phone,Email,Nationality,VIP\nJane Doe,+251911000000,jane@example.com,Ethiopian,no\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "guest-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** Subscribe a directory to the file picked in More > Import Guests. */
export function useGuestImportFile(handler: (file: File) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onImport = (event: Event) => {
      const file = (event as CustomEvent<{ file?: File }>).detail?.file;
      if (file) handlerRef.current(file);
    };
    window.addEventListener(IMPORT_GUESTS_EVENT, onImport);
    return () => window.removeEventListener(IMPORT_GUESTS_EVENT, onImport);
  }, []);
}

/** Preview and run a guest import. Open it by passing the chosen CSV `file`. */
export function GuestImportDialog({
  restaurantId,
  file,
  onClose,
}: {
  restaurantId: string;
  file: File | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const createGuestFn = useServerFn(createGuest);

  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [phase, setPhase] = useState<"preview" | "importing" | "done">("preview");
  const [progress, setProgress] = useState(0);
  const [created, setCreated] = useState(0);
  const [failures, setFailures] = useState<{ line: number; name: string; message: string }[]>([]);

  useEffect(() => {
    setParsed(null);
    setPhase("preview");
    setProgress(0);
    setCreated(0);
    setFailures([]);
    if (!file) return;
    let cancelled = false;
    void file
      .text()
      .then((text) => {
        if (!cancelled) setParsed(parseGuestImport(text));
      })
      .catch(() => {
        if (!cancelled) setParsed({ rows: [], fatal: "Could not read this file." });
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const validRows = parsed?.rows.filter((row) => !row.error) ?? [];
  const invalidCount = (parsed?.rows.length ?? 0) - validRows.length;

  async function runImport() {
    setPhase("importing");
    setProgress(0);
    let ok = 0;
    const failed: { line: number; name: string; message: string }[] = [];

    for (const [i, row] of validRows.entries()) {
      try {
        // Field names below must match what createGuest expects.
        await createGuestFn({
          data: {
            restaurantId,
            fullName: row.fullName,
            phone: row.phone || undefined,
            email: row.email || undefined,
            nationality: row.nationality || undefined,
            vipStatus: row.vip,
          } as never,
        });
        ok++;
      } catch (error) {
        failed.push({
          line: row.line,
          name: row.fullName,
          message: error instanceof Error ? error.message : "Could not create this guest",
        });
      }
      setProgress(i + 1);
    }

    setCreated(ok);
    setFailures(failed);
    setPhase("done");
    invalidateGuestWorkspaceQueries(queryClient, restaurantId);
    void queryClient.invalidateQueries({ queryKey: ["guests"] });
    void queryClient.invalidateQueries({ queryKey: ["guest-directory-stats"] });
  }

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open && phase !== "importing") onClose();
      }}
    >
      <DialogContent className="max-w-2xl" data-testid="guest-import-dialog">
        <DialogHeader>
          <DialogTitle>Import guests</DialogTitle>
          <DialogDescription>
            {file?.name ?? "CSV file"} · columns: Full Name, Phone, Email, Nationality, VIP
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <p className="text-sm text-muted-foreground">Reading file…</p>
        ) : parsed.fatal ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{parsed.fatal}</p>
            <Button type="button" variant="outline" onClick={downloadImportTemplate}>
              Download template
            </Button>
          </div>
        ) : phase === "done" ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">
              {created} guest{created === 1 ? "" : "s"} imported
              {failures.length > 0 ? `, ${failures.length} failed` : ""}.
            </p>
            {failures.length > 0 ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-3 text-xs">
                {failures.map((f) => (
                  <li key={f.line}>
                    Line {f.line} ({f.name}): <span className="text-destructive">{f.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-semibold">{validRows.length}</span> ready to import
              {invalidCount > 0 ? (
                <>
                  , <span className="font-semibold text-destructive">{invalidCount}</span> with
                  problems (skipped)
                </>
              ) : null}
              .
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-[#fbfbfb] text-left uppercase tracking-wide text-[#4a2c1a]">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 50).map((row) => (
                    <tr key={row.line} className="border-t border-border">
                      <td className="px-3 py-1.5">{row.line}</td>
                      <td className="px-3 py-1.5">{row.fullName || "—"}</td>
                      <td className="px-3 py-1.5">{row.phone || "—"}</td>
                      <td className="px-3 py-1.5">{row.email || "—"}</td>
                      <td
                        className={cn(
                          "px-3 py-1.5 font-semibold",
                          row.error ? "text-destructive" : "text-emerald-700",
                        )}
                      >
                        {row.error ?? "OK"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > 50 ? (
              <p className="text-xs text-muted-foreground">
                Showing the first 50 of {parsed.rows.length} rows.
              </p>
            ) : null}
            {phase === "importing" ? (
              <p className="text-sm text-muted-foreground">
                Importing {progress} of {validRows.length}…
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2">
          {phase === "done" || parsed?.fatal ? (
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={downloadImportTemplate}
                disabled={phase === "importing"}
              >
                Download template
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={phase === "importing"}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-[#c9a24a] font-bold text-[#2b1a10] hover:bg-[#c9a24a]/90"
                disabled={!parsed || validRows.length === 0 || phase === "importing"}
                onClick={() => void runImport()}
                data-testid="guest-import-confirm"
              >
                Import {validRows.length} guest{validRows.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/**
 * "More" dropdown, rendered right after the New Guest button.
 * Items: Export to PDF, Refresh, Import Guests.
 *
 * Export to PDF opens a dialog to pick Today, Last 7 days, Custom or All dates,
 * then hands the chosen range to `onExportPdf`. Without that prop it fires a
 * "guest-directory:export-pdf" window event (detail: { range }) that every
 * directory listens to through useGuestExportPdf.
 *
 * Import Guests lets the user pick a CSV file and hands it to `onImportGuests`.
 * Without that prop it fires a "guest-directory:import-guests" window event
 * (detail: { file }) so the page that owns the import logic can listen for it.
 */
export function GuestListingMoreMenu({
  onExportPdf,
  onImportGuests,
}: {
  onExportPdf?: (range: ExportRange) => void;
  onImportGuests?: (file: File) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["guests"] });
    void queryClient.invalidateQueries({ queryKey: ["guest-accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["guest"] });
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (onImportGuests) onImportGuests(file);
    else window.dispatchEvent(new CustomEvent(IMPORT_GUESTS_EVENT, { detail: { file } }));
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="font-bold" data-testid="guest-more-menu">
            More
            <ChevronDown className="ml-2 size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="border-transparent bg-white shadow-[0_8px_28px_rgba(74,44,26,0.18)]"
        >
          <DropdownMenuItem
            className={MENU_ITEM}
            data-testid="guest-export-pdf"
            onSelect={() => setExportOpen(true)}
          >
            <Download className={MENU_ICON} />
            Export to PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            className={MENU_ITEM}
            data-testid="guest-refresh"
            onSelect={refresh}
          >
            <RefreshCw className={MENU_ICON} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem
            className={MENU_ITEM}
            data-testid="guest-import"
            onSelect={() => fileInputRef.current?.click()}
          >
            <Upload className={MENU_ICON} />
            Import Guests
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        data-testid="guest-import-file"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <ExportPdfDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        onExport={(range) => {
          if (onExportPdf) onExportPdf(range);
          else
            window.dispatchEvent(
              new CustomEvent(EXPORT_PDF_EVENT, { detail: { range } }),
            );
        }}
      />
    </>
  );
}

/** Convert directory row kinds to the profile types expected by the detail route. */
function getProfileType(kind: GuestRowKind): GuestProfileTypeId {
  switch (kind) {
    case "guest":
      return "individual";
    case "company":
      return "company";
    case "travel-agency":
      return "travel-agent";
    case "group":
      return "group";
  }
}

export function GuestRowActions({
  kind,
  id,
  label,
  active = true,
  onNewReservation,
  onToggleActive,
}: {
  kind: GuestRowKind;
  id: string;
  label?: string;
  active?: boolean;
  onNewReservation?: () => void;
  onToggleActive?: () => void;
}) {
  const navigate = useNavigate();
  const cfg = KIND_CONFIG[kind];
  const profileType = getProfileType(kind);

  function go(extra: { tab: string; card?: string; target?: string }) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: {
        ...guestProfileSearch({
          type: profileType,
          ...(extra.card
            ? { card: extra.card as GuestProfileCardId }
            : {}),
        }),
        nav: extra.tab,
        type: profileType,
        section: cfg.section,
        ...(extra.target ? { target: extra.target } : {}),
      } as never,
    });
  }

  function newReservation() {
    if (onNewReservation) {
      onNewReservation();
      return;
    }

    void navigate({ to: "/restaurant/bookings/new" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          className="size-8 rounded-lg"
          aria-label={label ? `Actions for ${label}` : "Row actions"}
          data-testid={`row-actions-${kind}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="min-w-[210px] rounded-2xl border-[#e9dfd0] bg-white p-1.5 text-left shadow-[0_8px_24px_rgba(74,44,26,0.15)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {cfg.quickViewHeading ? (
          <div className="px-3 pb-1 pt-2 text-sm font-semibold">
            Quick View
          </div>
        ) : null}

        <DropdownMenuItem
          className={MENU_ITEM}
          onSelect={() => go({ tab: "dashboard", card: "dashboard" })}
        >
          <ExternalLink className={MENU_ICON} />
          {cfg.viewLabel}
        </DropdownMenuItem>

        <DropdownMenuItem className={MENU_ITEM} onSelect={newReservation}>
          <CalendarPlus className={MENU_ICON} />
          {cfg.reservationLabel}
        </DropdownMenuItem>

        {/* Link Guest is available only for Company profiles. */}
        {cfg.linkTargets.map((target) => (
          <DropdownMenuItem
            key={target}
            className={MENU_ITEM}
            onSelect={() => go({ tab: "link", target })}
          >
            <Link2 className={MENU_ICON} />
            {LINK_LABELS[target]}
          </DropdownMenuItem>
        ))}

        {onToggleActive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={cn(
                MENU_ITEM,
                active
                  ? "text-destructive focus:text-destructive"
                  : "text-emerald-700 focus:text-emerald-700",
              )}
              onSelect={onToggleActive}
            >
              {active
                ? cfg.toggleLabels.deactivate
                : cfg.toggleLabels.activate}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type FilterDraft = {
  status: string;
  vip: boolean;
  nationality: string;
  lastStay: LastStayPreset;
  sort: GuestListSort;
};

const DEFAULT_DRAFT: FilterDraft = {
  status: ALL,
  vip: false,
  nationality: "",
  lastStay: "all",
  sort: "updated_at",
};

export function GuestDirectoryWorkspace({
  membership,
  compact = false,
  returnCard,
  search,
  onSearchChange,
}: {
  membership: RestaurantMembership;
  compact?: boolean;
  returnCard?: GuestProfileCardId | undefined;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchParams?: unknown;
  canCreate?: boolean;
  isTypeInactive?: boolean;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { date } = useRestaurantTime();

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchGuests = useServerFn(listGuests);
  const changeStatus = useServerFn(setGuestStatus);

  const [localSearch, setLocalSearch] = useState("");
  const searchValue = search ?? localSearch;
  const setSearch = onSearchChange ?? setLocalSearch;

  const [status, setStatus] = useState<string>(ALL);
  const [vip, setVip] = useState<string>(ALL);
  const [nationality, setNationality] = useState("");
  const [lastStay, setLastStay] = useState<LastStayPreset>("all");
  const [sort, setSort] = useState<GuestListSort>("updated_at");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<
    (typeof LISTING_PAGE_SIZES)[number]
  >(LISTING_DEFAULT_PAGE_SIZE);

  const [formOpen, setFormOpen] = useState(false);
  const [editGuest, setEditGuest] = useState<GuestProfile | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSurvivorId] = useState<string | undefined>();
  const [knownNationalities, setKnownNationalities] = useState<string[]>([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<FilterDraft>(DEFAULT_DRAFT);
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  useEffect(() => {
    setPage(0);
  }, [searchValue]);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  const canManage = accessQuery.data?.canManage ?? false;
  const offset = page * pageSize;
  const vipOnly = vip === VIP_ONLY;

  const guestsQuery = useQuery({
    queryKey: [
      "guests",
      restaurantId,
      searchValue,
      status,
      vipOnly,
      nationality,
      lastStay,
      sort,
      offset,
      pageSize,
    ],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          offset,
          limit: pageSize,
          sort,
          lastStay,
          ...(searchValue.trim()
            ? { search: searchValue.trim() }
            : {}),
          ...(status !== ALL
            ? { status: status as "active" | "inactive" }
            : {}),
          ...(vipOnly ? { vipOnly: true } : {}),
          ...(nationality.trim()
            ? { nationality: nationality.trim() }
            : {}),
        },
      }),
    enabled: canManage,
  });

  const pageData = guestsQuery.data;
  const guests = pageData?.items ?? [];

  // "More > Import Guests" hands the chosen CSV file to the import dialog below.
  const [importFile, setImportFile] = useState<File | null>(null);
  useGuestImportFile(setImportFile);

  // "More > Export to PDF" exports the guests on this page created in the chosen period.
  useGuestExportPdf((range) =>
    exportProfilesToPdf({
      title: "Guest Profiles",
      restaurantName: membership.restaurant.name,
      rangeLabel: range.label,
      rows: guests
        .filter((g) => inExportRange(createdAtOf(g), range))
        .map((g) => ({
          profileNo: displayProfileNumber(g.id, g.profileNumber),
          name: g.fullName,
          type: "Guest",
          phone: g.phone,
          email: g.email,
          nationality: g.nationality,
          vip: Boolean(g.vipStatus),
          status: g.guestStatus,
          createdAt: createdAtOf(g),
        })),
    }),
  );

  useEffect(() => {
    if (guests.length === 0) return;

    setKnownNationalities((prev) => {
      const next = new Set(prev);
      for (const guest of guests) {
        if (guest.nationality) next.add(guest.nationality);
      }
      return next.size === prev.length ? prev : [...next].sort();
    });
  }, [guests]);

  function openGuest(id: string) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: guestProfileSearch({
        card: returnCard,
        type: "individual",
      }),
    });
  }

  function refresh() {
    invalidateGuestWorkspaceQueries(queryClient, restaurantId);
    void queryClient.invalidateQueries({
      queryKey: ["guest", restaurantId],
    });
  }

  const statusMutation = useMutation({
    mutationFn: (input: {
      guestId: string;
      status: "active" | "inactive";
    }) => changeStatus({ data: { restaurantId, ...input } }),
    onSuccess: refresh,
  });

  function patchDraft(patch: Partial<FilterDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function toggleGroup(id: string) {
    setOpenGroups((current) =>
      current.includes(id)
        ? current.filter((g) => g !== id)
        : [...current, id],
    );
  }

  function applyFilters(next: FilterDraft) {
    setStatus(next.status);
    setVip(next.vip ? VIP_ONLY : ALL);
    setNationality(next.nationality);
    setLastStay(next.lastStay);
    setSort(next.sort);
    setPage(0);
    setFilterOpen(false);
  }

  function handleFilterOpenChange(open: boolean) {
    setFilterOpen(open);
    if (open) {
      setDraft({
        status,
        vip: vipOnly,
        nationality,
        lastStay,
        sort,
      });
    }
  }

  if (accessQuery.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading guests…
      </p>
    );
  }

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Guest Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners, managers and receptionists can access guest profiles
          for this property.
        </p>
      </div>
    );
  }

  const total = pageData?.total ?? 0;
  const lastStayAvailable = pageData?.lastStayAvailable ?? true;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const nationalityOptions =
    nationality && !knownNationalities.includes(nationality)
      ? [...knownNationalities, nationality].sort()
      : knownNationalities;

  const chips: {
    key: string;
    label: string;
    clear: () => void;
  }[] = [];

  if (status !== ALL) {
    chips.push({
      key: "status",
      label: `Status: ${status === "active" ? "Active" : "Inactive"}`,
      clear: () => {
        setStatus(ALL);
        setPage(0);
      },
    });
  }

  if (vipOnly) {
    chips.push({
      key: "vip",
      label: "VIP only",
      clear: () => {
        setVip(ALL);
        setPage(0);
      },
    });
  }

  if (lastStay !== "all") {
    chips.push({
      key: "last-stay",
      label: `Last stay: ${LAST_STAY_PRESET_LABELS[lastStay]}`,
      clear: () => {
        setLastStay("all");
        setPage(0);
      },
    });
  }

  if (nationality) {
    chips.push({
      key: "nationality",
      label: `Nationality: ${nationality}`,
      clear: () => {
        setNationality("");
        setPage(0);
      },
    });
  }

  const draftCounts = {
    status: draft.status !== ALL ? 1 : 0,
    vip: draft.vip ? 1 : 0,
    lastStay: draft.lastStay !== "all" ? 1 : 0,
    nationality: draft.nationality ? 1 : 0,
  };

  return (
    <div className="space-y-4" data-testid="guest-profile-directory">
      {compact ? null : (
        <div>
          <h1 className="font-display text-2xl">Guest Profiles</h1>
          <p className="text-sm text-muted-foreground">
            Search, manage and open guest profiles for{" "}
            {membership.restaurant.name}.
          </p>
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-3"
        data-testid="guest-directory-filters"
      >
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#c9a24a]" />
          <Input
            className={cn(PILL, "w-full pl-10")}
            placeholder="Search by name, phone, email or profile no."
            value={searchValue}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            data-testid="guest-listing-search"
          />
        </div>

        <MoreFiltersMenu
          open={filterOpen}
          onOpenChange={handleFilterOpenChange}
          activeCount={chips.length}
          onApply={() => applyFilters(draft)}
          onClear={() => applyFilters(DEFAULT_DRAFT)}
        >
          <FilterGroup
            id="status"
            title="Status"
            count={draftCounts.status}
            open={openGroups.includes("status")}
            onToggle={toggleGroup}
          >
            <FilterOption
              type="radio"
              name="guest-filter-status"
              label="All statuses"
              checked={draft.status === ALL}
              onChange={() => patchDraft({ status: ALL })}
            />
            <FilterOption
              type="radio"
              name="guest-filter-status"
              label="Active"
              checked={draft.status === "active"}
              onChange={() => patchDraft({ status: "active" })}
            />
            <FilterOption
              type="radio"
              name="guest-filter-status"
              label="Inactive"
              checked={draft.status === "inactive"}
              onChange={() => patchDraft({ status: "inactive" })}
            />
          </FilterGroup>

          <FilterGroup
            id="vip"
            title="VIP"
            count={draftCounts.vip}
            open={openGroups.includes("vip")}
            onToggle={toggleGroup}
          >
            <FilterOption
              type="checkbox"
              name="guest-filter-vip"
              label="VIP guests only"
              checked={draft.vip}
              onChange={(checked) => patchDraft({ vip: checked })}
            />
          </FilterGroup>

          <FilterGroup
            id="last-stay"
            title="Last stay"
            count={draftCounts.lastStay}
            open={openGroups.includes("last-stay")}
            onToggle={toggleGroup}
          >
            {LAST_STAY_PRESETS.map((preset) => (
              <FilterOption
                key={preset}
                type="radio"
                name="guest-filter-last-stay"
                label={
                  preset === "all"
                    ? "Any last stay"
                    : LAST_STAY_PRESET_LABELS[preset]
                }
                checked={draft.lastStay === preset}
                disabled={!lastStayAvailable}
                onChange={() => patchDraft({ lastStay: preset })}
              />
            ))}
          </FilterGroup>

          <FilterGroup
            id="nationality"
            title="Nationality"
            count={draftCounts.nationality}
            open={openGroups.includes("nationality")}
            onToggle={toggleGroup}
          >
            <FilterOption
              type="radio"
              name="guest-filter-nationality"
              label="All nationalities"
              checked={draft.nationality === ""}
              onChange={() => patchDraft({ nationality: "" })}
            />
            {nationalityOptions.map((value) => (
              <FilterOption
                key={value}
                type="radio"
                name="guest-filter-nationality"
                label={value}
                checked={draft.nationality === value}
                onChange={() => patchDraft({ nationality: value })}
              />
            ))}
          </FilterGroup>

          <FilterGroup
            id="sort"
            title="Sort by"
            count={0}
            open={openGroups.includes("sort")}
            onToggle={toggleGroup}
          >
            {(
              [
                ["updated_at", "Last updated"],
                ["name", "Name"],
                ["status", "Status"],
                ["last_stay", "Last stay"],
              ] as [GuestListSort, string][]
            ).map(([value, label]) => (
              <FilterOption
                key={value}
                type="radio"
                name="guest-filter-sort"
                label={label}
                checked={draft.sort === value}
                disabled={value === "last_stay" && !lastStayAvailable}
                onChange={() => patchDraft({ sort: value })}
              />
            ))}
          </FilterGroup>
        </MoreFiltersMenu>

      </div>

      <FilterChips chips={chips} />

      {!lastStayAvailable ? (
        <p className="text-xs text-muted-foreground">
          Last stay is unavailable until reservation access is readable.
        </p>
      ) : null}

      {guestsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading guests…</p>
      ) : guests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No guests match this view yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
          <table
            className="w-full min-w-[920px] text-sm"
            data-testid="guest-listing-table"
          >
            <thead className="border-b-2 border-white bg-[#fbfbfb] text-left text-[11px] font-semibold uppercase tracking-wider text-[#4a2c1a]">
              <tr>
                <th className="px-4 py-3">Profile No.</th>
                <th className="px-3 py-3">Guest</th>
                <th className="px-3 py-3">Contact</th>
                <th className="px-3 py-3">Nationality</th>
                <th className="px-3 py-3">Last Stay</th>
                <th className="px-3 py-3">Upcoming</th>
                <th className="px-3 py-3">VIP</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody>
              {guests.map((g) => {
                const upcoming = (
                  g as unknown as { upcomingCount?: number | null }
                ).upcomingCount;
                const isActive = g.guestStatus === "active";

                return (
                  <tr
                    key={g.id}
                    className={cn(
                      "border-t border-border",
                      guestRowClass("individual"),
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {displayProfileNumber(g.id, g.profileNumber)}
                    </td>

                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => openGuest(g.id)}
                      >
                        <span className="flex flex-wrap items-center gap-2.5">
                          <span className="font-bold">{g.fullName}</span>
                          <GuestRestrictionBadges guest={g} />
                        </span>
                      </button>
                    </td>

                    <td className="px-3 py-3">
                      {g.phone || g.email ? (
                        <span className="block leading-snug">
                          <span className="block font-medium text-foreground">
                            {g.phone ?? "—"}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {g.email ?? ""}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3">{g.nationality ?? "—"}</td>

                    <td className="px-3 py-3">
                      {lastStayAvailable && g.lastStayAt
                        ? date(g.lastStayAt)
                        : "—"}
                    </td>

                    <td className="px-3 py-3 text-muted-foreground">
                      {upcoming ? upcoming : "—"}
                    </td>

                    <td className="px-3 py-3 text-muted-foreground">
                      {g.vipStatus ? (
                        <span className="font-semibold text-foreground">
                          VIP
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-1.5 rounded-full",
                            isActive
                              ? "bg-[#436436]"
                              : "bg-muted-foreground",
                          )}
                        />
                        {g.guestStatus}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <GuestRowActions
                        kind="guest"
                        id={g.id}
                        label={g.fullName}
                        active={isActive}
                        onToggleActive={() =>
                          statusMutation.mutate({
                            guestId: g.id,
                            status: isActive ? "inactive" : "active",
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {total} profile{total === 1 ? "" : "s"} · page{" "}
          {Math.min(page + 1, pageCount)} of {pageCount}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(
                Number(value) as (typeof LISTING_PAGE_SIZES)[number],
              );
              setPage(0);
            }}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LISTING_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            Previous
          </Button>

          <Button
            variant="outline"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {DUPLICATE_PREVENTION_TIP}
      </p>

      <GuestImportDialog
        restaurantId={restaurantId}
        file={importFile}
        onClose={() => setImportFile(null)}
      />

      <GuestFormDialog
        restaurantId={restaurantId}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditGuest(null);
        }}
        guest={editGuest}
        onSaved={(id) => {
          refresh();
          if (!editGuest) openGuest(id);
        }}
        onOpenExisting={openGuest}
      />

      <GuestMergeDialog
        restaurantId={restaurantId}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        initialSurvivorId={mergeSurvivorId}
        onMerged={(id) => {
          refresh();
          openGuest(id);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* "All" view: guests, companies, travel agencies and groups in one    */
/* list. Loads guests (listGuests) plus the three account types        */
/* (listGuestAccounts) in parallel and merges them.                    */
/* ------------------------------------------------------------------ */

const ALL_FETCH_LIMIT = 100;

type AllType = "individual" | "company" | "travel-agent" | "group";

const ALL_TYPES: AllType[] = ["individual", "company", "travel-agent", "group"];

/** Account types to load, with the row type each one maps to. */
const ACCOUNT_SOURCES: { accountType: GuestAccountType; type: AllType }[] = [
  { accountType: "company", type: "company" },
  { accountType: "travel_agent", type: "travel-agent" },
  { accountType: "group", type: "group" },
];

const TYPE_LABELS: Record<AllType, string> = {
  individual: "Guest",
  company: "Company",
  "travel-agent": "Travel agency",
  group: "Group",
};
const TYPE_DOT: Record<AllType, string> = {
  individual: "#4a2c1a",
  company: "#c9a24a",
  "travel-agent": "#436436",
  group: "#a4492f",
};

/** Maps the row type to the kind used by the action dropdown. */
const ROW_KIND: Record<AllType, GuestRowKind> = {
  individual: "guest",
  company: "company",
  "travel-agent": "travel-agency",
  group: "group",
};

type AllRow = {
  key: string;
  id: string;
  type: AllType;
  name: string;
  secondary: string | null;
  profileNo: string;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  vip: boolean;
  status: string;
  /** Date the profile was created, used by Export to PDF. */
  createdAt: string | null;
  /** Only set for individual guests (used for the restriction badges). */
  guest?: Parameters<typeof GuestRestrictionBadges>[0]["guest"];
};

type AllData = {
  rows: AllRow[];
  /** Total per type on the server. */
  totals: Record<AllType, number>;
  /** Types that failed to load. */
  failed: AllType[];
};

type AllFilterDraft = {
  status: string;
  type: "all" | AllType;
  vip: boolean;
  nationality: string;
};

const DEFAULT_ALL_DRAFT: AllFilterDraft = {
  status: ALL,
  type: "all",
  vip: false,
  nationality: "",
};

export function GuestAllDirectory({
  membership,
  returnCard,
}: {
  membership: RestaurantMembership;
  returnCard?: GuestProfileCardId | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchGuests = useServerFn(listGuests);
  const fetchAccounts = useServerFn(listGuestAccounts);
  const changeStatus = useServerFn(setGuestStatus);
  const [term, setTerm] = useState("");

  // More filters: choices are staged in `draft` and applied with "Apply filters".
  const [filters, setFilters] = useState<AllFilterDraft>(DEFAULT_ALL_DRAFT);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<AllFilterDraft>(DEFAULT_ALL_DRAFT);
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  const allQuery = useQuery({
    queryKey: ["guests", restaurantId, "all-types"],
    queryFn: async (): Promise<AllData> => {
      const [guestsResult, ...accountResults] = await Promise.allSettled([
        fetchGuests({ data: { restaurantId, offset: 0, limit: ALL_FETCH_LIMIT } }),
        ...ACCOUNT_SOURCES.map((source) =>
          fetchAccounts({
            data: {
              restaurantId,
              accountType: source.accountType,
              offset: 0,
              limit: ALL_FETCH_LIMIT,
            },
          }),
        ),
      ]);

      const rows: AllRow[] = [];
      const totals: Record<AllType, number> = {
        individual: 0,
        company: 0,
        "travel-agent": 0,
        group: 0,
      };
      const failed: AllType[] = [];

      if (guestsResult.status === "fulfilled") {
        const items = guestsResult.value?.items ?? [];
        totals.individual = guestsResult.value?.total ?? items.length;
        for (const g of items) {
          rows.push({
            key: `individual-${g.id}`,
            id: g.id,
            type: "individual",
            name: g.fullName,
            secondary: null,
            profileNo: displayProfileNumber(g.id, g.profileNumber),
            phone: g.phone ?? null,
            email: g.email ?? null,
            nationality: g.nationality ?? null,
            vip: Boolean(g.vipStatus),
            status: g.guestStatus,
            createdAt: createdAtOf(g),
            guest: g,
          });
        }
      } else {
        failed.push("individual");
      }

      accountResults.forEach((result, index) => {
        const source = ACCOUNT_SOURCES[index]!;
        if (result.status !== "fulfilled") {
          failed.push(source.type);
          return;
        }
        const items = accountListItems(result.value);
        totals[source.type] =
          result.value && !Array.isArray(result.value) ? result.value.total : items.length;
        for (const row of items) {
          rows.push({
            key: `${source.type}-${row.id}`,
            id: row.id,
            type: source.type,
            name: row.name,
            secondary:
              source.type === "company"
                ? companyDirectorySecondary(row.tradeName, row.companyType)
                : source.type === "travel-agent"
                  ? taDirectorySecondary(row.tradeName, row.agencyType)
                  : null,
            profileNo: displayProfileNumber(row.id, row.code),
            phone: row.phone ?? null,
            email: row.email ?? null,
            nationality: null,
            vip: false,
            status: row.accountStatus,
            createdAt: createdAtOf(row),
          });
        }
      });

      if (failed.length === ALL_TYPES.length) {
        throw new Error("Could not load any guest profiles.");
      }

      rows.sort((a, b) => a.name.localeCompare(b.name));
      return { rows, totals, failed };
    },
    retry: false,
  });

  // Activate / Deactivate is only wired for individual guests here.
  const statusMutation = useMutation({
    mutationFn: (input: { guestId: string; status: "active" | "inactive" }) =>
      changeStatus({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      void queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] });
    },
  });

  const data = allQuery.data;
  const items = data?.rows ?? [];
  const totals = data?.totals;
  const needle = term.trim().toLowerCase();

  const nationalityOptions = [
    ...new Set(items.map((row) => row.nationality).filter((v): v is string => Boolean(v))),
  ].sort();

  const rows = items.filter((row) => {
    if (filters.type !== "all" && row.type !== filters.type) return false;
    if (filters.status !== ALL && row.status !== filters.status) return false;
    if (filters.vip && !row.vip) return false;
    if (filters.nationality && row.nationality !== filters.nationality) return false;
    if (!needle) return true;
    return [row.name, row.secondary, row.profileNo, row.phone, row.email, row.nationality, TYPE_LABELS[row.type]]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  function patchDraft(patch: Partial<AllFilterDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function toggleGroup(id: string) {
    setOpenGroups((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
    );
  }

  function applyFilters(next: AllFilterDraft) {
    setFilters(next);
    setFilterOpen(false);
  }

  function handleFilterOpenChange(open: boolean) {
    setFilterOpen(open);
    if (open) setDraft(filters);
  }

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.type !== "all") {
    chips.push({
      key: "type",
      label: `Type: ${TYPE_LABELS[filters.type]}`,
      clear: () => setFilters((f) => ({ ...f, type: "all" })),
    });
  }
  if (filters.status !== ALL) {
    chips.push({
      key: "status",
      label: `Status: ${filters.status === "active" ? "Active" : "Inactive"}`,
      clear: () => setFilters((f) => ({ ...f, status: ALL })),
    });
  }
  if (filters.vip) {
    chips.push({
      key: "vip",
      label: "VIP only",
      clear: () => setFilters((f) => ({ ...f, vip: false })),
    });
  }
  if (filters.nationality) {
    chips.push({
      key: "nationality",
      label: `Nationality: ${filters.nationality}`,
      clear: () => setFilters((f) => ({ ...f, nationality: "" })),
    });
  }

  // "More > Import Guests" hands the chosen CSV file to the import dialog below.
  const [importFile, setImportFile] = useState<File | null>(null);
  useGuestImportFile(setImportFile);

  // "More > Export to PDF" exports the rows currently shown (search and filters
  // applied) that were created in the chosen period.
  useGuestExportPdf((range) =>
    exportProfilesToPdf({
      title: "All Guest Profiles",
      restaurantName: membership.restaurant.name,
      rangeLabel: range.label,
      rows: rows
        .filter((row) => inExportRange(row.createdAt, range))
        .map((row) => ({
          profileNo: row.profileNo,
          name: row.name,
          type: TYPE_LABELS[row.type],
          phone: row.phone,
          email: row.email,
          nationality: row.nationality,
          vip: row.vip,
          status: row.status,
          createdAt: row.createdAt,
        })),
    }),
  );

  const loadedByType = (type: AllType) => items.filter((row) => row.type === type).length;
  const truncated = totals
    ? ALL_TYPES.some((type) => totals[type] > loadedByType(type))
    : false;
  const totalAll = totals ? ALL_TYPES.reduce((sum, type) => sum + totals[type], 0) : 0;

  // Clicking the name opens the profile.
  function openGuest(id: string, type: AllType) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: guestProfileSearch({ card: returnCard, type: type as GuestProfileTypeId }),
    });
  }

  return (
    <div className="space-y-4" data-testid="guest-all-directory">
      <GuestImportDialog
        restaurantId={restaurantId}
        file={importFile}
        onClose={() => setImportFile(null)}
      />

      {/* Search + More filters, same as the other directories */}
      <div className="flex flex-wrap items-center gap-3" data-testid="guest-directory-filters">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#c9a24a]" />
          <Input
            className={cn(PILL, "w-full pl-10")}
            placeholder="Search all profiles by name, phone, email or profile no."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            data-testid="guest-all-search"
          />
        </div>

        <MoreFiltersMenu
          open={filterOpen}
          onOpenChange={handleFilterOpenChange}
          activeCount={chips.length}
          title="Filter all profiles"
          onApply={() => applyFilters(draft)}
          onClear={() => applyFilters(DEFAULT_ALL_DRAFT)}
        >
          <FilterGroup
            id="type"
            title="Type"
            count={draft.type !== "all" ? 1 : 0}
            open={openGroups.includes("type")}
            onToggle={toggleGroup}
          >
            <FilterOption
              type="radio"
              name="all-filter-type"
              label="All types"
              checked={draft.type === "all"}
              onChange={() => patchDraft({ type: "all" })}
            />
            {ALL_TYPES.map((type) => (
              <FilterOption
                key={type}
                type="radio"
                name="all-filter-type"
                label={TYPE_LABELS[type]}
                checked={draft.type === type}
                onChange={() => patchDraft({ type })}
              />
            ))}
          </FilterGroup>

          <FilterGroup
            id="status"
            title="Status"
            count={draft.status !== ALL ? 1 : 0}
            open={openGroups.includes("status")}
            onToggle={toggleGroup}
          >
            <FilterOption
              type="radio"
              name="all-filter-status"
              label="All statuses"
              checked={draft.status === ALL}
              onChange={() => patchDraft({ status: ALL })}
            />
            <FilterOption
              type="radio"
              name="all-filter-status"
              label="Active"
              checked={draft.status === "active"}
              onChange={() => patchDraft({ status: "active" })}
            />
            <FilterOption
              type="radio"
              name="all-filter-status"
              label="Inactive"
              checked={draft.status === "inactive"}
              onChange={() => patchDraft({ status: "inactive" })}
            />
          </FilterGroup>

          <FilterGroup
            id="vip"
            title="VIP"
            count={draft.vip ? 1 : 0}
            open={openGroups.includes("vip")}
            onToggle={toggleGroup}
          >
            <FilterOption
              type="checkbox"
              name="all-filter-vip"
              label="VIP guests only"
              checked={draft.vip}
              onChange={(checked) => patchDraft({ vip: checked })}
            />
          </FilterGroup>

          <FilterGroup
            id="nationality"
            title="Nationality"
            count={draft.nationality ? 1 : 0}
            open={openGroups.includes("nationality")}
            onToggle={toggleGroup}
          >
            <FilterOption
              type="radio"
              name="all-filter-nationality"
              label="All nationalities"
              checked={draft.nationality === ""}
              onChange={() => patchDraft({ nationality: "" })}
            />
            {nationalityOptions.map((value) => (
              <FilterOption
                key={value}
                type="radio"
                name="all-filter-nationality"
                label={value}
                checked={draft.nationality === value}
                onChange={() => patchDraft({ nationality: value })}
              />
            ))}
          </FilterGroup>
        </MoreFiltersMenu>
      </div>

      <FilterChips chips={chips} />

      {data && data.failed.length > 0 ? (
        <p className="text-xs text-destructive">
          Could not load: {data.failed.map((type) => TYPE_LABELS[type]).join(", ")}.
        </p>
      ) : null}

      {allQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading all profiles…</p>
      ) : allQuery.isError ? (
        <p className="text-sm text-destructive">Could not load profiles. Try Refresh.</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No profiles match this view yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
          <table className="w-full min-w-[820px] text-sm" data-testid="guest-all-table">
            <thead className="border-b-2 border-white bg-[#fbfbfb] text-left text-[11px] font-semibold uppercase tracking-wider text-[#4a2c1a]">
              <tr>
                <th className="px-4 py-3">Profile No.</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Contact</th>
                <th className="px-3 py-3">Nationality</th>
                <th className="px-3 py-3">VIP</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isActive = row.status === "active";
                return (
                  <tr key={row.key} className={cn("border-t border-border", guestRowClass(row.type))}>
                    <td className="px-4 py-3 font-mono text-xs">{row.profileNo}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => openGuest(row.id, row.type)}
                      >
                        <span className="flex flex-wrap items-center gap-2.5">
                          <span className="font-bold">{row.name}</span>
                          {row.guest ? <GuestRestrictionBadges guest={row.guest} /> : null}
                        </span>
                        {row.secondary ? (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {row.secondary}
                          </span>
                        ) : null}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold">
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full"
                          style={{ background: TYPE_DOT[row.type] }}
                        />
                        {TYPE_LABELS[row.type]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {row.phone || row.email ? (
                        <span className="block leading-snug">
                          <span className="block font-medium">{row.phone ?? "—"}</span>
                          <span className="block text-xs text-muted-foreground">{row.email ?? ""}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{row.nationality ?? "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.vip ? <span className="font-semibold text-foreground">VIP</span> : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-1.5 rounded-full",
                            isActive ? "bg-[#436436]" : "bg-muted-foreground",
                          )}
                        />
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <GuestRowActions
                        kind={ROW_KIND[row.type]}
                        id={row.id}
                        label={row.name}
                        active={isActive}
                        onToggleActive={
                          row.type === "individual"
                            ? () =>
                                statusMutation.mutate({
                                  guestId: row.id,
                                  status: isActive ? "inactive" : "active",
                                })
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {needle || chips.length > 0
          ? `${rows.length} of ${items.length} loaded profiles match`
          : truncated
            ? `Showing the first ${ALL_FETCH_LIMIT} of each type (${items.length} of ${totalAll} profiles). Pick a category to see the rest.`
            : `${totalAll} profile${totalAll === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}

/** The single "More filters" button and dropdown shared by every directory. */
export function MoreFiltersMenu({
  open,
  onOpenChange,
  activeCount,
  onApply,
  onClear,
  title = "Filter guests",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  onApply: () => void;
  onClear: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 gap-2 rounded-full border-transparent bg-[#f1ede6] px-5 text-sm font-bold text-[#4a2c1a] hover:bg-[#e9e2d6]",
            open && "bg-[#e9e2d6]",
          )}
          data-testid="guest-filter-button"
        >
          <SlidersHorizontal className="size-4" />
          More filters
          {activeCount > 0 ? (
            <span className="rounded-full bg-[#c9a24a] px-2 text-[11px] font-extrabold text-[#2b1a10]">
              {activeCount}
            </span>
          ) : null}
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[min(340px,calc(100vw-2rem))] border-[#e9dfd0] p-0"
        data-testid="guest-filter-menu"
      >
        <p className="border-b border-border bg-[#f5ead0] px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-[#4a2c1a]">
          {title}
        </p>

        {children}

        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            data-testid="guest-filter-clear"
            onClick={onClear}
          >
            Clear all
          </Button>

          <Button
            type="button"
            className="bg-[#c9a24a] font-bold text-[#2b1a10] hover:bg-[#c9a24a]/90"
            data-testid="guest-filter-apply"
            onClick={onApply}
          >
            Apply filters
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Applied filters as removable chips. */
export function FilterChips({
  chips,
}: {
  chips: { key: string; label: string; clear: () => void }[];
}) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" data-testid="guest-filter-chips">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.clear}
          aria-label={`Remove filter ${chip.label}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a24a] bg-[#f5ead0] py-0.5 pl-3 pr-2 text-xs font-bold text-[#4a2c1a]"
        >
          {chip.label}
          <X className="size-3" />
        </button>
      ))}
    </div>
  );
}

/** One collapsible category inside the More filters dropdown. */
export function FilterGroup({
  id,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  count: number;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold hover:bg-[#f5ead0]"
      >
        <span className="flex items-center gap-2">
          {title}
          {count > 0 ? (
            <span className="rounded-full bg-[#c9a24a] px-2 text-[11px] font-extrabold text-[#2b1a10]">
              {count}
            </span>
          ) : null}
        </span>

        <ChevronDown
          className={cn(
            "size-4 text-[#c9a24a] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="max-h-52 space-y-0.5 overflow-y-auto bg-[#fbfbfb] px-4 py-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A radio or checkbox row inside a filter group. */
export function FilterOption({
  type,
  name,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  type: "radio" | "checkbox";
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 py-1.5 text-sm",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[#c9a24a]"
      />
      <span>{label}</span>
    </label>
  );
}

function NewGuestDropdown({
  onIndividual,
  onCompany,
  onAgency,
  onGroup,
  canCreateIndividual = true,
  canCreateCompany = true,
  canCreateAgency = true,
  canCreateGroup = true,
}: {
  onIndividual: () => void;
  onCompany: () => void;
  onAgency: () => void;
  onGroup?: () => void;
  canCreateIndividual?: boolean;
  canCreateCompany?: boolean;
  canCreateAgency?: boolean;
  canCreateGroup?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-testid="new-guest-menu"
          className="bg-accent font-bold text-accent-foreground hover:bg-accent/90"
        >
          New Guest
          <ChevronDown className="ml-2 size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="border-transparent bg-white shadow-[0_8px_28px_rgba(74,44,26,0.18)]"
      >
        <DropdownMenuItem
          disabled={!canCreateIndividual}
          onSelect={onIndividual}
        >
          New Individual
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!canCreateCompany}
          onSelect={onCompany}
        >
          New Company
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!canCreateAgency}
          onSelect={onAgency}
        >
          New Agency
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!onGroup || !canCreateGroup}
          onSelect={() => onGroup?.()}
        >
          New Group
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * New Guest dropdown followed by the More dropdown (Export to PDF).
 * Render this where the New Guest button is; no separate More button is needed.
 * Pass showMore={false} if the page already renders its own More button.
 */
export function GuestListingNewGuestMenu(
  props: React.ComponentProps<typeof NewGuestDropdown> & { showMore?: boolean },
) {
  const { showMore = true, ...rest } = props;
  return (
    <div className="flex items-center gap-2">
      <NewGuestDropdown {...rest} />
      {showMore ? <GuestListingMoreMenu /> : null}
    </div>
  );
}