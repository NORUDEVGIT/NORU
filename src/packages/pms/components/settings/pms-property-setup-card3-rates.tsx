import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import { propertySetupStatusLabel } from "@/packages/pms/lib/pms-property-setup-card1";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  getRatesCard3,
  saveRateCategoryCard3,
  saveRateOverrideCard3,
  saveRatePlanCard3,
} from "@/packages/pms/lib/rates-card3.functions";
import {
  CARD3_RATES_CARD2_COPY,
  CARD3_RATES_DERIVED_COPY,
  CARD3_RATES_TABS,
  type Card3RatesTabId,
  type RateCalendarRow,
  type RateCategoryRow,
  type RatePlanRow,
  type RatesCard3Snapshot,
} from "@/packages/pms/lib/rates-card3.server";

function matchesQuery(query: string, ...values: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => value.toLowerCase().includes(q));
}

export function PmsPropertySetupCard3Rates({
  restaurantId,
  canEdit,
  domain,
  onBack,
}: {
  restaurantId: string;
  canEdit: boolean;
  domain: Card3Domain;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getRatesCard3);
  const saveCategory = useServerFn(saveRateCategoryCard3);
  const savePlan = useServerFn(saveRatePlanCard3);
  const saveOverride = useServerFn(saveRateOverrideCard3);
  const [tab, setTab] = useState<Card3RatesTabId>("overview");
  const [search, setSearch] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<RateCategoryRow | "new" | null>(null);
  const [planDraft, setPlanDraft] = useState<RatePlanRow | "new" | null>(null);
  const [calendarDraft, setCalendarDraft] = useState<RateCalendarRow | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-rates", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: RatesCard3Snapshot | undefined = query.data?.snapshot;
  const roomTypes = snapshot?.roomTypes ?? [];
  const categories = snapshot?.categories ?? [];
  const plans = snapshot?.plans ?? [];
  const calendar = snapshot?.calendar ?? [];

  const filteredPlans = useMemo(
    () =>
      plans.filter((row) =>
        matchesQuery(search, row.code, row.name, row.categoryName, row.roomTypeCode, row.roomTypeName),
      ),
    [plans, search],
  );
  const filteredCalendar = useMemo(
    () => calendar.filter((row) => matchesQuery(search, row.ratePlanCode, row.rateDate, String(row.nightlyRate))),
    [calendar, search],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-rates", restaurantId] });
  }

  const categoryMut = useMutation({
    mutationFn: (input: Parameters<typeof saveCategory>[0]["data"]) => saveCategory({ data: input }),
    onSuccess: () => {
      toast.success("Rate category saved.");
      setCategoryDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const planMut = useMutation({
    mutationFn: (input: Parameters<typeof savePlan>[0]["data"]) => savePlan({ data: input }),
    onSuccess: () => {
      toast.success("Rate plan saved.");
      setPlanDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const calendarMut = useMutation({
    mutationFn: (input: Parameters<typeof saveOverride>[0]["data"]) => saveOverride({ data: input }),
    onSuccess: () => {
      toast.success("Rate calendar saved.");
      setCalendarDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pricedTypes = new Set(plans.filter((row) => row.active && row.baseRate > 0).map((row) => row.roomTypeId));

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Card3RatesTabId)}>
      <PmsPropertySetupCard3Workspace
        domain={domain}
        onBack={onBack}
        onAuditHistory={() => setShowAudit((open) => !open)}
        tabs={
          <TabsList className="mb-1 flex h-auto flex-wrap">
            {CARD3_RATES_TABS.map((item) => (
              <TabsTrigger key={item.id} value={item.id} data-testid={`card3-rates-tab-${item.id}`}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        }
        search={
          tab === "overview" ? null : (
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tab === "rate-calendar" ? "Search calendar" : "Search rate plans"}
              aria-label={tab === "rate-calendar" ? "Search calendar" : "Search rate plans"}
              className="max-w-sm"
            />
          )
        }
        drawer={
          showAudit ? (
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="font-display text-lg text-[#251605]">Audit History</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(query.data?.audit ?? []).length === 0 ? (
                  <li className="text-muted-foreground">No rate catalogue changes recorded yet.</li>
                ) : (
                  (query.data?.audit ?? []).map((row) => (
                    <li key={row.id}>
                      <p className="font-medium text-[#251605]">{row.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.detail ? `${row.detail} · ` : ""}
                        {row.createdAt}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null
        }
      >
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading rates…</p>
        ) : query.isError || !snapshot ? (
          <p className="text-sm text-destructive">
            {(query.error as Error | undefined)?.message ?? "Rates & Pricing are unavailable."}
          </p>
        ) : (
          <div className="space-y-4" data-testid="pms-card3-rates">
            {tab === "overview" ? (
              <div className="space-y-4">
                <p className="rounded-xl border border-[#E6D7B8] bg-[#f7f4ef] p-4 text-sm text-[#251605]">
                  {CARD3_RATES_CARD2_COPY}
                </p>
                <p className="rounded-xl border border-[#E6D7B8] bg-white p-4 text-sm text-muted-foreground">
                  {CARD3_RATES_DERIVED_COPY}
                </p>
                <p className="text-sm font-medium text-[#251605]">
                  Domain status: {propertySetupStatusLabel(query.data?.readiness.status ?? "not_started")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {categories.length} categories · {plans.length} plans · {calendar.length} calendar rows · {pricedTypes.size} of{" "}
                  {roomTypes.length} Card 2 room types priced
                </p>
                {(query.data?.readiness.blockers ?? []).length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {query.data?.readiness.blockers.map((row) => (
                      <li key={row}>{row}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {tab === "rate-plans" ? (
              <div className="space-y-3">
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => setCategoryDraft("new")} variant="outline">
                      Add category
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setPlanDraft("new")}
                      className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                    >
                      Add rate plan
                    </Button>
                  </div>
                ) : null}
                <RateTable
                  empty="No rate plans yet. Create a category such as BAR, then a plan on a Card 2 room type."
                  columns={["Code", "Name", "Category", "Room type", "Base rate", "Status"]}
                  rows={filteredPlans.map((row) => ({
                    id: row.id,
                    cells: [
                      row.code,
                      row.name,
                      row.categoryName || row.categoryId,
                      `${row.roomTypeCode} ${row.roomTypeName}`.trim(),
                      String(row.baseRate),
                      row.active ? "Active" : "Inactive",
                    ],
                    onEdit: canEdit ? () => setPlanDraft(row) : undefined,
                  }))}
                />
                {categories.length > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Categories: {categories.map((row) => `${row.code} (${row.active ? "active" : "inactive"})`).join(", ")}
                    {canEdit
                      ? categories.map((row) => (
                          <Button
                            key={row.id}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="ml-1 h-auto px-1"
                            onClick={() => setCategoryDraft(row)}
                          >
                            Edit {row.code}
                          </Button>
                        ))
                      : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "room-rates" ? (
              <RateTable
                empty="No room rates yet. Plans carry the base rate for an existing Card 2 type."
                columns={["Room type", "Plan", "Category", "Base rate", "Status"]}
                rows={filteredPlans.map((row) => ({
                  id: row.id,
                  cells: [
                    `${row.roomTypeCode} — ${row.roomTypeName}`,
                    row.code,
                    row.categoryName,
                    String(row.baseRate),
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: canEdit ? () => setPlanDraft(row) : undefined,
                }))}
              />
            ) : null}

            {tab === "rate-calendar" ? (
              <div className="space-y-3">
                {canEdit ? (
                  <Button
                    type="button"
                    onClick={() => setCalendarDraft("new")}
                    className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                  >
                    Add calendar override
                  </Button>
                ) : null}
                <RateTable
                  empty="No date overrides yet. The plan base rate applies until you save a calendar row."
                  columns={["Plan", "Date", "Nightly rate"]}
                  rows={filteredCalendar.map((row) => ({
                    id: row.id,
                    cells: [row.ratePlanCode, row.rateDate, String(row.nightlyRate)],
                    onEdit: canEdit ? () => setCalendarDraft(row) : undefined,
                  }))}
                />
              </div>
            ) : null}

            <CategoryDrawer
              key={categoryDraft === "new" ? "cat-new" : categoryDraft?.id ?? "cat-closed"}
              open={categoryDraft !== null}
              canEdit={canEdit}
              value={categoryDraft === "new" || categoryDraft === null ? null : categoryDraft}
              pending={categoryMut.isPending}
              onClose={() => setCategoryDraft(null)}
              onSave={(payload) => categoryMut.mutate({ restaurantId, ...payload })}
            />
            <PlanDrawer
              key={planDraft === "new" ? "plan-new" : planDraft?.id ?? "plan-closed"}
              open={planDraft !== null}
              canEdit={canEdit}
              categories={categories}
              roomTypes={roomTypes}
              value={planDraft === "new" || planDraft === null ? null : planDraft}
              pending={planMut.isPending}
              onClose={() => setPlanDraft(null)}
              onSave={(payload) => planMut.mutate({ restaurantId, ...payload })}
            />
            <CalendarDrawer
              key={calendarDraft === "new" ? "cal-new" : calendarDraft?.id ?? "cal-closed"}
              open={calendarDraft !== null}
              canEdit={canEdit}
              plans={plans}
              value={calendarDraft === "new" || calendarDraft === null ? null : calendarDraft}
              pending={calendarMut.isPending}
              onClose={() => setCalendarDraft(null)}
              onSave={(payload) => calendarMut.mutate({ restaurantId, ...payload })}
            />
          </div>
        )}
      </PmsPropertySetupCard3Workspace>
    </Tabs>
  );
}

function RateTable({
  empty,
  columns,
  rows,
}: {
  empty: string;
  columns: string[];
  rows: { id: string; cells: string[]; onEdit?: () => void }[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="border-b bg-[#f7f4ef] text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2">
                {column}
              </th>
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-6 text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t">
                {row.cells.map((cell, index) => (
                  <td key={`${row.id}-${index}`} className="px-3 py-2">
                    {cell}
                  </td>
                ))}
                <td className="px-3 py-2">
                  {row.onEdit ? (
                    <Button type="button" variant="outline" size="sm" onClick={row.onEdit}>
                      Edit
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CategoryDrawer({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: RateCategoryRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: { id?: string; code: string; name: string; active: boolean }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "BAR");
  const [name, setName] = useState(value?.name ?? "Best Available Rate");
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit category" : "Add category"}</SheetTitle>
          <SheetDescription>BAR is a category code. There is no separate BAR flag in this schema.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({ id: value?.id, code, name, active });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="cat-code">Code</Label>
            <Input id="cat-code" value={code} disabled={!canEdit} onChange={(event) => setCode(event.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} disabled={!canEdit} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label htmlFor="cat-active">Active</Label>
            <Switch id="cat-active" checked={active} disabled={!canEdit} onCheckedChange={setActive} />
          </div>
          {canEdit ? (
            <Button type="submit" disabled={pending} className="w-full bg-[#C89933] text-[#251605]">
              Save category
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function PlanDrawer({
  open,
  canEdit,
  categories,
  roomTypes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  categories: RateCategoryRow[];
  roomTypes: RatesCard3Snapshot["roomTypes"];
  value: RatePlanRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    categoryId: string;
    roomTypeId: string;
    code: string;
    name: string;
    baseRate: number;
    active: boolean;
  }) => void;
}) {
  const [categoryId, setCategoryId] = useState(value?.categoryId ?? categories[0]?.id ?? "");
  const [roomTypeId, setRoomTypeId] = useState(value?.roomTypeId ?? roomTypes[0]?.id ?? "");
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [baseRate, setBaseRate] = useState(value?.baseRate ?? 0);
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit rate plan" : "Add rate plan"}</SheetTitle>
          <SheetDescription>Choose an existing Card 2 room type. Setup changes do not reprice confirmed reservations.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({ id: value?.id, categoryId, roomTypeId, code, name, baseRate, active });
          }}
        >
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={categoryId} disabled={!canEdit} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Room type (Card 2)</Label>
            <Select value={roomTypeId} disabled={!canEdit} onValueChange={setRoomTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a room type" />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-code">Code</Label>
            <Input id="plan-code" value={code} disabled={!canEdit} onChange={(event) => setCode(event.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" value={name} disabled={!canEdit} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-rate">Base rate</Label>
            <Input
              id="plan-rate"
              type="number"
              min={0}
              step="any"
              value={baseRate}
              disabled={!canEdit}
              onChange={(event) => setBaseRate(Number(event.target.value))}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label htmlFor="plan-active">Active</Label>
            <Switch id="plan-active" checked={active} disabled={!canEdit} onCheckedChange={setActive} />
          </div>
          {canEdit ? (
            <Button type="submit" disabled={pending || !categoryId || !roomTypeId} className="w-full bg-[#C89933] text-[#251605]">
              Save rate plan
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CalendarDrawer({
  open,
  canEdit,
  plans,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  plans: RatePlanRow[];
  value: RateCalendarRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: { id?: string; ratePlanId: string; rateDate: string; nightlyRate: number }) => void;
}) {
  const [ratePlanId, setRatePlanId] = useState(value?.ratePlanId ?? plans[0]?.id ?? "");
  const [rateDate, setRateDate] = useState(value?.rateDate ?? new Date().toISOString().slice(0, 10));
  const [nightlyRate, setNightlyRate] = useState(value?.nightlyRate ?? 0);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit calendar override" : "Add calendar override"}</SheetTitle>
          <SheetDescription>Date overrides live on the existing hotel rate calendar. Confirmed stays keep their snapshot.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({ id: value?.id, ratePlanId, rateDate, nightlyRate });
          }}
        >
          <div className="space-y-1">
            <Label>Rate plan</Label>
            <Select value={ratePlanId} disabled={!canEdit || Boolean(value)} onValueChange={setRatePlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.roomTypeCode} {row.roomTypeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cal-date">Date</Label>
            <Input id="cal-date" type="date" value={rateDate} disabled={!canEdit} onChange={(event) => setRateDate(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cal-rate">Nightly rate</Label>
            <Input
              id="cal-rate"
              type="number"
              min={0}
              step="any"
              value={nightlyRate}
              disabled={!canEdit}
              onChange={(event) => setNightlyRate(Number(event.target.value))}
            />
          </div>
          {canEdit ? (
            <Button type="submit" disabled={pending || !ratePlanId} className="w-full bg-[#C89933] text-[#251605]">
              Save override
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
