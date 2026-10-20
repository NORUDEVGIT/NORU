import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Lock,
  MoreHorizontal,
  Plus,
  Printer,
  Receipt,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRestaurantSettings } from "@/core/state/property-format";
import { CashieringPrintLayer } from "@/packages/pms/components/cashiering/cashiering-print-layer";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

import {
  CashieringMasterPicker,
  financialAccountKindFromMaster,
  type CashieringMasterKind,
} from "@/packages/pms/components/cashiering/cashiering-master-picker";
import { AccountReturnTransferDialog } from "@/packages/pms/components/cashiering/account-return-transfer-dialog";
import {
  DeskActionPanel,
  DeskSection,
  DeskTwoColumn,
  FolioBalanceBlock,
  Kpi,
  StatusChip,
  TxnMark,
  methodLabel,
  shortRef,
} from "@/packages/pms/components/cashiering/cashiering-desk-shared";
import {
  allocateFolioDeposit,
  buildCashieringReportCsv,
  closeFinancialAccount,
  getCashieringReportTotals,
  listCashieringExceptions,
  listFinancialAccounts,
  getMasterBillingCurrency,
  listFolioWindows,
  openFinancialAccount,
  postFolioTransfer,
  postSettlementWriteOff,
  type CashieringExceptionRow,
  type CashieringReportLine,
  type FinancialAccountRow,
} from "@/packages/pms/lib/cashiering-phases.functions";
import type { FolioDetail } from "@/packages/pms/lib/cashiering.functions";
import { BILLING_ROUTING_EXECUTABLE } from "@/packages/pms/lib/cashiering-transfer-model";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
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
  dashboard?: {
    openFolios?: number;
    transfersSupported?: boolean;
  };
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
    setTargetWindowId((prev) => (prev && windows.some((w) => w.id === prev) ? prev : primary.id));
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
  const navigate = useNavigate();
  const { currencyCode: propertyCurrency } = useRestaurantSettings();
  const fetchAccounts = useServerFn(listFinancialAccounts);
  const fetchMasterCurrency = useServerFn(getMasterBillingCurrency);
  const accountsQuery = useQuery({
    queryKey: ["financial-accounts", restaurantId],
    queryFn: () => fetchAccounts({ data: { restaurantId } }),
  });

  const [masterKind, setMasterKind] = useState<CashieringMasterKind>("company");
  const [selectedMaster, setSelectedMaster] = useState<GuestAccountSummary | null>(null);
  const [currency, setCurrency] = useState(propertyCurrency);
  const [currencyEdited, setCurrencyEdited] = useState(false);
  const [transferAccount, setTransferAccount] = useState<FinancialAccountRow | null>(null);
  const masterCurrencyQuery = useQuery({
    queryKey: ["financial-account-master-currency", restaurantId, selectedMaster?.id],
    queryFn: () =>
      fetchMasterCurrency({
        data: { restaurantId, masterId: selectedMaster!.id },
      }),
    enabled: Boolean(selectedMaster),
  });
  const savedMasterCurrency = masterCurrencyQuery.data?.currency ?? null;

  useEffect(() => {
    setCurrencyEdited(false);
    setCurrency(propertyCurrency);
  }, [selectedMaster?.id, propertyCurrency]);

  useEffect(() => {
    if (currencyEdited || !selectedMaster || !masterCurrencyQuery.isSuccess) return;
    setCurrency(savedMasterCurrency || propertyCurrency);
  }, [
    currencyEdited,
    masterCurrencyQuery.isSuccess,
    propertyCurrency,
    savedMasterCurrency,
    selectedMaster,
  ]);

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
      if (result.id) {
        void navigate({
          to: "/restaurant/pms/cashiering/accounts/$accountId",
          params: { accountId: result.id },
        });
      }
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

  const [openModal, setOpenModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");

  const rows = accountsQuery.data ?? [];
  const openRows = rows.filter((row) => row.status === "open");
  const outstanding = openRows.reduce((sum, row) => sum + (row.balance > 0 ? row.balance : 0), 0);
  const existingFinancialAccount = selectedMaster
    ? rows.find((row) => row.masterId === selectedMaster.id)
    : undefined;

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        row.accountNumber.toLowerCase().includes(q) ||
        row.masterName.toLowerCase().includes(q) ||
        row.accountKind.toLowerCase().includes(q)
      );
    });
  }, [rows, statusFilter, search]);

  return (
    <div className="space-y-4" data-testid="cashiering-accounts-panel">
      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          label="Open Accounts"
          value={String(openRows.length)}
          hint={`${rows.length} total accounts`}
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
          icon={Users}
        />
      </div>

      {/* Action & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#E8E1D7] bg-white p-3 shadow-2xs">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7A7167]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account number or company/group..."
              className="h-9 pl-9 text-xs border-[#E8E1D7] focus-visible:border-[#C89933] focus-visible:ring-1 focus-visible:ring-[#C89933]"
            />
          </div>
          <div className="flex items-center gap-1">
            {(["all", "open", "closed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-lg capitalize transition-colors",
                  statusFilter === s
                    ? "bg-[#FAF5EB] text-[#8A6A24] border border-[#EADFCB]"
                    : "text-[#7A7167] hover:bg-[#FAF8F4]",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {canManage ? (
          <Button
            type="button"
            onClick={() => setOpenModal(true)}
            className="h-9 gap-1.5 bg-[#C89933] text-[#251605] hover:bg-[#B5882D] text-xs font-semibold px-3.5 shadow-2xs shrink-0"
          >
            <Plus className="size-4" /> Open Financial Account
          </Button>
        ) : null}
      </div>

      {/* Full-width Financial Accounts Table */}
      <div className="rounded-xl border border-[#E8E1D7] bg-white shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#251605]">
            Financial Accounts ({filteredRows.length})
          </h3>
          <span className="text-xs text-[#7A7167] font-medium">{openRows.length} active</span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#7A7167] italic">
            {rows.length === 0
              ? "No financial account yet. Open one from a company or group in Guest Profile."
              : "No accounts match your filter criteria."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-xs">
              <thead className="bg-[#FAF8F4] text-left text-[10px] uppercase tracking-wide text-[#7A7167] border-b border-[#E8E1D7]">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Account</th>
                  <th className="px-3 py-2.5 font-medium">Master Entity</th>
                  <th className="px-3 py-2.5 font-medium">Kind</th>
                  <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]">
                {filteredRows.map((row: FinancialAccountRow) => (
                  <tr
                    key={row.id}
                    className="hover:bg-[#FAF6EC] cursor-pointer transition-colors group"
                    onClick={() =>
                      void navigate({
                        to: "/restaurant/pms/cashiering/accounts/$accountId",
                        params: { accountId: row.id },
                      })
                    }
                  >
                    <td className="px-3 py-2.5 font-medium">
                      <Link
                        to="/restaurant/pms/cashiering/accounts/$accountId"
                        params={{ accountId: row.id }}
                        className="font-semibold text-[#8A6A24] group-hover:underline inline-flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.accountNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex size-6 items-center justify-center rounded-md bg-[#FAF5EB] text-[#8A6A24]">
                          {row.accountKind === "group" ? (
                            <Users className="size-3.5" />
                          ) : (
                            <Building2 className="size-3.5" />
                          )}
                        </div>
                        <Link
                          to="/restaurant/pms/cashiering/accounts/$accountId"
                          params={{ accountId: row.id }}
                          className="font-semibold text-[#251605] group-hover:text-[#8A6A24] group-hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.masterName}
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-block rounded-md bg-[#FAF8F4] px-2 py-0.5 text-[10px] font-semibold text-[#5F554B] border border-[#E8E1D7] capitalize">
                        {row.accountKind}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                      <span
                        className={
                          row.balance > 0.009
                            ? "text-[#B91C1C]"
                            : row.balance < -0.009
                              ? "text-[#146C43]"
                              : "text-[#251605]"
                        }
                      >
                        {money(row.balance)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                          row.status === "open"
                            ? "bg-[#E7F6EE] text-[#146C43] border-[#A3E0C1]"
                            : "bg-[#F5F2EC] text-[#7A7167] border-[#E0D7CA]",
                        )}
                      >
                        {row.status === "open" ? "Open" : "Closed"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div
                        className="flex items-center justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 rounded-lg text-[#736B5E] hover:bg-[#F2ECE1] hover:text-[#251605]"
                              aria-label={`Actions for account ${row.accountNumber}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-48 bg-white border border-[#E8E1D7] shadow-md rounded-xl p-1"
                          >
                            <DropdownMenuItem
                              className="cursor-pointer gap-2 rounded-lg text-xs font-medium text-[#251605] hover:bg-[#FAF8F4]"
                              onClick={() =>
                                void navigate({
                                  to: "/restaurant/pms/cashiering/accounts/$accountId",
                                  params: { accountId: row.id },
                                })
                              }
                            >
                              <FolderOpen className="size-3.5 text-[#8A6A24]" />
                              <span>Open Workspace</span>
                            </DropdownMenuItem>

                            {canManage && row.status === "open" ? (
                              <>
                                <DropdownMenuItem
                                  className="cursor-pointer gap-2 rounded-lg text-xs font-medium text-[#251605] hover:bg-[#FAF8F4]"
                                  onClick={() => setTransferAccount(row)}
                                >
                                  <Receipt className="size-3.5 text-[#736B5E]" />
                                  <span>Review Charges</span>
                                </DropdownMenuItem>

                                <DropdownMenuSeparator className="my-1 bg-[#E8E1D7]" />

                                {Math.abs(row.balance) >= 0.01 ? (
                                  <DropdownMenuItem
                                    className="cursor-pointer gap-2 rounded-lg text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2]"
                                    onClick={() =>
                                      writeOffMutation.mutate({
                                        accountId: row.id,
                                        amount: row.balance,
                                      })
                                    }
                                  >
                                    <Coins className="size-3.5 text-[#B91C1C]" />
                                    <span>Write Off Balance</span>
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    className="cursor-pointer gap-2 rounded-lg text-xs font-medium text-[#7A7167] hover:bg-[#FAF8F4]"
                                    onClick={() => closeMutation.mutate(row.id)}
                                  >
                                    <Lock className="size-3.5 text-[#7A7167]" />
                                    <span>Close Account</span>
                                  </DropdownMenuItem>
                                )}
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Open Financial Account */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-h-[92vh] sm:max-w-lg overflow-hidden p-0 rounded-2xl border border-[#E8E1D7] bg-[#FAF8F5] shadow-2xl flex flex-col">
          <DialogHeader className="shrink-0 border-b border-[#E8E1D7] bg-white px-6 py-4">
            <div className="flex items-center gap-3.5">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#E5DECE] bg-[#F4E9D0] text-[#765719] shadow-xs">
                <Building2 className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg font-bold tracking-tight text-[#251605]">
                  Open Financial Account
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7A6B58] mt-0.5">
                  Establish an official corporate or group billing ledger for master charges and invoicing.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {!canManage ? (
            <div className="p-6">
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-900">
                Only a cashiering manager or administrator can open new financial accounts.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#FAF8F5]">
              <CashieringMasterPicker
                restaurantId={restaurantId}
                masterKind={masterKind}
                onMasterKindChange={setMasterKind}
                selected={selectedMaster}
                onSelectedChange={setSelectedMaster}
              />

              {existingFinancialAccount ? (
                <div className="rounded-xl bg-[#FFFBEB] p-3.5 border border-[#FCD34D] text-xs text-amber-900 flex items-center justify-between gap-2 shadow-2xs">
                  <div>
                    <span className="font-semibold">Account already exists:</span>{" "}
                    {existingFinancialAccount.accountNumber}
                    {existingFinancialAccount.status === "closed" ? " (Closed)" : ""}
                  </div>
                  <Link
                    to="/restaurant/pms/cashiering/accounts/$accountId"
                    params={{ accountId: existingFinancialAccount.id }}
                    className="font-bold text-[#8A641A] underline underline-offset-2 shrink-0 hover:text-[#725315]"
                  >
                    Open Workspace →
                  </Link>
                </div>
              ) : null}

              {/* Billing Currency Card */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="account-currency" className="text-xs font-semibold text-[#251605]">
                    Billing Currency
                  </Label>
                  <div className="flex gap-1">
                    {["ETB", "USD", "EUR"].map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          setCurrencyEdited(true);
                          setCurrency(code);
                        }}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
                          currency === code
                            ? "border-[#C89933] bg-[#FAF5EB] text-[#8A641A]"
                            : "border-[#E8E1D7] text-[#7A6B58] hover:bg-[#FAF8F5]",
                        )}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  id="account-currency"
                  value={currency}
                  maxLength={3}
                  onChange={(e) => {
                    setCurrencyEdited(true);
                    setCurrency(e.target.value.toUpperCase());
                  }}
                  className="h-9 text-xs font-semibold uppercase tracking-wider"
                />

                {selectedMaster ? (
                  <p className="text-[11px] text-[#7A6B58] leading-relaxed">
                    {savedMasterCurrency
                      ? `Inherited from ${selectedMaster.accountType === "group" ? "group" : "company"} profile. You may customize this account's currency before opening.`
                      : masterCurrencyQuery.isSuccess
                        ? "No default currency saved on profile; defaulting to hotel property currency."
                        : "Detecting default currency from profile…"}
                  </p>
                ) : null}
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 border-t border-[#E8E1D7] bg-white px-6 py-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpenModal(false)}
              className="h-9 border-[#DDD4C5] text-xs hover:bg-[#FAF8F5]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 bg-[#8A641A] text-white hover:bg-[#735315] font-semibold px-4 text-xs shadow-xs"
              disabled={
                !selectedMaster || Boolean(existingFinancialAccount) || openMutation.isPending
              }
              onClick={() => openMutation.mutate()}
            >
              {openMutation.isPending ? "Opening Account…" : "Open Financial Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AccountReturnTransferDialog
        restaurantId={restaurantId}
        account={transferAccount}
        open={transferAccount != null}
        onClose={() => setTransferAccount(null)}
        onDone={() =>
          void queryClient.invalidateQueries({ queryKey: ["financial-accounts", restaurantId] })
        }
        money={money}
      />
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

function attentionPreview(rows: CashieringExceptionRow[]): CashieringExceptionRow[] {
  const unsettled = rows.filter((row) => row.kind === "unsettled_checkout");
  const variances = rows.filter((row) => row.kind === "drawer_variance");
  if (unsettled.length > 0 && variances.length > 0) {
    const checkoutRows = unsettled.slice(0, 2);
    return [...checkoutRows, ...variances.slice(0, 3 - checkoutRows.length)];
  }
  return rows.slice(0, 3);
}

export function AttentionRequired({
  restaurantId,
  money,
  dateTime,
  onOpenShift,
}: {
  restaurantId: string;
  money: (n: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onOpenShift: (shiftId?: string) => void;
}) {
  const fetchExceptions = useServerFn(listCashieringExceptions);
  const query = useQuery({
    queryKey: ["cashiering-exceptions", restaurantId],
    queryFn: () => fetchExceptions({ data: { restaurantId } }),
  });

  const rows = query.data ?? [];
  const unsettled = rows.filter((row) => row.kind === "unsettled_checkout").length;
  const variances = rows.filter((row) => row.kind === "drawer_variance").length;
  const preview = attentionPreview(rows);

  return (
    <div className="space-y-3" data-testid="cashiering-attention-required">
      <dl className="grid grid-cols-2 gap-2">
        <div>
          <dt className="text-[11px] font-medium text-[#7A7167]">Unsettled checkouts</dt>
          <dd className="font-display text-sm font-bold tabular-nums text-[#251605]">
            {query.isLoading ? "…" : query.isError ? "—" : unsettled}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-[#7A7167]">Drawer variances</dt>
          <dd className="font-display text-sm font-bold tabular-nums text-[#251605]">
            {query.isLoading ? "…" : query.isError ? "—" : variances}
          </dd>
        </div>
      </dl>
      {query.isError ? (
        <p className="text-xs text-destructive">{(query.error as Error).message}</p>
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <p className="text-xs text-[#7A7167]">
          Nothing needs attention. Cleared only by a real settling post — not a manual resolved
          flag.
        </p>
      ) : null}
      {preview.length > 0 ? (
        <ul className="space-y-2">
          {preview.map((row, index) => (
            <li
              key={`${row.kind}-${row.folioId ?? row.shiftId}-${index}`}
              className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4]/40 p-2"
            >
              {row.kind === "unsettled_checkout" ? (
                <>
                  <p className="text-xs font-semibold text-[#251605]">
                    Unsettled checkout — {row.folioNumber}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#7A7167]">
                    Balance {money(row.balance ?? 0)}
                    {row.at ? ` · ${dateTime(row.at)}` : ""}
                  </p>
                  {row.folioId ? (
                    <Button
                      asChild
                      size="sm"
                      className="mt-2 h-8 bg-[#C89933] text-xs text-[#251605] hover:bg-[#B5882D]"
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
                  <p className="text-xs font-semibold text-[#251605]">Drawer variance</p>
                  <p className="mt-0.5 text-[11px] text-[#7A7167]">
                    Variance {money(row.variance ?? 0)}
                    {row.shiftId ? ` · Shift ${shortRef(row.shiftId)}` : ""}
                    {row.at ? ` · Closed ${dateTime(row.at)}` : ""}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2 h-8 bg-[#C89933] text-xs text-[#251605] hover:bg-[#B5882D]"
                    onClick={() => onOpenShift(row.shiftId)}
                  >
                    Open Cashier Shift
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {!query.isLoading && rows.length > preview.length ? (
        <p className="text-[11px] text-[#7A7167]">
          Showing {preview.length} of {rows.length}
        </p>
      ) : null}
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
  const { currencyCode } = useRestaurantSettings();
  const businessDate = usePropertyBusinessDate(restaurantId, timezone);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printLines, setPrintLines] = useState<CashieringReportLine[] | null>(null);

  useEffect(() => {
    if (!businessDate) return;
    setFromDate((current) => current || businessDate);
    setToDate((current) => current || businessDate);
  }, [businessDate]);

  useEffect(() => {
    if (!printing) return;
    const handleAfterPrint = () => {
      setPrinting(false);
      setPrintLines(null);
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [printing]);

  const fetchTotals = useServerFn(getCashieringReportTotals);
  const query = useQuery({
    queryKey: ["cashiering-reports", restaurantId, fromDate, toDate, page, limit],
    queryFn: () => fetchTotals({ data: { restaurantId, fromDate, toDate, page, limit } }),
    enabled: Boolean(fromDate && toDate),
  });
  const report = query.data;
  const totals = report?.totals;

  async function exportReport(scope: "all" | "page") {
    if (!report) return;
    setExporting(true);
    try {
      let linesToExport = report.lines;
      if (scope === "all" && report.total > report.lines.length) {
        const full = await fetchTotals({
          data: { restaurantId, fromDate, toDate, page: 1, limit: 5000 },
        });
        linesToExport = full.lines;
      }
      const csv = buildCashieringReportCsv({
        restaurantId,
        fromDate,
        toDate,
        totals: report.totals,
        lines: linesToExport,
        currencyCode,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cashiering-report-${fromDate}-to-${toDate}${scope === "page" ? `-page${report.page}` : ""}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${linesToExport.length} transaction${linesToExport.length === 1 ? "" : "s"} to CSV`,
      );
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  async function handlePrint() {
    if (!report) return;
    setExporting(true);
    try {
      let linesToPrint = report.lines;
      if (report.total > report.lines.length) {
        const full = await fetchTotals({
          data: { restaurantId, fromDate, toDate, page: 1, limit: 5000 },
        });
        linesToPrint = full.lines;
      }
      setPrintLines(linesToPrint);
      setPrinting(true);
      window.setTimeout(() => {
        window.print();
      }, 100);
    } catch (err) {
      toast.error(`Print setup failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="cashiering-reports-panel">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#DDD4C5] bg-card p-3">
        <div>
          <Label htmlFor="report-from">From</Label>
          <Input
            id="report-from"
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label htmlFor="report-to">To</Label>
          <Input
            id="report-to"
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!businessDate) return;
            setFromDate(businessDate);
            setToDate(businessDate);
            setPage(1);
          }}
        >
          Today
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="report-limit-top" className="text-xs text-muted-foreground whitespace-nowrap">
              Limit:
            </Label>
            <select
              id="report-limit-top"
              aria-label="Rows per page limit"
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
              className="h-9 rounded-md border border-[#DDD4C5] bg-background px-2.5 text-xs font-medium text-foreground shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933]"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-9 border-[#DDD4C5] text-xs hover:bg-[#FAF8F4]"
                disabled={!report || report.lines.length === 0 || exporting}
                data-testid="report-export-trigger"
              >
                <Download className="mr-1.5 size-3.5 text-[#C89933]" />
                {exporting ? "Exporting…" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-[#DDD4C5] text-xs">
              <DropdownMenuItem
                onClick={() => exportReport("all")}
                className="cursor-pointer"
                data-testid="export-csv-all"
              >
                <FileSpreadsheet className="mr-2 size-3.5 text-[#C89933]" />
                Export Full Range (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportReport("page")}
                className="cursor-pointer"
                data-testid="export-csv-page"
              >
                <FileText className="mr-2 size-3.5 text-muted-foreground" />
                Export Current Page (CSV)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handlePrint}
                className="cursor-pointer"
                data-testid="export-print"
              >
                <Printer className="mr-2 size-3.5 text-[#C89933]" />
                Print / Save as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading ledger totals…</p>
      ) : null}
      {query.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {(query.error as Error).message}
        </p>
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
          <Kpi label="Net movement" value={money(totals.netMovement)} hint="Signed ledger sum" />
          <Kpi label="Lines" value={String(totals.lineCount)} hint="Total transactions in range" />
        </div>
      ) : null}
      {report && report.lines.length === 0 && !query.isLoading && !query.isError ? (
        <p className="rounded-xl border border-dashed border-[#DDD4C5] p-6 text-center text-sm text-muted-foreground">
          No folio transactions were posted in this property-local date range.
        </p>
      ) : null}
      {report && report.lines.length > 0 ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-[#DDD4C5] bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-[#FAF8F4] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Posted</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Guest</th>
                  <th className="px-3 py-2">Folio</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.lines.map((line) => (
                  <tr key={line.id} className="border-t border-[#E8E1D7] hover:bg-[#FAF8F4]/60 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(line.postedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{methodLabel(line.type)}</td>
                    <td className="px-3 py-2 font-medium">{line.guestName}</td>
                    <td className="px-3 py-2">
                      <Link
                        to="/restaurant/pms/cashiering/folios/$folioId"
                        params={{ folioId: line.folioId }}
                        className="font-medium underline-offset-4 hover:underline hover:text-[#C89933] transition-colors"
                      >
                        {line.folioNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2">{methodLabel(line.paymentMethod)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{money(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-card px-4 py-3 text-xs text-muted-foreground"
            data-testid="cashiering-report-pagination"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                Showing {Math.min((report.page - 1) * report.limit + 1, report.total)}–
                {Math.min(report.page * report.limit, report.total)}
              </span>
              <span>of</span>
              <span className="font-medium text-foreground">{report.total}</span>
              <span>transactions</span>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span>Rows:</span>
                <select
                  aria-label="Change rows per page"
                  value={limit}
                  onChange={(event) => {
                    setLimit(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-8 rounded-md border border-[#DDD4C5] bg-background px-2 text-xs font-medium text-foreground shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933]"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-[#DDD4C5] px-2.5 text-xs hover:bg-[#FAF8F4]"
                  disabled={report.page <= 1 || query.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  data-testid="report-prev-page"
                >
                  <ChevronLeft className="mr-1 size-3.5" />
                  Previous
                </Button>
                <span className="tabular-nums font-medium text-foreground">
                  Page {report.page} of {report.totalPages}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-[#DDD4C5] px-2.5 text-xs hover:bg-[#FAF8F4]"
                  disabled={report.page >= report.totalPages || query.isFetching}
                  onClick={() => setPage((current) => Math.min(report.totalPages, current + 1))}
                  data-testid="report-next-page"
                >
                  Next
                  <ChevronRight className="ml-1 size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Totals use the property timezone, from local midnight on the start date through the end of
        the finish date. This is the guest folio ledger, not a general-ledger trial balance.
      </p>

      {/* Print / Save as PDF layer */}
      <CashieringPrintLayer active={printing && Boolean(totals)}>
        {totals ? (
          <article className="space-y-4 bg-white p-6 text-sm text-[#251605]" data-testid="cashiering-report-print">
            <header className="border-b border-[#DDD4C5] pb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">NORU PMS · Cashiering</p>
              <h1 className="mt-1 text-xl font-bold text-[#251605]">Cashiering Ledger Report</h1>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <p>
                  <strong className="text-foreground">Period:</strong> {fromDate} to {toDate}
                </p>
                <p>
                  <strong className="text-foreground">Property:</strong> {restaurantId.slice(0, 8)}
                </p>
                <p>
                  <strong className="text-foreground">Timezone:</strong> {timezone}
                </p>
                <p>
                  <strong className="text-foreground">Generated:</strong> {new Date().toLocaleString()}
                </p>
              </div>
            </header>

            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary Totals</h2>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="rounded border border-[#E8E1D7] p-2">
                  <span className="block text-muted-foreground">Charges</span>
                  <span className="font-semibold text-blue-700">{money(totals.charges)}</span>
                </div>
                <div className="rounded border border-[#E8E1D7] p-2">
                  <span className="block text-muted-foreground">Payments</span>
                  <span className="font-semibold text-emerald-700">{money(totals.payments)}</span>
                </div>
                <div className="rounded border border-[#E8E1D7] p-2">
                  <span className="block text-muted-foreground">Deposits</span>
                  <span className="font-semibold text-amber-700">{money(totals.deposits)}</span>
                </div>
                <div className="rounded border border-[#E8E1D7] p-2">
                  <span className="block text-muted-foreground">Refunds</span>
                  <span className="font-semibold text-rose-700">{money(totals.refunds)}</span>
                </div>
                <div className="rounded border border-[#E8E1D7] p-2">
                  <span className="block text-muted-foreground">Adjustments</span>
                  <span className="font-semibold">{money(totals.adjustments)}</span>
                </div>
                <div className="rounded border border-[#E8E1D7] p-2">
                  <span className="block text-muted-foreground">Discounts</span>
                  <span className="font-semibold">{money(totals.discounts)}</span>
                </div>
                <div className="rounded border border-[#E8E1D7] p-2">
                  <span className="block text-muted-foreground">Transfers Out</span>
                  <span className="font-semibold">{money(totals.transfersOut)}</span>
                </div>
                <div className="rounded border border-[#E8E1D7] p-2">
                  <span className="block text-muted-foreground">Transfers In</span>
                  <span className="font-semibold">{money(totals.transfersIn)}</span>
                </div>
                <div className="rounded border border-[#E8E1D7] p-2 col-span-2">
                  <span className="block text-muted-foreground">Net Movement</span>
                  <span className="font-semibold text-base">{money(totals.netMovement)}</span>
                </div>
                <div className="rounded border border-[#E8E1D7] p-2 col-span-2">
                  <span className="block text-muted-foreground">Total Transactions</span>
                  <span className="font-semibold text-base">{totals.lineCount}</span>
                </div>
              </div>
            </div>

            <style>{`@media print { thead { display: table-header-group; } tr { break-inside: avoid; } }`}</style>
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transactions</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#DDD4C5] bg-[#FAF8F4] text-left">
                    <th className="p-1.5">Posted</th>
                    <th className="p-1.5">Type</th>
                    <th className="p-1.5">Guest</th>
                    <th className="p-1.5">Folio</th>
                    <th className="p-1.5">Description</th>
                    <th className="p-1.5">Method</th>
                    <th className="p-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(printLines ?? report?.lines ?? []).map((line) => (
                    <tr key={line.id} className="border-b border-[#E8E1D7]">
                      <td className="p-1.5 text-muted-foreground">{new Date(line.postedAt).toLocaleString()}</td>
                      <td className="p-1.5">{methodLabel(line.type)}</td>
                      <td className="p-1.5">{line.guestName}</td>
                      <td className="p-1.5">{line.folioNumber}</td>
                      <td className="p-1.5">{line.description}</td>
                      <td className="p-1.5">{methodLabel(line.paymentMethod)}</td>
                      <td className="p-1.5 text-right tabular-nums">{money(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
      </CashieringPrintLayer>
    </div>
  );
}
