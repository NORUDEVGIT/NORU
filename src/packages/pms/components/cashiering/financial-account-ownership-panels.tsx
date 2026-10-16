import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRightLeft,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Receipt,
  Search,
} from "lucide-react";

import { AccountReturnTransferDialog } from "@/packages/pms/components/cashiering/account-return-transfer-dialog";
import { CorrectChargeDialog } from "@/packages/pms/components/cashiering/correct-charge-dialog";
import { formatBalance } from "@/packages/pms/components/cashiering/folio-workspace-panels";
import {
  listFinancialAccountChargeGroups,
  listFinancialAccountSourceFolios,
} from "@/packages/pms/lib/cashiering-account-ownership.functions";
import type { FinancialAccountRow } from "@/packages/pms/lib/cashiering-phases.functions";
import { reservationStatusLabel } from "@/packages/pms/lib/folio-search-filters";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-sm";

type PageSize = 10 | 25 | 50;

function coverageLabel(coverage: string): string {
  if (coverage === "invoiced") return "Invoiced";
  if (coverage === "partial") return "Partially invoiced";
  if (coverage === "in_draft") return "In draft";
  return "Uninvoiced";
}

function CoveragePill({ coverage }: { coverage: string }) {
  if (coverage === "invoiced") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
        Invoiced
      </span>
    );
  }
  if (coverage === "partial") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
        Partially invoiced
      </span>
    );
  }
  if (coverage === "in_draft") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200">
        In draft
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
      Uninvoiced
    </span>
  );
}

function stayLabel(status: string | null): string {
  if (!status) return "—";
  return reservationStatusLabel(status);
}

export function FinancialAccountSourceFolios({
  restaurantId,
  accountId,
  money,
  date,
  onViewCharges,
}: {
  restaurantId: string;
  accountId: string;
  money: (value: number) => string;
  date: (value: string | null | undefined) => string;
  onViewCharges: (folioId: string, folioNumber: string) => void;
}) {
  const fetchRows = useServerFn(listFinancialAccountSourceFolios);
  const [search, setSearch] = useState("");
  const [stay, setStay] = useState<
    "all" | "in_house" | "checked_out" | "folio_open" | "folio_closed"
  >("all");
  const [coverage, setCoverage] = useState<"all" | "invoiced" | "partial" | "uninvoiced">("all");
  const [scope, setScope] = useState<"current" | "history">("current");
  const [sort, setSort] = useState<"recent" | "guest" | "arrival" | "departure" | "owned">(
    "recent",
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const query = useQuery({
    queryKey: [
      "financial-account-source-folios",
      restaurantId,
      accountId,
      search,
      stay,
      coverage,
      scope,
      sort,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchRows({
        data: { restaurantId, accountId, search, stay, coverage, scope, sort, page, pageSize },
      }),
  });
  const result = query.data;
  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  return (
    <section className="space-y-4" data-testid="account-source-folios">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-[#251605]">Source Folios</h2>
          <p className="text-sm text-muted-foreground">
            Guest folios with charges currently owned by this financial account.
          </p>
        </div>
      </header>

      {result ? (
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Mini label="Source folios" value={String(result.summary.sourceFolios)} />
          <Mini label="Account-owned amount" value={money(result.summary.accountOwnedAmount)} />
          <Mini label="Uninvoiced groups" value={String(result.summary.uninvoicedGroups)} />
          <Mini label="Invoiced groups" value={String(result.summary.invoicedGroups)} />
        </div>
      ) : null}

      <div className={cn(CARD, "p-3 space-y-3")}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              placeholder="Folio, guest, reservation, room"
              className="h-9 pl-8 text-sm border-[#E8E1D7] bg-white focus-visible:ring-1 focus-visible:ring-[#C89933]"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={stay}
            onChange={(value) => {
              setStay(value as typeof stay);
              setPage(1);
            }}
            options={[
              ["all", "All stays"],
              ["in_house", "In-House"],
              ["checked_out", "Checked-Out"],
              ["folio_open", "Folio open"],
              ["folio_closed", "Folio closed"],
            ]}
          />
          <Select
            value={coverage}
            onChange={(value) => {
              setCoverage(value as typeof coverage);
              setPage(1);
            }}
            options={[
              ["all", "All coverage"],
              ["uninvoiced", "Uninvoiced"],
              ["partial", "Partially invoiced"],
              ["invoiced", "Invoiced"],
            ]}
          />
          <Select
            value={scope}
            onChange={(value) => {
              setScope(value as typeof scope);
              setPage(1);
            }}
            options={[
              ["current", "Current ownership"],
              ["history", "Include fully returned"],
            ]}
          />
          <Select
            value={sort}
            onChange={(value) => setSort(value as typeof sort)}
            options={[
              ["recent", "Recent activity"],
              ["guest", "Guest name"],
              ["arrival", "Arrival date"],
              ["departure", "Departure date"],
              ["owned", "Account-owned amount"],
            ]}
          />
        </div>

        <div className="rounded-lg border border-[#E8E1D7] overflow-hidden">
          {query.isLoading ? (
            <p className="px-4 py-8 text-sm text-center text-muted-foreground">Loading source folios…</p>
          ) : !result || result.total === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#FAF8F4] text-muted-foreground">
                <Receipt className="size-6 text-[#C89933]" />
              </div>
              <p className="mt-3 font-medium text-[#251605]">No source folios yet</p>
              <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                Guest folios appear here after eligible charges are transferred to this Company/Group
                financial account.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-[#FAF8F4] border-b border-[#E8E1D7] text-left text-[11px] font-semibold uppercase tracking-wider text-[#736B5E]">
                  <tr>
                    <th className="px-3.5 py-2.5">Folio</th>
                    <th className="px-3.5 py-2.5">Guest</th>
                    <th className="px-3.5 py-2.5">Room</th>
                    <th className="px-3.5 py-2.5">Stay</th>
                    <th className="px-3.5 py-2.5 text-right">Account-owned amount</th>
                    <th className="px-3.5 py-2.5">Charge groups</th>
                    <th className="px-3.5 py-2.5">Invoice coverage</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E1D7]">
                  {result.rows.map((row) => (
                    <tr key={row.sourceFolioId} className="hover:bg-[#FAF8F4]/70 transition-colors">
                      <td className="px-3.5 py-2.5 font-medium text-[#251605]">
                        <Link
                          to="/restaurant/pms/cashiering/folios/$folioId"
                          params={{ folioId: row.sourceFolioId }}
                          className="hover:text-[#C89933] hover:underline transition-colors"
                        >
                          {row.folioNumber}
                        </Link>
                      </td>
                      <td className="px-3.5 py-2.5 text-[#251605] font-medium">{row.guestName ?? "—"}</td>
                      <td className="px-3.5 py-2.5">
                        {row.roomNumber ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#F7F4EE] border border-[#E8E1D7] text-[#251605]">
                            Room {row.roomNumber}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {row.arrivalDate ? date(row.arrivalDate) : "—"} –{" "}
                        {row.departureDate ? date(row.departureDate) : "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums font-medium text-[#251605]">
                        {formatBalance(money, row.accountOwnedRemaining)}
                      </td>
                      <td className="px-3.5 py-2.5 tabular-nums text-muted-foreground">{row.chargeGroupCount}</td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <CoveragePill coverage={row.coverage} />
                          <span className="text-[11px] text-muted-foreground">
                            ({row.invoicedGroupCount}/{row.chargeGroupCount})
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="block text-xs font-medium text-[#251605]">{stayLabel(row.stayStatus)}</span>
                        <span className="text-[11px] text-muted-foreground">
                          Folio {row.folioStatus === "open" ? "Open" : "Closed"}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-8 hover:bg-[#FAF8F4]" aria-label="Folio actions">
                              <MoreHorizontal className="size-4 text-[#736B5E]" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="border-[#E8E1D7]">
                            <DropdownMenuItem asChild>
                              <Link
                                to="/restaurant/pms/cashiering/folios/$folioId"
                                params={{ folioId: row.sourceFolioId }}
                              >
                                View guest folio
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onViewCharges(row.sourceFolioId, row.folioNumber)}
                            >
                              View account charges
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Pager
          page={result?.page ?? page}
          pageCount={pageCount}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </section>
  );
}

type ChargeRow = {
  chargeGroupId: string;
  sourceKind: "transferred" | "direct";
  sourceFolioId: string | null;
  folioNumber: string | null;
  guestName: string | null;
  postedAt: string;
  description: string;
  grossAmount: number;
  transferredInAmount: number;
  returnedAmount: number;
  correctedAmount: number;
  remainingAmount: number;
  parentAmount: number;
  taxAmount: number;
  serviceAmount: number;
  coverage: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  creditAmount: number;
  debitAmount: number;
  actorName: string | null;
  correctionSourceId: string | null;
  quantity: number | null;
  unitAmount: number | null;
  capabilities: {
    canView: boolean;
    canCorrect: boolean;
    canReturnToGuest: boolean;
    canViewInvoice: boolean;
    canViewSourceFolio: boolean;
  };
};

export function FinancialAccountCharges({
  restaurantId,
  accountId,
  account,
  money,
  dateTime,
  sourceFolioId,
  sourceFolioLabel,
  onClearSourceFolio,
  onViewInvoices,
}: {
  restaurantId: string;
  accountId: string;
  account: FinancialAccountRow | null;
  money: (value: number) => string;
  dateTime: (value: string | null | undefined) => string;
  sourceFolioId: string | null;
  sourceFolioLabel: string | null;
  onClearSourceFolio: () => void;
  onViewInvoices: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchRows = useServerFn(listFinancialAccountChargeGroups);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"all" | "transferred" | "direct">("all");
  const [coverage, setCoverage] = useState<"all" | "uninvoiced" | "invoiced" | "partial">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "amount" | "remaining">("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [selected, setSelected] = useState<ChargeRow | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [
      "financial-account-charge-groups",
      restaurantId,
      accountId,
      search,
      source,
      coverage,
      sourceFolioId,
      from,
      to,
      sort,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchRows({
        data: {
          restaurantId,
          accountId,
          search,
          source,
          coverage,
          sourceFolioId,
          from: from || null,
          to: to || null,
          sort,
          page,
          pageSize,
        },
      }),
  });
  const result = query.data;
  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["financial-account-charge-groups", restaurantId, accountId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["financial-account-source-folios", restaurantId, accountId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["financial-account-workspace", restaurantId, accountId],
    });
  }

  return (
    <section className="space-y-4" data-testid="account-charges">
      <header>
        <h2 className="font-display text-xl text-[#251605]">Charges</h2>
        <p className="text-sm text-muted-foreground">
          Direct and transferred charge groups owned by this financial account. Direct account
          charges do not use the guest tax and service engine.
        </p>
      </header>

      {result ? (
        <div className="space-y-1.5">
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Mini
              label="Current account-owned charges"
              value={money(result.summary.currentOwned)}
            />
            <Mini label="Transferred in" value={money(result.summary.transferredIn)} />
            <Mini label="Invoiced groups" value={String(result.summary.invoicedGroups)} />
            <Mini label="Uninvoiced groups" value={String(result.summary.uninvoicedGroups)} />
          </div>
          <p className="text-xs text-muted-foreground">
            These totals are charge ownership. The account balance also includes payments,
            write-offs, and other ledger lines, which are not allocated to a source folio.
          </p>
        </div>
      ) : null}

      <div className={cn(CARD, "p-3 space-y-3")}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              placeholder="Description, guest, folio"
              className="h-9 pl-8 text-sm border-[#E8E1D7] bg-white focus-visible:ring-1 focus-visible:ring-[#C89933]"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={source}
            onChange={(value) => {
              setSource(value as typeof source);
              setPage(1);
            }}
            options={[
              ["all", "All sources"],
              ["transferred", "Transferred from guest folio"],
              ["direct", "Direct account charge"],
            ]}
          />
          <Select
            value={coverage}
            onChange={(value) => {
              setCoverage(value as typeof coverage);
              setPage(1);
            }}
            options={[
              ["all", "All coverage"],
              ["uninvoiced", "Uninvoiced"],
              ["invoiced", "Invoiced"],
              ["partial", "Partially invoiced"],
            ]}
          />
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={from}
              aria-label="From date"
              className="h-9 w-36 text-xs border-[#E8E1D7] bg-white"
              onChange={(event) => setFrom(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={to}
              aria-label="To date"
              className="h-9 w-36 text-xs border-[#E8E1D7] bg-white"
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Select
            value={sort}
            onChange={(value) => setSort(value as typeof sort)}
            options={[
              ["newest", "Newest first"],
              ["oldest", "Oldest first"],
              ["amount", "Gross amount"],
              ["remaining", "Remaining amount"],
            ]}
          />
        </div>

        {sourceFolioId ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FAF8F4] border border-[#E8E1D7] text-sm">
            <span className="text-xs text-muted-foreground">Filtered by source folio:</span>
            <span className="font-medium text-[#251605]">
              {sourceFolioLabel ?? sourceFolioId}
            </span>
            <button
              type="button"
              className="ml-auto text-xs font-medium text-[#C89933] hover:underline"
              onClick={onClearSourceFolio}
            >
              Clear filter
            </button>
          </div>
        ) : null}

        <div className="rounded-lg border border-[#E8E1D7] overflow-hidden">
          {query.isLoading ? (
            <p className="px-4 py-8 text-sm text-center text-muted-foreground">Loading charges…</p>
          ) : !result || result.rows.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#FAF8F4] text-muted-foreground">
                <Receipt className="size-6 text-[#C89933]" />
              </div>
              <p className="mt-3 font-medium text-[#251605]">No account-owned charge groups.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Charges transferred from guest folios or posted directly will be listed here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-[#FAF8F4] border-b border-[#E8E1D7] text-left text-[11px] font-semibold uppercase tracking-wider text-[#736B5E]">
                  <tr>
                    <th className="px-3.5 py-2.5">Date</th>
                    <th className="px-3.5 py-2.5">Source</th>
                    <th className="px-3.5 py-2.5">Description</th>
                    <th className="px-3.5 py-2.5 text-right">Gross</th>
                    <th className="px-3.5 py-2.5 text-right">Remaining</th>
                    <th className="px-3.5 py-2.5">Invoice coverage</th>
                    <th className="px-3.5 py-2.5">Actor</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E1D7]">
                  {(result.rows as ChargeRow[]).map((row) => (
                    <tr
                      key={row.chargeGroupId}
                      className="cursor-pointer hover:bg-[#FAF8F4]/70 transition-colors"
                      onClick={() => setSelected(row)}
                    >
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {dateTime(row.postedAt)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {row.sourceKind === "direct" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#251605]">
                            <Building2 className="size-3.5 text-[#C89933]" /> Direct account charge
                          </span>
                        ) : (
                          <div>
                            <span className="block text-xs font-medium text-[#251605]">{row.guestName ?? "Guest folio"}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {row.folioNumber ?? "Folio"}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 font-medium text-[#251605]">{row.description}</td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums">
                        <div className="flex flex-col items-end">
                          <span className="font-semibold text-[#251605]">
                            {formatBalance(money, row.grossAmount)}
                          </span>
                          {(row.taxAmount > 0 || row.serviceAmount > 0) && (
                            <span className="text-[10px] text-[#7A6B58] font-normal tracking-tight">
                              Net {money(row.parentAmount)} · Tax {money(row.taxAmount + row.serviceAmount)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums font-medium text-[#251605]">
                        {formatBalance(money, row.remainingAmount)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <CoveragePill coverage={row.coverage} />
                          {row.invoiceNumber ? (
                            <span className="text-xs font-medium text-[#C89933]">
                              {row.invoiceNumber}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {row.actorName ?? "—"}
                      </td>
                      <td
                        className="px-3.5 py-2.5 text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-8 hover:bg-[#FAF8F4]" aria-label="Charge actions">
                              <MoreHorizontal className="size-4 text-[#736B5E]" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="border-[#E8E1D7]">
                            <DropdownMenuItem onClick={() => setSelected(row)}>
                              View charge
                            </DropdownMenuItem>
                            {row.capabilities.canCorrect && row.correctionSourceId ? (
                              <DropdownMenuItem onClick={() => setCorrectId(row.correctionSourceId)}>
                                Correct charge
                              </DropdownMenuItem>
                            ) : null}
                            {row.capabilities.canReturnToGuest && row.correctionSourceId ? (
                              <DropdownMenuItem onClick={() => setReturnId(row.correctionSourceId)}>
                                Return to guest folio
                              </DropdownMenuItem>
                            ) : null}
                            {row.capabilities.canViewInvoice ? (
                              <DropdownMenuItem onClick={onViewInvoices}>
                                View invoice
                              </DropdownMenuItem>
                            ) : null}
                            {row.capabilities.canViewSourceFolio && row.sourceFolioId ? (
                              <DropdownMenuItem asChild>
                                <Link
                                  to="/restaurant/pms/cashiering/folios/$folioId"
                                  params={{ folioId: row.sourceFolioId }}
                                >
                                  View source folio
                                </Link>
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Pager
          page={result?.page ?? page}
          pageCount={pageCount}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
      <Sheet open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.description}</SheetTitle>
                <SheetDescription>
                  {selected.sourceKind === "direct"
                    ? "Direct account charge"
                    : `${selected.guestName ?? "Guest"} · ${selected.folioNumber ?? "Folio"}`}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <Block title="Charge summary">
                  <Info label="Posted" value={dateTime(selected.postedAt)} />
                  <Info label="Posted by" value={selected.actorName ?? "—"} />
                  <Info
                    label="Source"
                    value={
                      selected.sourceKind === "direct"
                        ? "Direct account charge"
                        : (selected.folioNumber ?? "Guest folio")
                    }
                  />
                </Block>
                <Block title="Financial breakdown">
                  <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
                    <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2 text-center">
                      <span className="text-[10px] font-medium text-[#7A6B58]">Net Base</span>
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-[#251605]">
                        {money(selected.parentAmount)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-2 text-center">
                      <span className="text-[10px] font-medium text-amber-900">Tax</span>
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-amber-900">
                        {money(selected.taxAmount)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-sky-200/80 bg-sky-50/50 p-2 text-center">
                      <span className="text-[10px] font-medium text-sky-900">Service</span>
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-sky-900">
                        {money(selected.serviceAmount)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#E8E1D7] bg-white p-2 text-center shadow-2xs">
                      <span className="text-[10px] font-bold text-[#251605]">Gross Total</span>
                      <p className="mt-0.5 text-xs font-bold tabular-nums text-[#251605]">
                        {money(selected.grossAmount)}
                      </p>
                    </div>
                  </div>
                </Block>
                <Block title="Ownership">
                  <Info
                    label="Transferred into account"
                    value={money(selected.transferredInAmount)}
                  />
                  <Info label="Corrected or discounted" value={money(selected.correctedAmount)} />
                  <Info label="Returned to guest" value={money(selected.returnedAmount)} />
                  <Info label="Remaining account-owned" value={money(selected.remainingAmount)} />
                </Block>
                <Block title="Invoice coverage">
                  <Info label="Coverage" value={coverageLabel(selected.coverage)} />
                  <Info label="Invoice" value={selected.invoiceNumber ?? "—"} />
                  {selected.creditAmount > 0 ? (
                    <Info label="Credits" value={money(selected.creditAmount)} />
                  ) : null}
                  {selected.debitAmount > 0 ? (
                    <Info label="Debit notes" value={money(selected.debitAmount)} />
                  ) : null}
                </Block>
                <div className="flex flex-col gap-2">
                  {selected.capabilities.canCorrect && selected.correctionSourceId ? (
                    <Button
                      variant="outline"
                      onClick={() => setCorrectId(selected.correctionSourceId)}
                    >
                      Correct charge
                    </Button>
                  ) : null}
                  {selected.capabilities.canReturnToGuest && selected.correctionSourceId ? (
                    <Button
                      variant="outline"
                      onClick={() => setReturnId(selected.correctionSourceId)}
                    >
                      Return to guest folio
                    </Button>
                  ) : null}
                  {selected.capabilities.canViewInvoice ? (
                    <Button variant="outline" onClick={onViewInvoices}>
                      View invoice
                    </Button>
                  ) : null}
                  {selected.capabilities.canViewSourceFolio && selected.sourceFolioId ? (
                    <Button variant="outline" asChild>
                      <Link
                        to="/restaurant/pms/cashiering/folios/$folioId"
                        params={{ folioId: selected.sourceFolioId }}
                      >
                        View source folio
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
      <CorrectChargeDialog
        restaurantId={restaurantId}
        sourceTransactionId={correctId}
        title="Correct charge"
        department={null}
        quantity={null}
        unitAmount={null}
        open={correctId != null}
        allowReplacement={false}
        onClose={() => setCorrectId(null)}
        onDone={refresh}
        money={money}
      />
      <AccountReturnTransferDialog
        restaurantId={restaurantId}
        account={account}
        open={returnId != null}
        initialSourceId={returnId}
        onClose={() => setReturnId(null)}
        onDone={refresh}
        money={money}
      />
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(CARD, "p-3.5 transition-shadow hover:shadow-md")}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#736B5E]">{label}</p>
      <p className="mt-1 font-display text-base font-semibold text-[#251605] tabular-nums">{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4]/50 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-[#251605]">{value}</span>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      value={value ?? ""}
      className="h-9 rounded-md border border-[#E8E1D7] bg-white px-2.5 text-xs font-medium text-[#251605] shadow-xs hover:border-[#C89933] focus:border-[#C89933] focus:outline-hidden focus:ring-1 focus:ring-[#C89933]"
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Pager({
  page,
  pageCount,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: PageSize;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[#736B5E]">
      <div className="flex items-center gap-2">
        <span>Rows per page:</span>
        <select
          value={pageSize}
          className="h-8 rounded-md border border-[#E8E1D7] bg-white px-2 text-xs font-medium text-[#251605]"
          onChange={(event) => onPageSize(Number(event.target.value) as PageSize)}
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-[#E8E1D7] text-xs hover:bg-[#FAF8F4]"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-3.5 mr-1" /> Previous
        </Button>
        <span className="tabular-nums font-medium text-[#251605]">
          {page} of {pageCount}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-[#E8E1D7] text-xs hover:bg-[#FAF8F4]"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next <ChevronRight className="size-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
