import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";

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
    <section className="space-y-3" data-testid="account-source-folios">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-[#251605]">Source Folios</h2>
          <p className="text-sm text-muted-foreground">
            Guest folios with charges currently owned by this financial account.
          </p>
        </div>
      </header>
      <div className={cn(CARD, "flex flex-wrap gap-2 p-3")}>
        <Input
          value={search}
          placeholder="Folio, guest, reservation, room"
          className="h-9 max-w-xs"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
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
            ["guest", "Guest"],
            ["arrival", "Arrival"],
            ["departure", "Departure"],
            ["owned", "Account-owned amount"],
          ]}
        />
      </div>
      {result ? (
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <Mini label="Source folios" value={String(result.summary.sourceFolios)} />
          <Mini label="Account-owned amount" value={money(result.summary.accountOwnedAmount)} />
          <Mini label="Uninvoiced groups" value={String(result.summary.uninvoicedGroups)} />
          <Mini label="Invoiced groups" value={String(result.summary.invoicedGroups)} />
        </div>
      ) : null}
      <div className={cn(CARD, "overflow-hidden")}>
        {query.isLoading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading source folios…</p>
        ) : !result || result.total === 0 ? (
          <div className="px-4 py-8">
            <p className="font-medium">No source folios yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Guest folios appear here after eligible charges are transferred to this Company/Group
              financial account.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-[#F7F4EE] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Folio</th>
                  <th className="px-3 py-2">Guest</th>
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Stay</th>
                  <th className="px-3 py-2 text-right">Account-owned amount</th>
                  <th className="px-3 py-2">Charge groups</th>
                  <th className="px-3 py-2">Invoice coverage</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.sourceFolioId} className="border-t border-[#E8E1D7]">
                    <td className="px-3 py-2 font-medium">{row.folioNumber}</td>
                    <td className="px-3 py-2">{row.guestName ?? "—"}</td>
                    <td className="px-3 py-2">{row.roomNumber ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.arrivalDate ? date(row.arrivalDate) : "—"} –{" "}
                      {row.departureDate ? date(row.departureDate) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatBalance(money, row.accountOwnedRemaining)}
                    </td>
                    <td className="px-3 py-2">{row.chargeGroupCount}</td>
                    <td className="px-3 py-2">
                      {row.invoicedGroupCount} / {row.chargeGroupCount} invoiced
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {coverageLabel(row.coverage)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="block">{stayLabel(row.stayStatus)}</span>
                      <span className="text-xs text-muted-foreground">
                        Folio {row.folioStatus === "open" ? "Open" : "Closed"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label="Folio actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
    <section className="space-y-3" data-testid="account-charges">
      <header>
        <h2 className="font-display text-xl text-[#251605]">Charges</h2>
        <p className="text-sm text-muted-foreground">
          Direct and transferred charge groups owned by this financial account. Direct account
          charges do not use the guest tax and service engine.
        </p>
      </header>
      <div className={cn(CARD, "flex flex-wrap gap-2 p-3")}>
        <Input
          value={search}
          placeholder="Description, guest, folio"
          className="h-9 max-w-xs"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
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
        <Input
          type="date"
          value={from}
          className="h-9 w-36"
          onChange={(event) => setFrom(event.target.value)}
        />
        <Input
          type="date"
          value={to}
          className="h-9 w-36"
          onChange={(event) => setTo(event.target.value)}
        />
        <Select
          value={sort}
          onChange={(value) => setSort(value as typeof sort)}
          options={[
            ["newest", "Newest"],
            ["oldest", "Oldest"],
            ["amount", "Gross amount"],
            ["remaining", "Remaining"],
          ]}
        />
      </div>
      {sourceFolioId ? (
        <p className="flex items-center gap-2 text-sm">
          <span className="rounded-full border border-[#E8E1D7] bg-white px-2 py-0.5">
            Source folio: {sourceFolioLabel ?? sourceFolioId}
          </span>
          <button type="button" className="text-[#8A6A2F] underline" onClick={onClearSourceFolio}>
            Clear
          </button>
        </p>
      ) : null}
      {result ? (
        <div className="space-y-1">
          <div className="grid gap-2 text-sm sm:grid-cols-4">
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
      <div className={cn(CARD, "overflow-hidden")}>
        {query.isLoading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading charges…</p>
        ) : !result || result.rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">No account-owned charge groups.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-[#F7F4EE] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2">Invoice coverage</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(result.rows as ChargeRow[]).map((row) => (
                  <tr
                    key={row.chargeGroupId}
                    className="cursor-pointer border-t border-[#E8E1D7]"
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {dateTime(row.postedAt)}
                    </td>
                    <td className="px-3 py-2">
                      {row.sourceKind === "direct" ? (
                        "Direct account charge"
                      ) : (
                        <>
                          <span className="block">{row.guestName ?? "Guest folio"}</span>
                          <span className="text-xs text-muted-foreground">
                            {row.folioNumber ?? "Folio"}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatBalance(money, row.grossAmount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatBalance(money, row.remainingAmount)}
                    </td>
                    <td className="px-3 py-2">
                      {coverageLabel(row.coverage)}
                      {row.invoiceNumber ? (
                        <span className="mt-0.5 block text-xs text-[#8A6A2F]">
                          {row.invoiceNumber}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.actorName ?? "—"}
                    </td>
                    <td
                      className="px-3 py-2 text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label="Charge actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
                  <Info label="Parent" value={money(selected.parentAmount)} />
                  <Info label="Tax" value={money(selected.taxAmount)} />
                  <Info label="Service" value={money(selected.serviceAmount)} />
                  <Info label="Gross" value={money(selected.grossAmount)} />
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
    <div className={cn(CARD, "px-3 py-2")}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      value={value}
      className="h-9 rounded-md border border-[#E8E1D7] bg-white px-2 text-sm"
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
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <select
        value={pageSize}
        className="h-9 rounded-md border border-[#E8E1D7] bg-white px-2"
        onChange={(event) => onPageSize(Number(event.target.value) as PageSize)}
      >
        <option value={10}>10</option>
        <option value={25}>25</option>
        <option value={50}>50</option>
      </select>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
