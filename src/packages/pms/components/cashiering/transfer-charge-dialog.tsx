import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

import {
  chargeDepartment,
  chargeItemTitle,
  chargeQuantity,
  chargeUnitAmount,
} from "@/packages/pms/components/cashiering/charge-details-sheet";
import { FolioSearchFolioStatusBadge } from "@/packages/pms/components/cashiering/folio-bits";
import {
  listFolios,
  type FolioRow,
  type FolioWorkspace,
} from "@/packages/pms/lib/cashiering.functions";
import {
  listFolioWindows,
  listFinancialAccounts,
  postCrossLedgerTransfer,
  postFolioTransfer,
  type FinancialAccountRow,
} from "@/packages/pms/lib/cashiering-phases.functions";
import {
  chargeGroupRemainder,
  isParentTransferCharge,
  roundFolioMoney,
} from "@/packages/pms/lib/folio-workspace";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
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
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

function idempotencyKey(): string {
  return `xfer-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function roomLine(roomNumber: string | null, roomTypeName: string | null | undefined): string {
  const room = roomNumber ? `Room ${roomNumber}` : null;
  return [room, roomTypeName].filter(Boolean).join(" · ") || "—";
}

export function TransferChargeDialog({
  restaurantId,
  workspace,
  initialSourceId,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  workspace: FolioWorkspace;
  initialSourceId: string | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const folio = workspace.folio;
  const rows = folio.transactions;
  const sources = useMemo(
    () =>
      rows
        .filter((row) => isParentTransferCharge(row))
        .map((row) => ({ row, remainder: chargeGroupRemainder(row.id, rows) }))
        .filter((entry) => entry.remainder.grossRemaining > 0.009),
    [rows],
  );
  const [sourceId, setSourceId] = useState("");
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [destinationKind, setDestinationKind] = useState<"guest_folio" | "company" | "group">(
    "guest_folio",
  );
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [partial, setPartial] = useState("");
  const [reason, setReason] = useState("");
  const [idemKey, setIdemKey] = useState(idempotencyKey);

  useEffect(() => {
    if (!open) return;
    const first = sources.find((entry) => entry.row.id === initialSourceId) ?? sources[0];
    setSourceId(first?.row.id ?? "");
    setSearch("");
    setTargetId("");
    setDestinationKind("guest_folio");
    setMode("full");
    setPartial("");
    setReason("");
    setIdemKey(idempotencyKey());
    // A new open or a different charge starts a new posting. Field edits keep this key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSourceId]);

  const selected = sources.find((entry) => entry.row.id === sourceId) ?? null;
  const group = workspace.chargeGroups.find((entry) => entry.parent.id === sourceId) ?? null;
  const gross = selected?.remainder.grossRemaining ?? 0;
  const parsedPartial = Number(partial);
  const transferAmount = mode === "full" ? gross : parsedPartial;
  const amountValid =
    Number.isFinite(transferAmount) && transferAmount > 0 && transferAmount <= gross + 0.001;
  const remainingAfter = amountValid && selected ? roundFolioMoney(gross - transferAmount) : null;

  const fetchFolios = useServerFn(listFolios);
  const fetchWindows = useServerFn(listFolioWindows);
  const fetchAccounts = useServerFn(listFinancialAccounts);
  const postFolio = useServerFn(postFolioTransfer);
  const postAccount = useServerFn(postCrossLedgerTransfer);
  const foliosQuery = useQuery({
    queryKey: ["transfer-destination-folios", restaurantId, search],
    queryFn: () =>
      fetchFolios({
        data: { restaurantId, status: "open", search },
      }),
    enabled: open && destinationKind === "guest_folio",
    retry: false,
  });
  const targets = (foliosQuery.data ?? []).filter(
    (row) => row.id !== folio.id && row.status === "open" && row.currency === folio.currency,
  );
  const accountsQuery = useQuery({
    queryKey: ["transfer-destination-accounts", restaurantId, destinationKind],
    queryFn: () => fetchAccounts({ data: { restaurantId } }),
    enabled: open && destinationKind !== "guest_folio",
    retry: false,
  });
  const linkedMasterId =
    destinationKind === "company"
      ? folio.companyMasterId
      : destinationKind === "group"
        ? folio.groupAccountMasterId
        : null;
  const accountTargets = (accountsQuery.data ?? [])
    .filter(
      (row) =>
        row.accountKind === destinationKind &&
        row.status === "open" &&
        row.currency === folio.currency &&
        (search.trim() === "" ||
          row.masterName.toLowerCase().includes(search.trim().toLowerCase()) ||
          row.accountNumber.toLowerCase().includes(search.trim().toLowerCase())),
    )
    .sort((a, b) => Number(b.masterId === linkedMasterId) - Number(a.masterId === linkedMasterId));
  const accountDestination = accountTargets.find((row) => row.id === targetId) ?? null;
  const destination = targets.find((row) => row.id === targetId) ?? null;
  const windowsQuery = useQuery({
    queryKey: ["folio-windows", restaurantId, targetId],
    queryFn: () => fetchWindows({ data: { restaurantId, folioId: targetId } }),
    enabled: open && destinationKind === "guest_folio" && Boolean(targetId),
    retry: false,
  });
  const targetWindow =
    (windowsQuery.data ?? []).find((window) => window.isPrimary) ?? windowsQuery.data?.[0] ?? null;
  const creditLimit =
    destinationKind === "company" ? (accountDestination?.creditLimitAmount ?? null) : null;
  const projectedAccountBalance =
    accountDestination && amountValid
      ? roundFolioMoney(accountDestination.balance + transferAmount)
      : null;
  const creditBlocked =
    creditLimit != null && projectedAccountBalance != null && projectedAccountBalance > creditLimit + 0.001;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected || !group) throw new Error("Choose a charge to transfer.");
      if (!amountValid) throw new Error("Enter an amount within the remaining transferable total.");
      if (!reason.trim()) throw new Error("Enter a reason.");
      if (creditBlocked) throw new Error("That transfer would exceed the company credit limit.");
      if (destinationKind === "guest_folio") {
        if (!destination || !targetWindow) throw new Error("Choose an open destination folio.");
        return postFolio({
          data: {
            restaurantId,
            sourceFolioId: folio.id,
            targetFolioId: destination.id,
            sourceTransactionId: selected.row.id,
            targetWindowId: targetWindow.id,
            amount: roundFolioMoney(transferAmount),
            description: reason.trim(),
            idempotencyKey: idemKey,
          },
        });
      }
      if (!accountDestination) throw new Error("Choose an open destination account.");
      return postAccount({
        data: {
          restaurantId,
          sourceType: "guest_folio",
          sourceId: folio.id,
          sourceTransactionId: selected.row.id,
          destinationType: "financial_account",
          destinationId: accountDestination.id,
          amount: roundFolioMoney(transferAmount),
          description: reason.trim(),
          idempotencyKey: idemKey,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Transfer posted");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sourceBalance = workspace.financialSummary.currentBalance;
  const destinationBalance =
    destinationKind === "guest_folio" ? (destination?.balance ?? 0) : (accountDestination?.balance ?? 0);
  const moved = amountValid ? roundFolioMoney(transferAmount) : 0;
  const title = selected ? chargeItemTitle(selected.row) : "Charge";
  const department = selected ? chargeDepartment(selected.row) : null;
  const quantity = selected ? chargeQuantity(selected.row) : null;
  const unitAmount = selected ? chargeUnitAmount(selected.row) : null;
  const postingNow = dateTime(new Date().toISOString());
  const destinationReady =
    destinationKind === "guest_folio"
      ? Boolean(destination && targetWindow)
      : Boolean(accountDestination);
  const canPost =
    Boolean(destinationReady && selected && reason.trim() && amountValid) &&
    !creditBlocked &&
    !mutation.isPending &&
    (destinationKind !== "guest_folio" || !windowsQuery.isLoading);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="flex max-h-[88vh] w-[min(1000px,calc(100vw-2rem))] max-w-[1000px] flex-col gap-0 overflow-hidden border-[#E8E1D7] bg-[#fbf8f3] p-0 sm:max-w-[1000px]">
        <DialogHeader className="space-y-2 border-b border-[#E8E1D7] bg-card px-5 py-4 pr-12 text-left">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#C89933]/15 text-[#8a6a1f]">
              <ArrowLeftRight className="size-4" />
            </span>
            <DialogTitle className="text-base">Transfer Charge</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-foreground">
            {folio.folioNumber} · {folio.guestName}
            <span className="mt-0.5 block font-medium">{title}</span>
          </DialogDescription>
          <FolioSearchFolioStatusBadge status={folio.status} />
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="space-y-4">
            <section className="rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Selected charge
                </h3>
                {sources.length > 1 ? (
                  <Select value={sourceId} onValueChange={setSourceId}>
                    <SelectTrigger className="h-8 w-[220px]">
                      <SelectValue placeholder="Choose a charge" />
                    </SelectTrigger>
                    <SelectContent>
                      {sources.map((entry) => (
                        <SelectItem key={entry.row.id} value={entry.row.id}>
                          {chargeItemTitle(entry.row)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
              {selected && group ? (
                <dl className="space-y-1.5 text-sm">
                  <div>
                    <p className="font-semibold">{title}</p>
                    {department ? (
                      <p className="text-xs text-muted-foreground">{department}</p>
                    ) : null}
                  </div>
                  <MoneyLine label="Quantity" value={quantity == null ? "—" : String(quantity)} />
                  <MoneyLine
                    label="Unit price"
                    value={unitAmount == null ? "—" : money(unitAmount)}
                  />
                  <MoneyLine label="Net" value={money(group.net)} />
                  {group.children.map((child) => (
                    <MoneyLine
                      key={child.id}
                      label={child.description}
                      value={money(child.amount)}
                    />
                  ))}
                  <MoneyLine label="Total" value={money(group.total)} strong />
                  <MoneyLine label="Remaining transferable" value={money(gross)} strong />
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No posted charge can be transferred.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-sm">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Destination
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ["guest_folio", "Guest Folio"],
                    ["company", "Company"],
                    ["group", "Group"],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs",
                      destinationKind === kind
                        ? "border-[#C89933] bg-[#C89933]/10 text-[#251605]"
                        : "border-[#E8E1D7] text-muted-foreground",
                    )}
                    onClick={() => {
                      setDestinationKind(kind);
                      setTargetId("");
                      setSearch("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Label htmlFor="transfer-destination-search" className="sr-only">
                Search destination
              </Label>
              <Input
                id="transfer-destination-search"
                className="mt-3"
                value={search}
                placeholder={
                  destinationKind === "guest_folio"
                    ? "Search folio, guest, room or reservation..."
                    : destinationKind === "company"
                      ? "Search company name or account number..."
                      : "Search group name or account number..."
                }
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                {destinationKind === "guest_folio" ? (
                  foliosQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">Loading open folios…</p>
                  ) : targets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No other open folio in {folio.currency} matches that search.
                    </p>
                  ) : (
                    targets.map((row) => (
                      <DestinationCard
                        key={row.id}
                        row={row}
                        selected={row.id === targetId}
                        money={money}
                        onSelect={() => setTargetId(row.id)}
                      />
                    ))
                  )
                ) : accountsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading open accounts…</p>
                ) : accountTargets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No open {destinationKind} account in {folio.currency} matches that search.
                  </p>
                ) : (
                  accountTargets.map((row) => (
                    <AccountDestinationCard
                      key={row.id}
                      row={row}
                      linked={row.masterId === linkedMasterId}
                      selected={row.id === targetId}
                      money={money}
                      onSelect={() => setTargetId(row.id)}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-sm">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Transfer amount
              </h3>
              <div className="mt-3 space-y-2 text-sm">
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="transfer-amount-mode"
                    className="mt-1"
                    checked={mode === "full"}
                    onChange={() => setMode("full")}
                  />
                  <span>
                    <span className="font-medium">Full amount</span>
                    <span className="mt-0.5 block tabular-nums text-muted-foreground">
                      {money(gross)}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="transfer-amount-mode"
                    className="mt-1"
                    checked={mode === "partial"}
                    onChange={() => setMode("partial")}
                  />
                  <span className="block flex-1">
                    <span className="font-medium">Partial amount</span>
                    {mode === "partial" ? (
                      <Input
                        className="mt-2"
                        inputMode="decimal"
                        value={partial}
                        placeholder="0.00"
                        onChange={(event) => setPartial(event.target.value)}
                      />
                    ) : null}
                  </span>
                </label>
                {remainingAfter != null ? (
                  <p className="text-xs text-muted-foreground">
                    Remaining after transfer{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {money(remainingAfter)}
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="mt-4">
                <Label htmlFor="transfer-reason">Reason *</Label>
                <Textarea
                  id="transfer-reason"
                  className="mt-1.5"
                  maxLength={200}
                  value={reason}
                  placeholder="Why this charge is moving"
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Posting now {postingNow}</p>
            </section>
          </div>

          <aside className="h-fit rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-sm">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Transfer summary
            </h3>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">From</dt>
                <dd className="font-medium">{folio.guestName}</dd>
                <dd className="text-xs text-muted-foreground">
                  {folio.folioNumber} · {roomLine(folio.roomNumber, folio.roomTypeName)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">To</dt>
                <dd className="font-medium">
                  {destinationKind === "guest_folio"
                    ? (destination?.guestName ?? "—")
                    : (accountDestination?.masterName ?? "—")}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {destinationKind === "guest_folio"
                    ? destination
                      ? `${destination.folioNumber} · ${roomLine(destination.roomNumber, destination.roomTypeName)}`
                      : "Choose a destination folio"
                    : accountDestination
                      ? `${accountDestination.accountNumber} · ${accountDestination.accountKind}`
                      : "Choose a destination account"}
                </dd>
              </div>
              <MoneyLine label="Charge" value={title} />
              <MoneyLine label="Transfer" value={amountValid ? money(moved) : "—"} strong />
              <div>
                <dt className="text-xs text-muted-foreground">After transfer</dt>
                <dd className="mt-1 text-xs">
                  Source balance{" "}
                  <span className="tabular-nums">
                    {money(sourceBalance)} →{" "}
                    {amountValid ? money(roundFolioMoney(sourceBalance - moved)) : "—"}
                  </span>
                </dd>
                <dd className="text-xs">
                  Destination balance{" "}
                  <span className="tabular-nums">
                    {destinationKind === "guest_folio"
                      ? destination
                        ? money(destinationBalance)
                        : "—"
                      : accountDestination
                        ? money(destinationBalance)
                        : "—"}{" "}
                    →{" "}
                    {(destinationKind === "guest_folio" ? destination : accountDestination) &&
                    amountValid
                      ? money(roundFolioMoney(destinationBalance + moved))
                      : "—"}
                  </span>
                </dd>
                {destinationKind === "company" && creditLimit != null ? (
                  <dd className="mt-1 text-xs">
                    Credit limit <span className="tabular-nums">{money(creditLimit)}</span>
                    {projectedAccountBalance != null ? (
                      <>
                        {" · "}
                        Utilization after{" "}
                        <span className="tabular-nums">
                          {Math.round((projectedAccountBalance / creditLimit) * 100)}%
                        </span>
                      </>
                    ) : null}
                    {creditBlocked ? (
                      <span className="mt-1 block text-destructive">
                        Projected balance exceeds the company credit limit.
                      </span>
                    ) : null}
                  </dd>
                ) : null}
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Reason</dt>
                <dd>{reason.trim() || "—"}</dd>
              </div>
            </dl>
          </aside>
        </div>

        <DialogFooter className="border-t border-[#E8E1D7] bg-card px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
            disabled={!canPost}
            onClick={() => mutation.mutate()}
          >
            Transfer Charge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoneyLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", strong && "font-semibold text-foreground")}>
        {value}
      </dd>
    </div>
  );
}

function DestinationCard({
  row,
  selected,
  money,
  onSelect,
}: {
  row: FolioRow;
  selected: boolean;
  money: (value: number) => string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-lg border px-3 py-2 text-left",
        selected ? "border-[#C89933] bg-[#C89933]/8" : "border-[#E8E1D7] hover:bg-muted/30",
      )}
      onClick={onSelect}
    >
      <p className="text-sm font-medium">{row.guestName}</p>
      <p className="text-xs text-muted-foreground">
        {row.folioNumber}
        {row.roomNumber ? ` · ${roomLine(row.roomNumber, row.roomTypeName)}` : ""}
        {row.confirmationNumber ? ` · ${row.confirmationNumber}` : ""}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Current balance <span className="tabular-nums text-foreground">{money(row.balance)}</span>
        {" · "}
        {row.currency}
      </p>
    </button>
  );
}

function AccountDestinationCard({
  row,
  linked,
  selected,
  money,
  onSelect,
}: {
  row: FinancialAccountRow;
  linked: boolean;
  selected: boolean;
  money: (value: number) => string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-lg border px-3 py-2 text-left",
        selected ? "border-[#C89933] bg-[#C89933]/8" : "border-[#E8E1D7] hover:bg-muted/30",
      )}
      onClick={onSelect}
    >
      <p className="text-sm font-medium">{row.masterName}</p>
      <p className="text-xs text-muted-foreground">
        {row.accountNumber} · {row.accountKind} · {row.status}
      </p>
      {linked ? <p className="text-xs text-[#8a6a1f]">Linked to this stay</p> : null}
      <p className="mt-1 text-xs text-muted-foreground">
        Current balance <span className="tabular-nums text-foreground">{money(row.balance)}</span>
        {" · "}
        {row.currency}
      </p>
    </button>
  );
}
