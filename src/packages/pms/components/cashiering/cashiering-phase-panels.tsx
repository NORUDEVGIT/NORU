import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Building2,
  CircleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  CashieringMasterPicker,
  financialAccountKindFromMaster,
  type CashieringMasterKind,
} from "@/packages/pms/components/cashiering/cashiering-master-picker";
import {
  DeskActionPanel,
  DeskSection,
  DeskTwoColumn,
  FolioBalanceBlock,
  Kpi,
  StatusChip,
  TxnMark,
  shortRef,
} from "@/packages/pms/components/cashiering/cashiering-desk-shared";
import {
  allocateFolioDeposit,
  closeFinancialAccount,
  getCashieringReportTotals,
  listCashieringExceptions,
  listFinancialAccounts,
  listFolioWindows,
  openFinancialAccount,
  postFolioTransfer,
  postSettlementWriteOff,
  type CashieringExceptionRow,
  type FinancialAccountRow,
} from "@/packages/pms/lib/cashiering-phases.functions";
import type { CashieringDashboard, FolioDetail } from "@/packages/pms/lib/cashiering.functions";
import { BILLING_ROUTING_EXECUTABLE } from "@/packages/pms/lib/cashiering-transfer-model";
import { chargeGroupRemainder, isParentTransferCharge } from "@/packages/pms/lib/folio-workspace";
import { labelTransactionType } from "@/packages/pms/components/cashiering/folio-bits";
import type { GuestAccountSummary } from "@/packages/pms/lib/guest-profile-wave4";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

function idempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function TransfersPanel({
  restaurantId,
  folios,
  selected,
  canManage,
  money,
  dateTime,
  dashboard,
  onRefresh,
  onSelectFolio,
}: {
  restaurantId: string;
  folios: Array<{ id: string; folioNumber: string; guestName: string }>;
  selected: FolioDetail | null;
  canManage: boolean;
  money: (n: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  dashboard?: CashieringDashboard;
  onRefresh: () => void;
  onSelectFolio: (folioId: string) => void;
}) {
  const [sourceFolioId, setSourceFolioId] = useState(selected?.id ?? "");
  const [targetFolioId, setTargetFolioId] = useState("");
  const [sourceTxnId, setSourceTxnId] = useState("");
  const [targetWindowId, setTargetWindowId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (selected?.id) setSourceFolioId(selected.id);
  }, [selected?.id]);

  useEffect(() => {
    setTargetWindowId("");
  }, [targetFolioId]);

  const fetchWindows = useServerFn(listFolioWindows);
  const targetWindowsQuery = useQuery({
    queryKey: ["folio-windows", restaurantId, targetFolioId],
    queryFn: () => fetchWindows({ data: { restaurantId, folioId: targetFolioId } }),
    enabled: Boolean(targetFolioId),
  });

  const targetWindows = targetWindowsQuery.data ?? [];

  useEffect(() => {
    const windows = targetWindowsQuery.data;
    if (!windows || windows.length === 0) return;
    if (windows.length === 1) {
      setTargetWindowId(windows[0].id);
      return;
    }
    const primary = windows.find((w) => w.isPrimary) ?? windows[0];
    setTargetWindowId((prev) =>
      prev && windows.some((w) => w.id === prev) ? prev : primary.id,
    );
  }, [targetWindowsQuery.data]);

  const postTransfer = useServerFn(postFolioTransfer);
  const mutation = useMutation({
    mutationFn: () =>
      postTransfer({
        data: {
          restaurantId,
          sourceFolioId,
          targetFolioId,
          sourceTransactionId: sourceTxnId,
          targetWindowId,
          amount: Number(amount),
          description: reason.trim(),
          idempotencyKey: idempotencyKey("xfer"),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Transfer recorded as paired ledger lines.");
      setAmount("");
      setReason("");
      onRefresh();
    },
  });

  const sourceFolioDetail = selected && selected.id === sourceFolioId ? selected : null;
  const chargeLines = sourceFolioDetail
    ? sourceFolioDetail.transactions
        .filter((line) => isParentTransferCharge(line))
        .map((line) => ({
          line,
          gross: chargeGroupRemainder(line.id, sourceFolioDetail.transactions).grossRemaining,
        }))
        .filter((entry) => entry.gross > 0.009)
    : [];
  const transferLines = (sourceFolioDetail?.transactions ?? []).filter(
    (t) => t.type === "transfer_out" || t.type === "transfer_in",
  );

  return (
    <div className="space-y-4" data-testid="cashiering-transfers-panel">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          label="Open Folios"
          value={String(dashboard?.openFolios ?? "—")}
          hint="Eligible transfer sources"
          tone="blue"
        />
        <Kpi
          label="Transfers Supported"
          value={dashboard?.transfersSupported ? "Yes" : "No"}
          hint="Paired ledger rows"
          tone="teal"
        />
        <Kpi
          label="Routing Rules"
          value={BILLING_ROUTING_EXECUTABLE ? "Live" : "Not executed"}
          hint="Billing rules are setup hints only"
          tone="amber"
        />
      </div>
      <DeskTwoColumn>
        <DeskSection
          title={`Transfer activity (${transferLines.length})`}
          isEmpty={transferLines.length === 0}
          empty="No transfers on the selected source folio yet. Post a transfer pair from the sidebar."
        >
          <ul className="divide-y divide-border">
            {transferLines.map((line) => (
              <li key={line.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <TxnMark type={line.type} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{line.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {labelTransactionType(line.type)} · {shortRef(line.id)} ·{" "}
                    {dateTime(line.postedAt)}
                  </p>
                </div>
                <span className="tabular-nums">{money(line.amount)}</span>
              </li>
            ))}
          </ul>
        </DeskSection>
        <DeskActionPanel
          title="Post transfer pair"
          note="Move part of a charge between open guest folios. The original charge line stays posted."
          borderTone="transfer"
        >
          {!canManage ? (
            <p className="text-sm text-amber-800">Only an owner or manager can post transfers.</p>
          ) : null}
          <div className="space-y-3">
            <div>
              <Label>Source folio</Label>
              <Select
                value={sourceFolioId}
                onValueChange={(value) => {
                  setSourceFolioId(value);
                  onSelectFolio(value);
                  setSourceTxnId("");
                }}
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="Choose source folio" />
                </SelectTrigger>
                <SelectContent>
                  {folios.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.folioNumber} — {f.guestName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {sourceFolioDetail ? (
              <>
                <div>
                  <p className="font-medium">{sourceFolioDetail.guestName}</p>
                  <p className="text-xs text-muted-foreground">{sourceFolioDetail.folioNumber}</p>
                </div>
                <FolioBalanceBlock balance={sourceFolioDetail.balance} money={money} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a folio on the Folios tab to load charge lines.
              </p>
            )}
            <div>
              <Label>Target folio</Label>
              <Select value={targetFolioId} onValueChange={setTargetFolioId}>
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="Choose target folio" />
                </SelectTrigger>
                <SelectContent>
                  {folios
                    .filter((f) => f.id !== sourceFolioId)
                    .map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.folioNumber} — {f.guestName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {targetWindows.length === 1 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Posts to {targetWindows[0].label}
                </p>
              ) : null}
            </div>
            <div>
              <Label>Source charge line</Label>
              <Select
                value={sourceTxnId}
                onValueChange={(value) => {
                  setSourceTxnId(value);
                  const entry = chargeLines.find((item) => item.line.id === value);
                  if (entry) setAmount(String(entry.gross));
                }}
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="Choose charge to transfer from" />
                </SelectTrigger>
                <SelectContent>
                  {chargeLines.map((entry) => (
                    <SelectItem key={entry.line.id} value={entry.line.id}>
                      {entry.line.description} ({money(entry.gross)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {targetWindows.length > 1 ? (
              <div>
                <Label>Target window</Label>
                <Select value={targetWindowId} onValueChange={setTargetWindowId}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue placeholder="Choose target window" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetWindows.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label htmlFor="transfer-amount">Gross amount</Label>
              <Input
                id="transfer-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="min-h-11"
              />
            </div>
            <div>
              <Label htmlFor="transfer-reason">Reason</Label>
              <Input
                id="transfer-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-11"
              />
            </div>
            <Button
              type="button"
              className="min-h-11 w-full bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
              disabled={
                !canManage ||
                mutation.isPending ||
                !sourceFolioId ||
                !targetFolioId ||
                !sourceTxnId ||
                !targetWindowId ||
                !reason.trim()
              }
              onClick={() => mutation.mutate()}
            >
              Post transfer pair
            </Button>
          </div>
        </DeskActionPanel>
      </DeskTwoColumn>
    </div>
  );
}

export function AccountsPanel({
  restaurantId,
  canManage,
  money,
}: {
  restaurantId: string;
  canManage: boolean;
  money: (n: number) => string;
}) {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listFinancialAccounts);
  const accountsQuery = useQuery({
    queryKey: ["financial-accounts", restaurantId],
    queryFn: () => fetchAccounts({ data: { restaurantId } }),
  });

  const [masterKind, setMasterKind] = useState<CashieringMasterKind>("company");
  const [selectedMaster, setSelectedMaster] = useState<GuestAccountSummary | null>(null);
  const [currency, setCurrency] = useState("GBP");

  const openAccount = useServerFn(openFinancialAccount);
  const closeAccount = useServerFn(closeFinancialAccount);
  const writeOff = useServerFn(postSettlementWriteOff);

  const openMutation = useMutation({
    mutationFn: () => {
      if (!selectedMaster) {
        throw new Error("Choose a company or group master first.");
      }
      return openAccount({
        data: {
          restaurantId,
          masterId: selectedMaster.id,
          accountKind: financialAccountKindFromMaster(selectedMaster),
          currency,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Financial account opened.");
      setSelectedMaster(null);
      void queryClient.invalidateQueries({ queryKey: ["financial-accounts", restaurantId] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (accountId: string) => closeAccount({ data: { restaurantId, accountId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Account closed at zero balance.");
      void queryClient.invalidateQueries({ queryKey: ["financial-accounts", restaurantId] });
    },
  });

  const writeOffMutation = useMutation({
    mutationFn: (input: { accountId: string; amount: number }) =>
      writeOff({
        data: {
          restaurantId,
          accountId: input.accountId,
          amount: input.amount,
          reason: "Authorized settlement write-off",
          idempotencyKey: idempotencyKey("woff"),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Write-off posted.");
      void queryClient.invalidateQueries({ queryKey: ["financial-accounts", restaurantId] });
    },
  });

  const rows = accountsQuery.data ?? [];
  const openRows = rows.filter((row) => row.status === "open");
  const outstanding = openRows.reduce(
    (sum, row) => sum + (row.balance > 0 ? row.balance : 0),
    0,
  );
  const existingFinancialAccount = selectedMaster
    ? rows.find((row) => row.masterId === selectedMaster.id)
    : undefined;

  return (
    <div className="space-y-4" data-testid="cashiering-accounts-panel">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          label="Open Accounts"
          value={String(openRows.length)}
          hint={`${rows.length} total`}
          tone="blue"
          icon={Building2}
        />
        <Kpi
          label="Outstanding"
          value={money(outstanding)}
          hint="Sum of positive open balances"
          tone="gold"
          icon={Wallet}
        />
        <Kpi
          label="Account Types"
          value="Company / Group"
          hint="Not Guest Profile stay aggregates"
          tone="teal"
        />
      </div>
      <DeskTwoColumn>
        <DeskSection
          title={`Financial accounts (${rows.length})`}
          loading={accountsQuery.isLoading}
          error={accountsQuery.isError ? (accountsQuery.error as Error).message : null}
          isEmpty={rows.length === 0}
          empty="No financial account yet. Open one from a company or group in Guest Profile."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Master</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: FinancialAccountRow) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{row.accountNumber}</td>
                    <td className="px-3 py-2">{row.masterName}</td>
                    <td className="px-3 py-2 capitalize">{row.accountKind}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(row.balance)}</td>
                    <td className="px-3 py-2">
                      <StatusChip
                        label={row.status === "open" ? "Open" : "Closed"}
                        tone={row.status === "open" ? "green" : "muted"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {canManage && row.status === "open" ? (
                        <div className="flex flex-wrap gap-2">
                          {Math.abs(row.balance) >= 0.01 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-h-11 sm:min-h-8"
                              onClick={() =>
                                writeOffMutation.mutate({ accountId: row.id, amount: row.balance })
                              }
                            >
                              Write off
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-h-11 sm:min-h-8"
                              onClick={() => closeMutation.mutate(row.id)}
                            >
                              Close
                            </Button>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DeskSection>
        <DeskActionPanel
          title="Open financial account"
          note="Real company, group, or master billing accounts — not Guest Profile stay aggregates."
          borderTone="account"
        >
          {!canManage ? (
            <p className="text-sm text-amber-800">Only an owner or manager can open accounts.</p>
          ) : (
            <div className="space-y-3">
              <CashieringMasterPicker
                restaurantId={restaurantId}
                masterKind={masterKind}
                onMasterKindChange={setMasterKind}
                selected={selectedMaster}
                onSelectedChange={setSelectedMaster}
              />
              {existingFinancialAccount ? (
                <p className="text-sm text-amber-800">
                  Financial account already open ({existingFinancialAccount.accountNumber}
                  {existingFinancialAccount.status === "closed" ? ", closed" : ""}).
                </p>
              ) : null}
              <div>
                <Label htmlFor="account-currency">Currency</Label>
                <Input
                  id="account-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="min-h-11"
                />
              </div>
              <Button
                type="button"
                className="min-h-11 w-full bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
                disabled={
                  !selectedMaster || Boolean(existingFinancialAccount) || openMutation.isPending
                }
                onClick={() => openMutation.mutate()}
              >
                Open account
              </Button>
            </div>
          )}
        </DeskActionPanel>
      </DeskTwoColumn>
    </div>
  );
}

export function DepositAllocationForm({
  restaurantId,
  selected,
  canManage,
  money,
  onRefresh,
}: {
  restaurantId: string;
  selected: FolioDetail | null;
  canManage: boolean;
  money: (n: number) => string;
  onRefresh: () => void;
}) {
  const [depositId, setDepositId] = useState("");
  const [chargeId, setChargeId] = useState("");
  const [amount, setAmount] = useState("");

  const allocate = useServerFn(allocateFolioDeposit);
  const mutation = useMutation({
    mutationFn: () =>
      allocate({
        data: {
          restaurantId,
          depositTransactionId: depositId,
          chargeTransactionId: chargeId,
          amount: Number(amount),
          idempotencyKey: idempotencyKey("alloc"),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Deposit allocation recorded.");
      setAmount("");
      onRefresh();
    },
  });

  const deposits = selected?.transactions.filter((t) => t.type === "deposit") ?? [];
  const charges = selected?.transactions.filter((t) => t.type === "charge") ?? [];

  useEffect(() => {
    setDepositId("");
    setChargeId("");
    setAmount("");
  }, [selected?.id]);

  return (
    <DeskActionPanel
      title="Allocate deposit credit"
      note="Unallocated remainder is derived — not a stored balance."
      borderTone="deposit"
      testId="deposit-allocation"
    >
      {!selected ? (
        <p className="text-sm text-muted-foreground">
          Select a folio from the ledger or Folios tab to allocate deposit credits.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="font-medium">{selected.guestName}</p>
            <p className="text-xs text-muted-foreground">{selected.folioNumber}</p>
          </div>
          {!canManage ? (
            <p className="text-xs text-amber-800">Only an owner or manager can allocate.</p>
          ) : null}
          <div>
            <Label>Deposit line</Label>
            <Select value={depositId} onValueChange={setDepositId}>
              <SelectTrigger className="min-h-11">
                <SelectValue placeholder="Choose deposit" />
              </SelectTrigger>
              <SelectContent>
                {deposits.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.description} ({money(Math.abs(d.amount))})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Charge line</Label>
            <Select value={chargeId} onValueChange={setChargeId}>
              <SelectTrigger className="min-h-11">
                <SelectValue placeholder="Choose charge" />
              </SelectTrigger>
              <SelectContent>
                {charges.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.description} ({money(c.amount)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="alloc-amount">Amount</Label>
            <Input
              id="alloc-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="min-h-11"
            />
          </div>
          <Button
            type="button"
            className="min-h-11 w-full bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
            disabled={!canManage || mutation.isPending || !depositId || !chargeId || !amount}
            onClick={() => mutation.mutate()}
          >
            Allocate
          </Button>
        </div>
      )}
    </DeskActionPanel>
  );
}

function ExceptionCard({
  row,
  money,
  dateTime,
  icon: Icon,
  tone,
}: {
  row: CashieringExceptionRow;
  money: (n: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  icon: LucideIcon;
  tone: "destructive" | "amber";
}) {
  return (
    <li
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        tone === "destructive" ? "border-rose-200" : "border-amber-200",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-md",
            tone === "destructive" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          {row.kind === "unsettled_checkout" ? (
            <>
              <p className="font-medium">Unsettled checkout — {row.folioNumber}</p>
              <p
                className={cn(
                  "mt-1 text-sm",
                  tone === "destructive" ? "text-destructive" : "text-amber-900",
                )}
              >
                Balance {money(row.balance ?? 0)}. {row.reason ?? "No reason recorded."}
              </p>
              {row.at ? (
                <p className="mt-1 text-xs text-muted-foreground">{dateTime(row.at)}</p>
              ) : null}
              {row.folioId ? (
                <Button
                  asChild
                  size="sm"
                  className="mt-3 min-h-11 bg-[#C89933] text-[#251605] hover:bg-[#B5882D] sm:min-h-9"
                >
                  <Link
                    to="/restaurant/pms/cashiering/folios/$folioId"
                    params={{ folioId: row.folioId }}
                  >
                    Open folio
                  </Link>
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <p className="font-medium">Drawer variance</p>
              <p className="mt-1 text-sm text-amber-900">
                Variance {money(row.variance ?? 0)}
                {row.shiftId ? ` · Shift ${shortRef(row.shiftId)}` : ""}
              </p>
              {row.at ? (
                <p className="mt-1 text-xs text-muted-foreground">Closed {dateTime(row.at)}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function ExceptionsPanel({
  restaurantId,
  money,
  dateTime,
}: {
  restaurantId: string;
  money: (n: number) => string;
  dateTime: (iso: string | null | undefined) => string;
}) {
  const fetchExceptions = useServerFn(listCashieringExceptions);
  const query = useQuery({
    queryKey: ["cashiering-exceptions", restaurantId],
    queryFn: () => fetchExceptions({ data: { restaurantId } }),
  });

  const rows = query.data ?? [];
  const unsettled = rows.filter((row) => row.kind === "unsettled_checkout");
  const variances = rows.filter((row) => row.kind === "drawer_variance");

  return (
    <div className="space-y-4" data-testid="cashiering-exceptions-panel">
      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi
          label="Unsettled Checkouts"
          value={String(unsettled.length)}
          hint="Open folios after checkout override"
          tone="rose"
          icon={CircleAlert}
        />
        <Kpi
          label="Drawer Variances"
          value={String(variances.length)}
          hint="Last 7 days"
          tone="amber"
          icon={Wallet}
        />
      </div>
      <DeskSection
        title={`Open exceptions (${rows.length})`}
        loading={query.isLoading}
        error={query.isError ? (query.error as Error).message : null}
        isEmpty={rows.length === 0}
        empty="No open exceptions. Cleared only by a real settling post — not a manual resolved flag."
      >
        <ul className="space-y-3 p-4">
          {rows.map((row: CashieringExceptionRow, index) => (
            <ExceptionCard
              key={`${row.kind}-${row.folioId ?? row.shiftId}-${index}`}
              row={row}
              money={money}
              dateTime={dateTime}
              icon={row.kind === "unsettled_checkout" ? CircleAlert : ArrowLeftRight}
              tone={row.kind === "unsettled_checkout" ? "destructive" : "amber"}
            />
          ))}
        </ul>
      </DeskSection>
    </div>
  );
}

export function ReportsPanel({
  restaurantId,
  money,
  timezone,
}: {
  restaurantId: string;
  money: (n: number) => string;
  timezone: string;
}) {
  const today = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, [timezone]);

  const from = `${today}T00:00:00.000Z`;
  const to = `${today}T23:59:59.999Z`;

  const fetchTotals = useServerFn(getCashieringReportTotals);
  const query = useQuery({
    queryKey: ["cashiering-reports", restaurantId, from, to],
    queryFn: () => fetchTotals({ data: { restaurantId, from, to } }),
  });

  const totals = query.data;

  return (
    <div className="space-y-4" data-testid="cashiering-reports-panel">
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading ledger totals…</p>
      ) : null}
      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Charges" value={money(totals.charges)} tone="blue" />
          <Kpi label="Payments" value={money(totals.payments)} tone="green" />
          <Kpi label="Deposits" value={money(totals.deposits)} tone="gold" />
          <Kpi label="Refunds" value={money(totals.refunds)} tone="rose" />
          <Kpi label="Adjustments" value={money(totals.adjustments)} tone="amber" />
          <Kpi label="Discounts" value={money(totals.discounts)} tone="amber" />
          <Kpi label="Transfers Out" value={money(totals.transfersOut)} tone="teal" />
          <Kpi label="Transfers In" value={money(totals.transfersIn)} tone="teal" />
          <Kpi
            label="Line Count"
            value={String(totals.lineCount)}
            hint="Canonical folio_transactions"
            tone="blue"
          />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Sums of canonical folio_transactions for the property today. Not a GL trial balance.
      </p>
    </div>
  );
}
