import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  DollarSign,
  FileCheck,
  FileText,
  Info,
  Pencil,
  Percent,
  Plus,
  Receipt,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  listTravelAgentBilling,
  listTravelAgentCommissionEntries,
  listTravelAgentCommissionPlans,
  saveTravelAgentCommissionPlan,
  updateTravelAgentCommissionStatus,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { getTravelAgencyCommissionRatesConfig } from "@/packages/pms/lib/guest-travel-agency-step3-commission-rates.functions";
import {
  TA_BILLING_COPY,
  TA_COMMISSION_PLAN_TYPES,
  TA_COMMISSION_ENTRY_STATUSES,
  type TravelAgentCommercialSubTab,
  type TravelAgentCommissionEntryStatus,
  type TravelAgentCommissionPlanType,
} from "@/packages/pms/lib/guest-travel-agent-detail-workspace";
import { GuestTravelAgencyCommercialEditModal } from "./guest-travel-agency-commercial-edit-modal";
import { cn } from "@/shared/lib/utils";

export function GuestTravelAgentCommercialCommissionView({
  restaurantId,
  agencyId,
  agencyName,
  initialSubTab = "commission",
}: {
  restaurantId: string;
  agencyId: string;
  agencyName?: string;
  initialSubTab?: TravelAgentCommercialSubTab;
}) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<TravelAgentCommercialSubTab>(initialSubTab);
  const [commercialEditOpen, setCommercialEditOpen] = useState(false);

  const loadEntries = useServerFn(listTravelAgentCommissionEntries);
  const loadPlans = useServerFn(listTravelAgentCommissionPlans);
  const savePlan = useServerFn(saveTravelAgentCommissionPlan);
  const updateStatus = useServerFn(updateTravelAgentCommissionStatus);
  const loadBilling = useServerFn(listTravelAgentBilling);
  const loadRatesConfig = useServerFn(getTravelAgencyCommissionRatesConfig);

  const ratesConfigQuery = useQuery({
    queryKey: ["travel-agency-step3-config", restaurantId, agencyId],
    queryFn: () => loadRatesConfig({ data: { restaurantId, agencyId } }),
  });

  // Commission Subtab State
  const [entryStatus, setEntryStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planForm, setPlanForm] = useState({
    commissionType: "percent" as TravelAgentCommissionPlanType,
    rateValue: 10,
    currency: "ETB",
    effectiveOn: new Date().toISOString().slice(0, 10),
    expiresOn: "",
    notes: "",
    active: true,
  });

  // Billing Subtab State
  const [billingQ, setBillingQ] = useState("");
  const [billingStatus, setBillingStatus] = useState("all");

  const plansQuery = useQuery({
    queryKey: ["travel-agent-commission-plans", restaurantId, agencyId],
    queryFn: () => loadPlans({ data: { restaurantId, agencyId } }),
  });

  const entriesQuery = useQuery({
    queryKey: ["travel-agent-commission-entries", restaurantId, agencyId, entryStatus, dateFrom, dateTo],
    queryFn: () =>
      loadEntries({
        data: {
          restaurantId,
          agencyId,
          status: entryStatus,
          from: dateFrom || undefined,
          to: dateTo || undefined,
        },
      }),
  });

  const billingQuery = useQuery({
    queryKey: ["travel-agent-billing", restaurantId, agencyId, billingQ, billingStatus],
    queryFn: () => loadBilling({ data: { restaurantId, agencyId, q: billingQ, status: billingStatus } }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["travel-agent-commission-plans", restaurantId, agencyId] });
    void queryClient.invalidateQueries({ queryKey: ["travel-agent-commission-entries", restaurantId, agencyId] });
    void queryClient.invalidateQueries({ queryKey: ["travel-agent-billing", restaurantId, agencyId] });
    void queryClient.invalidateQueries({ queryKey: ["travel-agent-detail", restaurantId, agencyId] });
  }

  const savePlanMutation = useMutation({
    mutationFn: () =>
      savePlan({
        data: {
          restaurantId,
          agencyId,
          commissionType: planForm.commissionType,
          rateValue: Number(planForm.rateValue),
          currency: planForm.currency,
          effectiveOn: planForm.effectiveOn,
          expiresOn: planForm.expiresOn || null,
          notes: planForm.notes || null,
          active: planForm.active,
        },
      }),
    onSuccess: () => {
      setPlanDialogOpen(false);
      toast.success("Commission plan saved.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { entryId: string; status: TravelAgentCommissionEntryStatus }) =>
      updateStatus({ data: { restaurantId, agencyId, ...input } }),
    onSuccess: () => {
      toast.success("Commission status updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const plans = plansQuery.data?.items ?? [];
  const activePlan = plans.find((p) => p.active) ?? plans[0];
  const entries = entriesQuery.data?.items ?? [];
  const totals = entriesQuery.data?.totals ?? { earned: 0, approved: 0, settled: 0, outstanding: 0 };

  const billingData = billingQuery.data;
  const billingSummary = billingData?.summary;
  const billingTransactions = billingData?.items ?? [];

  return (
    <div className="space-y-6" data-testid="travel-agent-commercial-commission-view">
      {/* Subtab Navigation */}
      <div className="flex items-center gap-6 border-b border-[#DDD4C5] pb-0">
        <button
          type="button"
          onClick={() => setSubTab("commission")}
          data-testid="travel-agent-subtab-commission"
          className={cn(
            "inline-flex items-center gap-2 pb-2.5 text-sm font-medium border-b-2 transition-colors",
            subTab === "commission"
              ? "border-[#8A641A] text-[#251605] font-semibold"
              : "border-transparent text-[#756A5B] hover:text-[#251605]",
          )}
        >
          <Percent className="size-4 text-[#8A641A]" />
          <span>Commission</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab("billing")}
          data-testid="travel-agent-subtab-billing"
          className={cn(
            "inline-flex items-center gap-2 pb-2.5 text-sm font-medium border-b-2 transition-colors",
            subTab === "billing"
              ? "border-[#8A641A] text-[#251605] font-semibold"
              : "border-transparent text-[#756A5B] hover:text-[#251605]",
          )}
        >
          <Receipt className="size-4 text-[#8A641A]" />
          <span>Billing & Terms</span>
        </button>
      </div>

      {subTab === "commission" && (
        <div className="space-y-5" data-testid="travel-agent-commission-section">
          {/* Summary Band */}
          <div className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-4 sm:divide-y-0 sm:divide-x shadow-sm">
            <div className="flex flex-col px-3 py-1.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Earned</span>
              <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
                {totals.earned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex flex-col px-3 py-1.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Approved</span>
              <span className="mt-1 font-mono text-sm font-bold text-[#8A641A]">
                {totals.approved.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex flex-col px-3 py-1.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Settled</span>
              <span className="mt-1 font-mono text-sm font-bold text-[#2E7D32]">
                {totals.settled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex flex-col px-3 py-1.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Outstanding</span>
              <span className="mt-1 font-mono text-sm font-bold text-[#C62828]">
                {totals.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-[#756A5B] italic">
            Operational Settlement Status: Commission "settled" reflects internal operational verification and folio reconciliation. It does not imply external bank payouts or supplier transfers.
          </p>

          {/* Step 3 Commercial Model: Net Rate Agreement Card */}
          {ratesConfigQuery.data?.existingAgreement ? (
            <div className="rounded-xl border border-[#C89933]/40 bg-[#FAF8F5] p-4 shadow-sm space-y-3" data-testid="net-rate-agreement-card">
              <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2">
                <div className="flex items-center gap-2">
                  <FileCheck className="size-4 text-[#8A641A]" />
                  <h3 className="font-display text-sm font-bold text-[#251605]">Net Rate Commercial Agreement</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCommercialEditOpen(true)}
                    className="h-7 text-xs border-[#C89933] text-[#8A641A] hover:bg-[#F5EEDC]"
                    data-testid="edit-net-rate-agreement-button"
                  >
                    <Pencil className="mr-1 size-3" />
                    Edit Terms
                  </Button>
                  <Badge variant="outline" className="border-[#C89933] text-[#8A641A] font-semibold text-[11px]">
                    Confidential Wholesale
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <span className="text-[#756A5B]">Pricing Method:</span>
                  <p className="font-semibold text-[#251605] capitalize">
                    {ratesConfigQuery.data.existingAgreement.pricingMethod === "rate_plan"
                      ? "Linked Rate Plan"
                      : ratesConfigQuery.data.existingAgreement.pricingMethod === "rate_plan_discount"
                        ? `Discount (${ratesConfigQuery.data.existingAgreement.discountValue}${ratesConfigQuery.data.existingAgreement.discountType === "percent" ? "%" : ""})`
                        : "Contracted Room Rates"}
                  </p>
                </div>
                <div>
                  <span className="text-[#756A5B]">Settlement Currency:</span>
                  <p className="font-mono font-bold text-[#8A641A]">
                    {ratesConfigQuery.data.existingAgreement.currencyCode}
                  </p>
                </div>
                <div>
                  <span className="text-[#756A5B]">Valid From:</span>
                  <p className="font-mono text-[#251605]">{ratesConfigQuery.data.existingAgreement.validFrom}</p>
                </div>
                <div>
                  <span className="text-[#756A5B]">Valid To:</span>
                  <p className="font-mono text-[#251605]">{ratesConfigQuery.data.existingAgreement.validTo}</p>
                </div>
              </div>
              {ratesConfigQuery.data.existingAgreement.contractedRates?.length > 0 && (
                <div className="pt-2 border-t border-[#EDE6D8]">
                  <span className="text-[11px] text-[#756A5B] block mb-1">Contracted Room Rates:</span>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    {ratesConfigQuery.data.existingAgreement.contractedRates.map((cr, idx) => {
                      const room = ratesConfigQuery.data?.roomTypes?.find((r) => r.id === cr.roomTypeId)?.name || "Room";
                      return (
                        <div key={idx} className="rounded bg-white p-2 border border-[#EDE6D8]">
                          <span className="text-[#756A5B] block">{room}:</span>
                          <span className="font-bold text-[#251605]">
                            {cr.amount} {ratesConfigQuery.data?.existingAgreement?.currencyCode}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Granular Commission Rules Snapshot Card */}
          {!ratesConfigQuery.data?.existingAgreement && ratesConfigQuery.data?.commissionRules && ratesConfigQuery.data.commissionRules.length > 0 && (
            <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-sm space-y-2.5" data-testid="commission-rules-snapshot-card">
              <div className="flex items-center justify-between border-b border-[#F0EAE1] pb-2">
                <span className="text-xs font-bold text-[#251605]">
                  Granular Commission Rules ({ratesConfigQuery.data.commissionRules.length})
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#756A5B] hidden sm:inline">Scope precedence: Rate Plan &gt; Room Type &gt; All</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCommercialEditOpen(true)}
                    className="h-7 text-xs border-[#DDD4C5]"
                    data-testid="edit-commission-rules-button"
                  >
                    <Pencil className="mr-1 size-3" />
                    Edit Rules & Rates
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ratesConfigQuery.data.commissionRules.map((rule, idx) => {
                  const room = ratesConfigQuery.data?.roomTypes?.find((r) => r.id === rule.roomTypeId)?.name || "All Rooms";
                  const plan = ratesConfigQuery.data?.ratePlans?.find((p) => p.id === rule.ratePlanId)?.name || "All Plans";
                  return (
                    <div key={idx} className="rounded-md border border-[#EDE6D8] bg-[#FAF8F5] p-2 text-xs">
                      <div className="text-[11px] text-[#756A5B] capitalize">{rule.scopeType} Scope</div>
                      <div className="font-medium text-[#251605] truncate">
                        {rule.scopeType === "all" ? "Default / All" : rule.scopeType === "room_type" ? room : `${room} / ${plan}`}
                      </div>
                      <div className="font-bold text-[#8A641A] mt-1">
                        {rule.commissionValue}{rule.commissionType === "percent" ? "%" : ` ${ratesConfigQuery.data?.baseCurrency || "ETB"}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Plan Snapshot & Plan Configuration Trigger */}
          {plans.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-[#FAF8F5] p-5 text-center" data-testid="commission-no-plan-box">
              <Percent className="mx-auto size-7 text-[#8A641A] mb-2 opacity-80" />
              <p className="font-display text-sm font-bold text-[#251605]">No commission plan configured.</p>
              <p className="text-xs text-[#756A5B] mt-1 max-w-md mx-auto">
                Configure a percentage or fixed rate commission plan to calculate commission on future reservations.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => setCommercialEditOpen(true)}
                className="mt-3.5 bg-[#C89933] text-[#251605] hover:bg-[#B88928] text-xs font-medium"
                data-testid="configure-commission-plan-button"
              >
                <Plus className="mr-1.5 size-3.5" />
                Configure Commercial Terms & Rates
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3" data-testid="commission-active-plan-card">
              <div className="flex items-center justify-between border-b border-[#F0EAE1] pb-2">
                <div className="flex items-center gap-2">
                  <Percent className="size-4 text-[#8A641A]" />
                  <h3 className="font-display text-sm font-bold text-[#251605]">Active Commission Plan</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCommercialEditOpen(true)}
                    className="h-7 text-xs border-[#C89933] text-[#8A641A] hover:bg-[#F5EEDC]"
                    data-testid="edit-commission-plan-button"
                  >
                    <Pencil className="mr-1 size-3" />
                    Edit Commercial Terms
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <span className="text-[#756A5B]">Plan Type:</span>
                  <p className="font-semibold capitalize text-[#251605]">{activePlan.commissionType}</p>
                </div>
                <div>
                  <span className="text-[#756A5B]">Rate / Value:</span>
                  <p className="font-mono font-bold text-[#8A641A]">
                    {activePlan.commissionType === "percent" ? `${activePlan.rateValue}%` : `${activePlan.rateValue} ${activePlan.currency}`}
                  </p>
                </div>
                <div>
                  <span className="text-[#756A5B]">Effective From:</span>
                  <p className="font-mono text-[#251605]">{activePlan.effectiveOn}</p>
                </div>
                <div>
                  <span className="text-[#756A5B]">Expires On:</span>
                  <p className="font-mono text-[#251605]">{activePlan.expiresOn ?? "Ongoing"}</p>
                </div>
              </div>
            </div>
          )}

          {/* Commission Entries Toolbar & Table */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={entryStatus} onValueChange={setEntryStatus}>
                  <SelectTrigger className="h-8 w-36 border-[#DDD4C5] text-xs bg-white">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                    {TA_COMMISSION_ENTRY_STATUSES.map((st) => (
                      <SelectItem key={st} value={st} className="text-xs capitalize">
                        {st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-32 text-xs border-[#DDD4C5]"
                  title="From Date"
                />

                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-32 text-xs border-[#DDD4C5]"
                  title="To Date"
                />

                {(entryStatus !== "all" || dateFrom || dateTo) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEntryStatus("all");
                      setDateFrom("");
                      setDateTo("");
                    }}
                    className="h-8 text-xs text-[#756A5B]"
                  >
                    Clear
                  </Button>
                )}
              </div>

              <div className="text-[11px] text-[#756A5B] italic">
                * "Settled" indicates workflow verification status, not an external payment transfer.
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" data-testid="commission-entries-table">
                  <thead>
                    <tr className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] uppercase tracking-wider">
                      <th className="px-3.5 py-2.5">Reservation</th>
                      <th className="px-3 py-2.5">Guest</th>
                      <th className="px-3 py-2.5">Arrival</th>
                      <th className="px-3 py-2.5 text-right">Basis</th>
                      <th className="px-3 py-2.5 text-right">Commission</th>
                      <th className="px-3 py-2.5">Currency</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3.5 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EAE1]">
                    {entriesQuery.isLoading ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-[#756A5B]">
                          Loading commission entries…
                        </td>
                      </tr>
                    ) : entries.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-[#8C827A] italic">
                          No commission entries yet.
                        </td>
                      </tr>
                    ) : (
                      entries.map((row) => (
                        <tr key={row.id} className="hover:bg-[#FAF8F5]/80 transition-colors">
                          <td className="px-3.5 py-2.5 font-mono font-medium text-[#8A641A]">
                            {row.confirmationNumber}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-[#251605]">{row.guestName}</td>
                          <td className="px-3 py-2.5 text-[#756A5B]">{row.arrivalDate ?? "—"}</td>
                          <td className="px-3 py-2.5 font-mono text-right text-[#251605]">
                            {row.basisAmount == null ? "—" : row.basisAmount.toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold text-right text-[#8A641A]">
                            {row.amount == null ? "—" : row.amount.toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[#756A5B]">{row.currency}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                                row.status === "settled" && "bg-emerald-50 text-emerald-700",
                                row.status === "approved" && "bg-blue-50 text-blue-700",
                                row.status === "pending" && "bg-amber-50 text-amber-700",
                                row.status === "void" && "bg-stone-100 text-stone-500 line-through",
                                row.status === "calculated" && "bg-purple-50 text-purple-700",
                              )}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-[#756A5B]"
                                  data-testid={`commission-entry-actions-${row.id}`}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-xs">
                                {row.status !== "approved" && row.status !== "settled" && row.status !== "void" && (
                                  <DropdownMenuItem
                                    onClick={() => statusMutation.mutate({ entryId: row.id, status: "approved" })}
                                  >
                                    Approve
                                  </DropdownMenuItem>
                                )}
                                {row.status !== "settled" && row.status !== "void" && entriesQuery.data?.canSettle && (
                                  <DropdownMenuItem
                                    onClick={() => statusMutation.mutate({ entryId: row.id, status: "settled" })}
                                  >
                                    Mark Settled
                                  </DropdownMenuItem>
                                )}
                                {row.status !== "void" && (
                                  <DropdownMenuItem
                                    onClick={() => statusMutation.mutate({ entryId: row.id, status: "void" })}
                                    className="text-rose-600"
                                  >
                                    Void Entry
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Configure Commission Plan Dialog */}
          <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-lg">Configure Commission Plan</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 text-xs">
                <div>
                  <Label className="text-xs">Plan Type</Label>
                  <Select
                    value={planForm.commissionType}
                    onValueChange={(val) => setPlanForm((f) => ({ ...f, commissionType: val as TravelAgentCommissionPlanType }))}
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs border-[#DDD4C5]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent" className="text-xs">Percentage of Room Subtotal (%)</SelectItem>
                      <SelectItem value="fixed" className="text-xs">Fixed Amount Per Stay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Rate Value *</Label>
                    <Input
                      type="number"
                      value={planForm.rateValue}
                      onChange={(e) => setPlanForm((f) => ({ ...f, rateValue: Number(e.target.value) }))}
                      className="mt-1 h-8 text-xs border-[#DDD4C5]"
                      min={0}
                      step={0.1}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Currency</Label>
                    <Input
                      value={planForm.currency}
                      onChange={(e) => setPlanForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                      className="mt-1 h-8 text-xs border-[#DDD4C5] font-mono"
                      maxLength={3}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Effective From *</Label>
                    <Input
                      type="date"
                      value={planForm.effectiveOn}
                      onChange={(e) => setPlanForm((f) => ({ ...f, effectiveOn: e.target.value }))}
                      className="mt-1 h-8 text-xs border-[#DDD4C5]"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Expires On (Optional)</Label>
                    <Input
                      type="date"
                      value={planForm.expiresOn}
                      onChange={(e) => setPlanForm((f) => ({ ...f, expiresOn: e.target.value }))}
                      className="mt-1 h-8 text-xs border-[#DDD4C5]"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    value={planForm.notes}
                    onChange={(e) => setPlanForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Plan terms, commission eligibility rules…"
                    rows={3}
                    className="mt-1 text-xs border-[#DDD4C5]"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setPlanDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={savePlanMutation.isPending}
                  onClick={() => savePlanMutation.mutate()}
                  className="bg-[#C89933] text-[#251605] hover:bg-[#B88928]"
                >
                  Save Commission Plan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {subTab === "billing" && (
        <div className="space-y-5" data-testid="travel-agent-billing-section">
          {/* Read-only Commercial Section */}
          <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-[#F0EAE1] pb-2">
              <FileCheck className="size-4 text-[#8A641A]" />
              <h3 className="font-display text-sm font-bold text-[#251605]">Commercial & Credit Terms</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div>
                <span className="text-[#756A5B]">Billing Currency:</span>
                <p className="font-semibold text-[#251605]">{billingSummary?.billingCurrencyCode || "Default"}</p>
              </div>
              <div>
                <span className="text-[#756A5B]">Payment Timing:</span>
                <p className="font-semibold text-[#251605]">
                  {billingSummary?.paymentTiming
                    ? billingSummary.paymentTiming.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                    : billingSummary?.paymentTerms || "Direct Payment"}
                </p>
              </div>
              <div>
                <span className="text-[#756A5B]">Billing Contact:</span>
                <p className="font-semibold text-[#251605]">{billingSummary?.billingContact || "Primary Contact"}</p>
              </div>
              <div>
                <span className="text-[#756A5B]">Credit Account:</span>
                <p className="font-semibold text-[#251605]">
                  {billingSummary?.creditAccountEnabled
                    ? `Enabled (${billingSummary?.creditStatus || "pending"})`
                    : "Disabled"}
                </p>
              </div>
              <div>
                <span className="text-[#756A5B]">Credit Days:</span>
                <p className="font-semibold text-[#251605]">
                  {billingSummary?.creditDays != null ? `${billingSummary.creditDays} days` : "—"}
                </p>
              </div>
              <div>
                <span className="text-[#756A5B]">Credit Limit:</span>
                <p className="font-mono text-[#251605]">
                  {billingSummary?.creditLimitAmount != null ? billingSummary.creditLimitAmount.toFixed(2) : "None configured"}
                </p>
              </div>
              {billingSummary?.bookingNotes && (
                <div className="col-span-2 sm:col-span-3">
                  <span className="text-[#756A5B]">Booking Notes:</span>
                  <p className="text-[#251605] font-medium">{billingSummary.bookingNotes}</p>
                </div>
              )}
              {billingSummary?.billingInstruction && (
                <div className="col-span-2 sm:col-span-3">
                  <span className="text-[#756A5B]">Billing Instructions:</span>
                  <p className="text-[#251605]">{billingSummary.billingInstruction}</p>
                </div>
              )}
            </div>
          </div>

          {/* Disclosure */}
          <div className="rounded-xl bg-[#FAF8F5] border border-[#DDD4C5] p-3 text-xs text-[#756A5B] flex items-start gap-2.5">
            <Info className="size-4 text-[#8A641A] shrink-0 mt-0.5" />
            <p>{TA_BILLING_COPY}</p>
          </div>

          {/* Folio-Derived Transactions Table */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h3 className="font-display text-base font-bold text-[#251605]">Folio-derived transactions</h3>
              <div className="flex items-center gap-2">
                <div className="relative min-w-44">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
                  <Input
                    value={billingQ}
                    onChange={(e) => setBillingQ(e.target.value)}
                    placeholder="Search folio, guest…"
                    className="h-8 pl-8 text-xs border-[#DDD4C5] bg-white"
                  />
                </div>
                <Select value={billingStatus} onValueChange={setBillingStatus}>
                  <SelectTrigger className="h-8 w-28 text-xs border-[#DDD4C5] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Folios</SelectItem>
                    <SelectItem value="open" className="text-xs">Open</SelectItem>
                    <SelectItem value="closed" className="text-xs">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" data-testid="travel-agent-billing-table">
                  <thead>
                    <tr className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] uppercase tracking-wider">
                      <th className="px-3.5 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Reference</th>
                      <th className="px-3 py-2.5">Guest</th>
                      <th className="px-3 py-2.5">Description</th>
                      <th className="px-3 py-2.5 text-right">Debit</th>
                      <th className="px-3 py-2.5 text-right">Credit</th>
                      <th className="px-3 py-2.5 text-right">Balance</th>
                      <th className="px-3.5 py-2.5 text-right">Folio Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EAE1]">
                    {billingQuery.isLoading ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-[#756A5B]">
                          Loading transactions…
                        </td>
                      </tr>
                    ) : billingTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-[#8C827A] italic">
                          No folio transactions on file.
                        </td>
                      </tr>
                    ) : (
                      billingTransactions.map((row) => (
                        <tr key={row.id} className="hover:bg-[#FAF8F5]/80 transition-colors">
                          <td className="px-3.5 py-2.5 font-mono text-[11px] text-[#756A5B]">
                            {new Date(row.date).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-medium text-[#8A641A]">{row.reference}</td>
                          <td className="px-3 py-2.5 text-[#251605]">{row.guestName}</td>
                          <td className="px-3 py-2.5 text-[#756A5B]">{row.description}</td>
                          <td className="px-3 py-2.5 font-mono text-right text-[#251605]">
                            {row.debit > 0 ? row.debit.toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-right text-[#2E7D32]">
                            {row.credit > 0 ? row.credit.toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-right font-medium text-[#251605]">
                            {row.balance.toFixed(2)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                                row.status === "open" ? "bg-amber-50 text-amber-700" : "bg-stone-100 text-stone-600",
                              )}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Focused Commercial Terms & Rates Edit Modal */}
      <GuestTravelAgencyCommercialEditModal
        restaurantId={restaurantId}
        agencyId={agencyId}
        agencyName={agencyName}
        open={commercialEditOpen}
        onOpenChange={setCommercialEditOpen}
        onSaved={refresh}
      />
    </div>
  );
}

export const GuestTravelAgentCommercialView = GuestTravelAgentCommercialCommissionView;
export const GuestTravelAgentCommission = GuestTravelAgentCommercialCommissionView;
export const GuestTravelAgentBilling = GuestTravelAgentCommercialCommissionView;
