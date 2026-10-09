import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, History, MoreVertical, Receipt, SlidersHorizontal, Tag, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

import { labelTransactionType } from "@/packages/pms/components/cashiering/folio-bits";
import { InventoryStatusBadge } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { FolioTransactionRow, FolioWorkspace } from "@/packages/pms/lib/cashiering.functions";
import {
  chargeGroupRemainder,
  isParentTransferCharge,
  roundFolioMoney,
  type FolioChargeGroup,
} from "@/packages/pms/lib/folio-workspace";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

type Money = (value: number) => string;
type DateTimeFormat = (iso: string | null | undefined) => string;

type DetailTab = "overview" | "posting" | "corrections" | "history";

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "posting", label: "Posting Info" },
  { id: "corrections", label: "Corrections" },
  { id: "history", label: "History" },
];

function snapshotOf(row: FolioTransactionRow): Record<string, unknown> | null {
  const raw = row.chargeSnapshot;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw;
}

function snapshotText(row: FolioTransactionRow, key: string): string | null {
  const value = snapshotOf(row)?.[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function snapshotNumber(row: FolioTransactionRow, key: string): number | null {
  const value = snapshotOf(row)?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function chargeItemTitle(row: FolioTransactionRow): string {
  const name = snapshotText(row, "name");
  if (name) return name;
  if (row.referenceType === "restaurant_order") return row.description;
  if (row.category === "room" || row.chargeSource === "room") return "System Room Charge";
  return row.description;
}

export function chargeSourceLabel(row: FolioTransactionRow): string | null {
  if (row.referenceType === "restaurant_order") return "POS";
  if (row.category === "room" || row.chargeSource === "room") return "Room";
  switch (row.chargeSource) {
    case "service":
      return "Service";
    case "manual":
      return "Manual";
    case "pos":
      return "POS";
    case "package":
      return "Package";
    case "transfer":
      return "Transfer";
    case "system":
      return "System";
    default:
      return row.category === "manual" ? "Manual" : null;
  }
}

export function chargeDepartment(row: FolioTransactionRow): string | null {
  return snapshotText(row, "departmentName") || row.departmentName?.trim() || null;
}

export function chargeQuantity(row: FolioTransactionRow): number | null {
  return snapshotNumber(row, "quantity") ?? row.quantity ?? null;
}

export function chargeUnitAmount(row: FolioTransactionRow): number | null {
  return snapshotNumber(row, "unitAmount") ?? row.unitAmount ?? null;
}

function pricingUnitLabel(unit: string | null): string {
  switch (unit) {
    case "per_service":
      return "Per service";
    case "per_person":
      return "Per person";
    case "per_room":
      return "Per room";
    case "per_night":
      return "Per night";
    case "per_item":
      return "Per item";
    default:
      return "—";
  }
}

function referenceTypeLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function postedTaxMode(row: FolioTransactionRow): "Included" | "Added" {
  const calculation = row.taxSnapshot?.calculation;
  return calculation === "inclusive" ? "Included" : "Added";
}

function postedTaxName(row: FolioTransactionRow): string {
  const name = row.taxSnapshot?.name;
  if (typeof name === "string" && name.trim() !== "") return name.trim();
  return row.description;
}

function linkedRows(group: FolioChargeGroup, rows: FolioTransactionRow[]): FolioTransactionRow[] {
  const parent = group.parent;
  const componentIds = new Set([parent.id, ...group.children.map((child) => child.id)]);
  const seen = new Set<string>();
  const linked: FolioTransactionRow[] = [];
  const transferIds = new Set<string>();
  for (const row of rows) {
    if (row.id === parent.id || seen.has(row.id)) continue;
    const byOriginal = row.originalTransactionId != null && componentIds.has(row.originalTransactionId);
    const byTransfer = Boolean(parent.transferId) && row.transferId === parent.transferId;
    if (!byOriginal && !byTransfer) continue;
    seen.add(row.id);
    linked.push(row);
    if (row.transferId) transferIds.add(row.transferId);
  }
  for (const row of rows) {
    if (row.id === parent.id || seen.has(row.id) || !row.transferId) continue;
    if (!transferIds.has(row.transferId)) continue;
    seen.add(row.id);
    linked.push(row);
  }
  linked.sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  return linked;
}

function transferDestinations(
  group: FolioChargeGroup,
  rows: FolioTransactionRow[],
  workspace: FolioWorkspace,
): Array<{ id: string; label: string }> {
  const seen = new Set<string>();
  const destinations: Array<{ id: string; label: string }> = [];
  for (const linked of linkedRows(group, rows)) {
    if (linked.type !== "transfer_out" && linked.type !== "transfer_in") continue;
    if (!linked.transferId || seen.has(linked.transferId)) continue;
    seen.add(linked.transferId);
    const other = workspace.transferCounterparts[linked.transferId];
    const label = other?.accountName
      ? `${other.accountName}${other.accountNumber ? ` · ${other.accountNumber}` : ""}`
      : other?.folioNumber;
    if (!label) continue;
    destinations.push({ id: linked.transferId, label });
  }
  return destinations;
}

function historyEvents(group: FolioChargeGroup, rows: FolioTransactionRow[]) {
  const transfers = new Map<string, FolioTransactionRow[]>();
  const events: Array<{
    id: string;
    title: string;
    description: string;
    amount: number;
    postedBy: string | null;
    postedAt: string;
  }> = [];
  for (const linked of linkedRows(group, rows)) {
    if ((linked.type === "transfer_out" || linked.type === "transfer_in") && linked.transferId) {
      const bucket = transfers.get(linked.transferId) ?? [];
      bucket.push(linked);
      transfers.set(linked.transferId, bucket);
      continue;
    }
    events.push({
      id: linked.id,
      title: labelTransactionType(linked.type),
      description: linked.description,
      amount: linked.amount,
      postedBy: linked.postedBy,
      postedAt: linked.postedAt,
    });
  }
  for (const [id, lines] of transfers) {
    const first = [...lines].sort((a, b) => a.postedAt.localeCompare(b.postedAt))[0];
    events.push({
      id,
      title: labelTransactionType(first.type),
      description: first.description,
      amount: roundFolioMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
      postedBy: first.postedBy,
      postedAt: first.postedAt,
    });
  }
  events.sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  return events;
}

function roomLine(workspace: FolioWorkspace): string {
  const parts = [workspace.folio.roomNumber, workspace.folio.roomTypeName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function dash(value: string | null | undefined): string {
  return value && value.trim() !== "" ? value : "—";
}

export function ChargeDetailsSheet({
  group,
  workspace,
  money,
  dateTime,
  onClose,
  onPostAdjustment,
  onApplyDiscount,
  onTransferCharge,
}: {
  group: FolioChargeGroup | null;
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  onClose: () => void;
  onPostAdjustment: () => void;
  onApplyDiscount: () => void;
  onTransferCharge: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const rowId = group?.parent.id ?? null;

  useEffect(() => {
    setTab("overview");
  }, [rowId]);

  const row = group?.parent ?? null;
  const folio = workspace.folio;
  const rows = folio.transactions;
  const canAdjust = Boolean(row && workspace.capabilities.canAdjust);
  const canDiscount = Boolean(row && workspace.capabilities.canDiscount && row.type === "charge");
  const canTransfer = Boolean(
    row &&
      workspace.capabilities.canTransfer &&
      isParentTransferCharge(row) &&
      chargeGroupRemainder(row.id, rows).grossRemaining > 0.009,
  );
  const title = row ? chargeItemTitle(row) : "Charge";
  const source = row ? chargeSourceLabel(row) : null;
  const department = row ? chargeDepartment(row) : null;
  const quantity = row ? chargeQuantity(row) : null;
  const unitAmount = row ? chargeUnitAmount(row) : null;
  const entered = row ? snapshotNumber(row, "enteredAmount") : null;

  function copyId() {
    if (!row) return;
    void navigator.clipboard.writeText(row.id).then(
      () => toast.success("Transaction id copied."),
      () => toast.error("Could not copy the transaction id."),
    );
  }

  return (
    <Sheet open={group !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent
        className="flex w-full max-w-none flex-col gap-0 overflow-hidden border-[#E8E1D7] bg-card p-0 sm:w-[70vw] sm:max-w-[70vw] md:max-w-[460px]"
        data-testid="charge-details-sheet"
      >
        <SheetHeader className="space-y-3 border-b border-[#E8E1D7] px-5 pb-4 pr-24 pt-5 text-left">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#C89933]/15 text-[#8a6a1f]">
              <Receipt className="size-4" />
            </span>
            <SheetTitle className="text-base">Charge Details</SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            Read-only details for this posted charge.
          </SheetDescription>
          {row && group ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{money(group.total)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <InventoryStatusBadge tone="success">Posted</InventoryStatusBadge>
                {source ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {source}
                  </span>
                ) : null}
                {department ? (
                  <span className="text-xs text-muted-foreground">{department}</span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {dateTime(row.postedAt)}
                {" · "}
                {row.postedBy ?? "—"}
              </p>
            </div>
          ) : null}
        </SheetHeader>

        {row ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-12 top-3 size-8 text-muted-foreground"
                aria-label="Charge actions"
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canAdjust ? (
                <DropdownMenuItem onSelect={onPostAdjustment}>
                  <SlidersHorizontal className="size-4 text-amber-700" /> Post Adjustment
                </DropdownMenuItem>
              ) : null}
              {canDiscount ? (
                <DropdownMenuItem onSelect={onApplyDiscount}>
                  <Tag className="size-4 text-purple-700" /> Apply Discount
                </DropdownMenuItem>
              ) : null}
              {canTransfer ? (
                <DropdownMenuItem onSelect={onTransferCharge}>
                  <ArrowLeftRight className="size-4" /> Transfer Charge
                </DropdownMenuItem>
              ) : null}
              {canAdjust || canDiscount || canTransfer ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onSelect={() => setTab("history")}>
                <History className="size-4" /> History
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <div className="flex gap-1 border-b border-[#E8E1D7] px-3">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "relative h-10 px-2.5 text-xs font-medium",
                tab === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {tab === item.id ? (
                <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
          {row && group && tab === "overview" ? (
            <div className="space-y-4">
              <dl>
                <Field label="Department" value={dash(department)} />
                <Field label="Item" value={dash(snapshotText(row, "name") ?? (source === "Room" ? title : null))} />
                <Field label="Code" value={dash(snapshotText(row, "code"))} />
                <Field label="Category" value={dash(snapshotText(row, "categoryName"))} />
                <Field label="Pricing unit" value={pricingUnitLabel(snapshotText(row, "pricingUnit"))} />
                <Field label="Quantity" value={quantity == null ? "—" : String(quantity)} />
                <Field label="Unit price" value={unitAmount == null ? "—" : money(unitAmount)} />
                <Field label="Entered subtotal" value={entered == null ? "—" : money(entered)} />
                <Field label="Description" value={dash(row.description)} />
                {transferDestinations(group, rows, workspace).map((destination) => (
                  <Field key={destination.id} label="Transferred to" value={destination.label} />
                ))}
              </dl>
              <div className="border-t border-[#E8E1D7] pt-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tax / Service
                </p>
                {group.children.length === 0 ? (
                  <p className="text-muted-foreground">—</p>
                ) : (
                  <ul className="space-y-2">
                    {group.children.map((child) => (
                      <li key={child.id} className="flex items-start justify-between gap-3">
                        <span>
                          {postedTaxName(child)}
                          <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {postedTaxMode(child)}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{money(child.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-[#E8E1D7] pt-3 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(group.total)}</span>
              </div>
            </div>
          ) : null}

          {row && tab === "posting" ? (
            <div className="space-y-4">
              <dl>
                <Field label="Folio" value={folio.folioNumber} />
                <div className="flex items-start justify-between gap-4 py-1.5">
                  <dt className="text-muted-foreground">Guest</dt>
                  <dd className="text-right font-medium">
                    {folio.guestId ? (
                      <Link
                        to="/restaurant/pms/guests/$guestId"
                        params={{ guestId: folio.guestId }}
                        className="text-[#8a6a1f] underline-offset-2 hover:underline"
                      >
                        {folio.guestName}
                      </Link>
                    ) : (
                      folio.guestName
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-1.5">
                  <dt className="text-muted-foreground">Reservation</dt>
                  <dd className="text-right font-medium">
                    {folio.reservationId ? (
                      <Link
                        to="/restaurant/pms/reservations/$reservationId"
                        params={{ reservationId: folio.reservationId }}
                        className="text-[#8a6a1f] underline-offset-2 hover:underline"
                      >
                        {folio.confirmationNumber ?? "Reservation"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <Field label="Room" value={roomLine(workspace)} />
                <Field label="Charge source" value={source ?? "—"} />
                <Field label="Type" value={labelTransactionType(row.type)} />
                <Field label="Posted at" value={dateTime(row.postedAt)} />
                <Field label="Posted by" value={row.postedBy ?? "—"} />
                <Field label="Currency" value={folio.currency} />
              </dl>
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Transaction id</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium text-[#8a6a1f]"
                    onClick={copyId}
                  >
                    <Copy className="size-3" /> Copy
                  </button>
                </div>
                <p className="mt-1 break-all font-mono text-foreground">{row.id}</p>
                {row.referenceType || row.referenceId ? (
                  <div className="mt-2 border-t border-[#E8E1D7] pt-2">
                    {row.referenceType ? (
                      <p>
                        <span className="text-muted-foreground">Reference </span>
                        {referenceTypeLabel(row.referenceType)}
                      </p>
                    ) : null}
                    {row.referenceId ? (
                      <p className="mt-1 break-all font-mono">{row.referenceId}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {row && tab === "corrections" ? (
            <div className="space-y-4">
              <p className="rounded-lg border border-[#E8E1D7] bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                Posted charges are not changed. Adjustment, discount, and transfer each add a new ledger line.
              </p>
              {quantity != null && unitAmount != null ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {quantity >= 2
                    ? `Changing ${quantity} to ${quantity - 1} is a new correction line, not an edit of the original ${quantity} × ${money(unitAmount)}.`
                    : `A quantity change is a new correction line, not an edit of the original ${money(unitAmount)}.`}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                {canAdjust ? (
                  <Button type="button" variant="outline" className="justify-start" onClick={onPostAdjustment}>
                    <SlidersHorizontal className="size-4 text-amber-700" /> Post Adjustment
                  </Button>
                ) : null}
                {canDiscount ? (
                  <Button type="button" variant="outline" className="justify-start" onClick={onApplyDiscount}>
                    <Tag className="size-4 text-purple-700" /> Apply Discount
                  </Button>
                ) : null}
                {canTransfer ? (
                  <Button type="button" variant="outline" className="justify-start" onClick={onTransferCharge}>
                    <ArrowLeftRight className="size-4" /> Transfer Charge
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {row && group && tab === "history" ? (
            <ol className="space-y-3">
              <li className="rounded-lg border border-[#E8E1D7] px-3 py-2.5">
                <p className="font-medium">{labelTransactionType(row.type)} posted</p>
                <p className="mt-0.5 text-muted-foreground">{row.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {money(row.amount)}
                  {" · "}
                  {row.postedBy ?? "—"}
                  {" · "}
                  {dateTime(row.postedAt)}
                </p>
              </li>
              {historyEvents(group, rows).map((event) => (
                <li key={event.id} className="rounded-lg border border-[#E8E1D7] px-3 py-2.5">
                  <p className="font-medium">{event.title}</p>
                  <p className="mt-0.5 text-muted-foreground">{event.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {money(event.amount)}
                    {" · "}
                    {event.postedBy ?? "—"}
                    {" · "}
                    {dateTime(event.postedAt)}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        <SheetFooter className="border-t border-[#E8E1D7] px-5 py-3 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
