import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { StatCard, formatStayDate, addDays } from "@/components/bookings/reservation-bits";
import { listRoomTypes } from "@/lib/rooms.functions";
import {
  getRevenueOverview,
  listRateCalendar,
  listRateCategories,
  listRatePlans,
  listRateRestrictions,
  saveRateCategory,
  saveRateOverride,
  saveRatePlan,
  saveRateRestriction,
  setRatePlanActive,
  type RatePlan,
} from "@/lib/rates.functions";
import { useMoney } from "@/core/state/restaurant-context";

const ALL = "all";

/* --------------------------------------------------------------- overview */

export function RevenueOverviewTab({ restaurantId, today }: { restaurantId: string; today: string }) {
  const money = useMoney();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);

  const fetchOverview = useServerFn(getRevenueOverview);
  const query = useQuery({
    queryKey: ["revenue-overview", restaurantId, from, to],
    queryFn: () => fetchOverview({ data: { restaurantId, from, to } }),
    retry: false,
  });

  const data = query.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <Label htmlFor="rev-from">From</Label>
          <Input id="rev-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="rev-to">To</Label>
          <Input id="rev-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Property-local dates. Room revenue comes from reservation pricing snapshots for confirmed, in-house and
          checked-out stays; pending, cancelled and no-show stays are excluded.
        </p>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading revenue…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Occupancy" value={`${data.occupancyPercent}%`} hint="Sold ÷ available room nights" />
            <StatCard label="ADR" value={money(data.adr)} hint="Room revenue ÷ sold room nights" />
            <StatCard label="RevPAR" value={money(data.revPar)} hint="Room revenue ÷ available room nights" />
            <StatCard label="Room revenue" value={money(data.roomRevenue)} />
            <StatCard label="Sold room nights" value={data.soldRoomNights} />
            <StatCard label="Available room nights" value={data.availableRoomNights} />
          </div>
          {data.pricedShare < 100 ? (
            <p className="text-xs text-muted-foreground">
              {data.pricedShare}% of sold room nights carry a pricing snapshot — unpriced legacy reservations
              contribute occupancy but no revenue.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- rate plans */

export function RatePlansTab({ restaurantId }: { restaurantId: string }) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>(ALL);
  const [activeOnly, setActiveOnly] = useState(false);
  const [planDialog, setPlanDialog] = useState<{ open: boolean; plan: RatePlan | null }>({
    open: false,
    plan: null,
  });
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  const fetchPlans = useServerFn(listRatePlans);
  const fetchTypes = useServerFn(listRoomTypes);
  const fetchCategories = useServerFn(listRateCategories);
  const toggleActive = useServerFn(setRatePlanActive);

  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, roomTypeFilter, activeOnly],
    queryFn: () =>
      fetchPlans({
        data: {
          restaurantId,
          ...(roomTypeFilter !== ALL ? { roomTypeId: roomTypeFilter } : {}),
          ...(activeOnly ? { activeOnly: true } : {}),
        },
      }),
    retry: false,
  });
  const typesQuery = useQuery({
    queryKey: ["room-types", restaurantId],
    queryFn: () => fetchTypes({ data: { restaurantId } }),
    retry: false,
  });
  const categoriesQuery = useQuery({
    queryKey: ["rate-categories", restaurantId],
    queryFn: () => fetchCategories({ data: { restaurantId } }),
    retry: false,
  });

  const activeMutation = useMutation({
    mutationFn: (vars: { ratePlanId: string; active: boolean }) =>
      toggleActive({ data: { restaurantId, ...vars } }),
    onSuccess: () => {
      toast.success("Rate plan updated");
      void queryClient.invalidateQueries({ queryKey: ["rate-plans", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const plans = plansQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="min-w-48">
          <Label>Room type</Label>
          <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All room types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All room types</SelectItem>
              {(typesQuery.data ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} /> Active only
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>
            Add category
          </Button>
          <Button onClick={() => setPlanDialog({ open: true, plan: null })}>Add rate plan</Button>
        </div>
      </div>

      {plansQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rate plans…</p>
      ) : plans.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No rate plans yet. Create a category (for example BAR) and then a rate plan for a room type.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Room type</th>
                <th className="px-4 py-3">Base rate</th>
                <th className="px-4 py-3">Validity</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{plan.code}</td>
                  <td className="px-4 py-3">{plan.name}</td>
                  <td className="px-4 py-3">{plan.categoryName}</td>
                  <td className="px-4 py-3">{plan.roomTypeName}</td>
                  <td className="px-4 py-3">
                    {money(plan.baseRate)} <span className="text-xs text-muted-foreground">{plan.currency}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {plan.validFrom ? formatStayDate(plan.validFrom) : "Any"} →{" "}
                    {plan.validTo ? formatStayDate(plan.validTo) : "Any"}
                  </td>
                  <td className="px-4 py-3">{plan.active ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPlanDialog({ open: true, plan })}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => activeMutation.mutate({ ratePlanId: plan.id, active: !plan.active })}
                      >
                        {plan.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RatePlanDialog
        restaurantId={restaurantId}
        open={planDialog.open}
        plan={planDialog.plan}
        categories={(categoriesQuery.data ?? []).map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
        roomTypes={(typesQuery.data ?? []).map((t) => ({ id: t.id, label: t.name }))}
        onClose={() => setPlanDialog({ open: false, plan: null })}
      />
      <RateCategoryDialog
        restaurantId={restaurantId}
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
      />
    </div>
  );
}

function RateCategoryDialog({
  restaurantId,
  open,
  onClose,
}: {
  restaurantId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveRateCategory);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setCode("");
      setName("");
      setDescription("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { restaurantId, code, name, description: description || null } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Rate category saved");
      void queryClient.invalidateQueries({ queryKey: ["rate-categories", restaurantId] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add rate category</DialogTitle>
          <DialogDescription>Group rate plans, for example BAR, Standard or Promotional.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cat-code">Code</Label>
            <Input id="cat-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BAR" />
          </div>
          <div>
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Best Available Rate"
            />
          </div>
          <div>
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!code.trim() || !name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RatePlanDialog({
  restaurantId,
  open,
  plan,
  categories,
  roomTypes,
  onClose,
}: {
  restaurantId: string;
  open: boolean;
  plan: RatePlan | null;
  categories: { id: string; label: string }[];
  roomTypes: { id: string; label: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveRatePlan);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [baseRate, setBaseRate] = useState("0");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setCode(plan?.code ?? "");
    setName(plan?.name ?? "");
    setDescription(plan?.description ?? "");
    setCategoryId(plan?.categoryId ?? categories[0]?.id ?? "");
    setRoomTypeId(plan?.roomTypeId ?? roomTypes[0]?.id ?? "");
    setBaseRate(String(plan?.baseRate ?? 0));
    setValidFrom(plan?.validFrom ?? "");
    setValidTo(plan?.validTo ?? "");
    setActive(plan?.active ?? true);
  }, [open, plan, categories, roomTypes]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(plan ? { ratePlanId: plan.id } : {}),
          rateCategoryId: categoryId,
          roomTypeId,
          code,
          name,
          description: description || null,
          baseRate: Number(baseRate),
          validFrom: validFrom || null,
          validTo: validTo || null,
          active,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Rate plan saved");
      void queryClient.invalidateQueries({ queryKey: ["rate-plans", restaurantId] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const valid = code.trim() && name.trim() && categoryId && roomTypeId && Number(baseRate) >= 0;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? "Edit rate plan" : "Add rate plan"}</DialogTitle>
          <DialogDescription>
            The plan's currency follows the property currency. Base rate applies to every night without an override.
          </DialogDescription>
        </DialogHeader>

        {categories.length === 0 ? (
          <p className="text-sm text-destructive">Create a rate category first.</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="plan-code">Code</Label>
            <Input id="plan-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BAR-DLX" />
          </div>
          <div>
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Room type</Label>
            <Select value={roomTypeId} onValueChange={setRoomTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select room type" />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="plan-rate">Base rate</Label>
            <Input
              id="plan-rate"
              type="number"
              min={0}
              step="0.01"
              value={baseRate}
              onChange={(e) => setBaseRate(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Switch checked={active} onCheckedChange={setActive} id="plan-active" />
            <Label htmlFor="plan-active">Active</Label>
          </div>
          <div>
            <Label htmlFor="plan-from">Valid from</Label>
            <Input id="plan-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="plan-to">Valid to</Label>
            <Input id="plan-to" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="plan-desc">Description</Label>
            <Textarea id="plan-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------- plan + range filters */

function usePlanPicker(restaurantId: string) {
  const fetchTypes = useServerFn(listRoomTypes);
  const fetchPlans = useServerFn(listRatePlans);
  const [roomTypeId, setRoomTypeId] = useState<string>(ALL);
  const [ratePlanId, setRatePlanId] = useState<string>("");

  const typesQuery = useQuery({
    queryKey: ["room-types", restaurantId],
    queryFn: () => fetchTypes({ data: { restaurantId } }),
    retry: false,
  });
  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, roomTypeId, true],
    queryFn: () =>
      fetchPlans({
        data: { restaurantId, ...(roomTypeId !== ALL ? { roomTypeId } : {}), activeOnly: true },
      }),
    retry: false,
  });

  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);

  useEffect(() => {
    if (plans.length === 0) {
      setRatePlanId("");
      return;
    }
    if (!plans.some((p) => p.id === ratePlanId)) setRatePlanId(plans[0]!.id);
  }, [plans, ratePlanId]);

  return { typesQuery, plans, roomTypeId, setRoomTypeId, ratePlanId, setRatePlanId };
}

function PlanFilters({
  picker,
  from,
  to,
  setFrom,
  setTo,
}: {
  picker: ReturnType<typeof usePlanPicker>;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-44">
        <Label>Room type</Label>
        <Select value={picker.roomTypeId} onValueChange={picker.setRoomTypeId}>
          <SelectTrigger>
            <SelectValue placeholder="All room types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All room types</SelectItem>
            {(picker.typesQuery.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-52">
        <Label>Rate plan</Label>
        <Select value={picker.ratePlanId} onValueChange={picker.setRatePlanId}>
          <SelectTrigger>
            <SelectValue placeholder="Select rate plan" />
          </SelectTrigger>
          <SelectContent>
            {picker.plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.code} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="range-from">From</Label>
        <Input id="range-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="range-to">To</Label>
        <Input id="range-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- rate calendar */

export function RateCalendarTab({ restaurantId, today }: { restaurantId: string; today: string }) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const picker = usePlanPicker(restaurantId);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 13));
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const fetchCalendar = useServerFn(listRateCalendar);
  const saveOverride = useServerFn(saveRateOverride);

  const calendarQuery = useQuery({
    queryKey: ["rate-calendar", restaurantId, picker.ratePlanId, from, to],
    queryFn: () => fetchCalendar({ data: { restaurantId, ratePlanId: picker.ratePlanId, from, to } }),
    enabled: !!picker.ratePlanId,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (vars: { date: string; nightlyRate: number | null }) =>
      saveOverride({ data: { restaurantId, ratePlanId: picker.ratePlanId, ...vars } }),
    onSuccess: () => {
      toast.success("Rate saved");
      void queryClient.invalidateQueries({ queryKey: ["rate-calendar", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <PlanFilters picker={picker} from={from} to={to} setFrom={setFrom} setTo={setTo} />

      {!picker.ratePlanId ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Create an active rate plan to manage daily rates.
        </p>
      ) : calendarQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rates…</p>
      ) : calendarQuery.isError ? (
        <p className="text-sm text-destructive">{(calendarQuery.error as Error).message}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Base rate</th>
                <th className="px-4 py-3">Override</th>
                <th className="px-4 py-3">Effective</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(calendarQuery.data ?? []).map((row) => {
                const draft = drafts[row.date] ?? (row.overrideRate === null ? "" : String(row.overrideRate));
                return (
                  <tr key={row.date} className="border-t border-border">
                    <td className="px-4 py-2 whitespace-nowrap">{formatStayDate(row.date)}</td>
                    <td className="px-4 py-2">{money(row.baseRate)}</td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-32"
                        placeholder="—"
                        value={draft}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [row.date]: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-2 font-medium">{money(row.effectiveRate)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({
                              date: row.date,
                              nightlyRate: draft.trim() === "" ? null : Number(draft),
                            })
                          }
                        >
                          Save
                        </Button>
                        {row.overrideRate !== null ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDrafts((prev) => ({ ...prev, [row.date]: "" }));
                              mutation.mutate({ date: row.date, nightlyRate: null });
                            }}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ restrictions */

type RestrictionDraft = {
  minStay: string;
  maxStay: string;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
};

export function RateRestrictionsTab({ restaurantId, today }: { restaurantId: string; today: string }) {
  const queryClient = useQueryClient();
  const picker = usePlanPicker(restaurantId);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 13));
  const [drafts, setDrafts] = useState<Record<string, RestrictionDraft>>({});

  const fetchRestrictions = useServerFn(listRateRestrictions);
  const saveRestriction = useServerFn(saveRateRestriction);

  const query = useQuery({
    queryKey: ["rate-restrictions", restaurantId, picker.ratePlanId, from, to],
    queryFn: () => fetchRestrictions({ data: { restaurantId, ratePlanId: picker.ratePlanId, from, to } }),
    enabled: !!picker.ratePlanId,
    retry: false,
  });

  useEffect(() => {
    setDrafts({});
  }, [picker.ratePlanId, from, to]);

  const mutation = useMutation({
    mutationFn: (vars: { date: string; draft: RestrictionDraft }) =>
      saveRestriction({
        data: {
          restaurantId,
          ratePlanId: picker.ratePlanId,
          date: vars.date,
          minStay: vars.draft.minStay.trim() === "" ? null : Number(vars.draft.minStay),
          maxStay: vars.draft.maxStay.trim() === "" ? null : Number(vars.draft.maxStay),
          closedToArrival: vars.draft.closedToArrival,
          closedToDeparture: vars.draft.closedToDeparture,
          stopSell: vars.draft.stopSell,
        },
      }),
    onSuccess: () => {
      toast.success("Restrictions saved");
      void queryClient.invalidateQueries({ queryKey: ["rate-restrictions", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <PlanFilters picker={picker} from={from} to={to} setFrom={setFrom} setTo={setTo} />

      {!picker.ratePlanId ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Create an active rate plan to manage restrictions.
        </p>
      ) : query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading restrictions…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Min stay</th>
                <th className="px-4 py-3">Max stay</th>
                <th className="px-4 py-3">CTA</th>
                <th className="px-4 py-3">CTD</th>
                <th className="px-4 py-3">Stop sell</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(query.data ?? []).map((row) => {
                const draft: RestrictionDraft = drafts[row.date] ?? {
                  minStay: row.minStay === null ? "" : String(row.minStay),
                  maxStay: row.maxStay === null ? "" : String(row.maxStay),
                  closedToArrival: row.closedToArrival,
                  closedToDeparture: row.closedToDeparture,
                  stopSell: row.stopSell,
                };
                const patch = (next: Partial<RestrictionDraft>) =>
                  setDrafts((prev) => ({ ...prev, [row.date]: { ...draft, ...next } }));
                return (
                  <tr key={row.date} className="border-t border-border">
                    <td className="px-4 py-2 whitespace-nowrap">{formatStayDate(row.date)}</td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={1}
                        className="w-20"
                        value={draft.minStay}
                        onChange={(e) => patch({ minStay: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={1}
                        className="w-20"
                        value={draft.maxStay}
                        onChange={(e) => patch({ maxStay: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        checked={draft.closedToArrival}
                        onCheckedChange={(v) => patch({ closedToArrival: v === true })}
                        aria-label={`Closed to arrival on ${row.date}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        checked={draft.closedToDeparture}
                        onCheckedChange={(v) => patch({ closedToDeparture: v === true })}
                        aria-label={`Closed to departure on ${row.date}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        checked={draft.stopSell}
                        onCheckedChange={(v) => patch({ stopSell: v === true })}
                        aria-label={`Stop sell on ${row.date}`}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ date: row.date, draft })}
                      >
                        Save
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
