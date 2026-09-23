import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3InheritedStrip,
  Card3ListSection,
  Card3OverlapSheet,
  Card3StatusDot,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
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
  const [categorySearch, setCategorySearch] = useState("");
  const [planSearch, setPlanSearch] = useState("");
  const [calendarSearch, setCalendarSearch] = useState("");
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

  const filteredCategories = useMemo(
    () => categories.filter((row) => matchesQuery(categorySearch, row.code, row.name)),
    [categories, categorySearch],
  );
  const filteredPlans = useMemo(
    () =>
      plans.filter((row) =>
        matchesQuery(
          planSearch,
          row.code,
          row.name,
          row.categoryName,
          row.roomTypeCode,
          row.roomTypeName,
        ),
      ),
    [plans, planSearch],
  );
  const filteredCalendar = useMemo(
    () =>
      calendar.filter((row) =>
        matchesQuery(calendarSearch, row.ratePlanCode, row.rateDate, String(row.nightlyRate)),
      ),
    [calendar, calendarSearch],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-rates", restaurantId] });
  }

  const categoryMut = useMutation({
    mutationFn: (input: Parameters<typeof saveCategory>[0]["data"]) =>
      saveCategory({ data: input }),
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
    mutationFn: (input: Parameters<typeof saveOverride>[0]["data"]) =>
      saveOverride({ data: input }),
    onSuccess: () => {
      toast.success("Rate calendar saved.");
      setCalendarDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pricedTypes = new Set(
    plans.filter((row) => row.active && row.baseRate > 0).map((row) => row.roomTypeId),
  );
  void CARD3_RATES_TABS;

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rates…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Rates & Pricing are unavailable."}
        </p>
      ) : (
        <div className="space-y-4" data-testid="pms-card3-rates">
          <Card3InheritedStrip>
            {CARD3_RATES_CARD2_COPY} {CARD3_RATES_DERIVED_COPY}
          </Card3InheritedStrip>

          <Card3ListSection
            title="Rate categories"
            icon="tag"
            search={categorySearch}
            onSearch={setCategorySearch}
            placeholder="Search rate categories"
            addLabel="Add category"
            onAdd={() => setCategoryDraft("new")}
            canEdit={canEdit}
            empty="No rate categories yet."
            columns={["Code", "Name", "Status"]}
            rows={filteredCategories.map((row) => ({
              id: row.id,
              cells: [row.code, row.name, <Card3StatusDot active={row.active} />],
              onEdit: () => setCategoryDraft(row),
            }))}
          />
          <Card3ListSection
            title="Room rates"
            icon="money"
            search={planSearch}
            onSearch={setPlanSearch}
            placeholder="Search rate plans"
            addLabel="Add rate plan"
            onAdd={() => setPlanDraft("new")}
            canEdit={canEdit}
            empty="No room rates yet. Create a category, then a plan on a Card 2 room type."
            columns={["Code", "Name", "Category", "Room type", "Base rate", "Status"]}
            rows={filteredPlans.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.categoryName || row.categoryId,
                `${row.roomTypeCode} ${row.roomTypeName}`.trim(),
                String(row.baseRate),
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setPlanDraft(row),
            }))}
          />

          <Card3ListSection
            title="Rate calendar"
            icon="date"
            search={calendarSearch}
            onSearch={setCalendarSearch}
            placeholder="Search calendar"
            addLabel="Add calendar override"
            onAdd={() => setCalendarDraft("new")}
            canEdit={canEdit}
            empty="No date overrides yet. The plan base rate applies until you save a calendar row."
            columns={["Plan", "Date", "Nightly rate"]}
            rows={filteredCalendar.map((row) => ({
              id: row.id,
              cells: [row.ratePlanCode, row.rateDate, String(row.nightlyRate)],
              onEdit: () => setCalendarDraft(row),
            }))}
          />

          <CategoryDrawer
            key={categoryDraft === "new" ? "cat-new" : (categoryDraft?.id ?? "cat-closed")}
            open={categoryDraft !== null}
            canEdit={canEdit}
            value={categoryDraft === "new" || categoryDraft === null ? null : categoryDraft}
            pending={categoryMut.isPending}
            onClose={() => setCategoryDraft(null)}
            onSave={(payload) => categoryMut.mutate({ restaurantId, ...payload })}
          />
          <PlanDrawer
            key={planDraft === "new" ? "plan-new" : (planDraft?.id ?? "plan-closed")}
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
            key={calendarDraft === "new" ? "cal-new" : (calendarDraft?.id ?? "cal-closed")}
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
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit category" : "Add category"}
      description="BAR is a category code. There is no separate BAR flag in this schema."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save category"
      onSubmit={() => onSave({ ...(value ? { id: value.id } : {}), code, name, active })}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="cat-code">Code</Label>
          <Input
            id="cat-code"
            value={code}
            disabled={!canEdit}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cat-name">Name</Label>
          <Input
            id="cat-name"
            value={name}
            disabled={!canEdit}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2">
          <Label htmlFor="cat-active">Active</Label>
          <Switch
            id="cat-active"
            checked={active}
            disabled={!canEdit}
            onCheckedChange={setActive}
          />
        </div>
      </div>
    </Card3OverlapSheet>
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
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit rate plan" : "Add rate plan"}
      description="Choose an existing Card 2 room type. Setup changes do not reprice confirmed reservations."
      canEdit={canEdit && Boolean(categoryId) && Boolean(roomTypeId)}
      pending={pending}
      submitLabel="Save rate plan"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          categoryId,
          roomTypeId,
          code,
          name,
          baseRate,
          active,
        })
      }
    >
      <div className="space-y-3">
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
          <Input
            id="plan-code"
            value={code}
            disabled={!canEdit}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan-name">Name</Label>
          <Input
            id="plan-name"
            value={name}
            disabled={!canEdit}
            onChange={(event) => setName(event.target.value)}
          />
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
          <Switch
            id="plan-active"
            checked={active}
            disabled={!canEdit}
            onCheckedChange={setActive}
          />
        </div>
      </div>
    </Card3OverlapSheet>
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
  onSave: (payload: {
    id?: string;
    ratePlanId: string;
    rateDate: string;
    nightlyRate: number;
  }) => void;
}) {
  const [ratePlanId, setRatePlanId] = useState(value?.ratePlanId ?? plans[0]?.id ?? "");
  const [rateDate, setRateDate] = useState(
    value?.rateDate ?? new Date().toISOString().slice(0, 10),
  );
  const [nightlyRate, setNightlyRate] = useState(value?.nightlyRate ?? 0);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit calendar override" : "Add calendar override"}
      description="Date overrides live on the existing hotel rate calendar. Confirmed stays keep their snapshot."
      canEdit={canEdit && Boolean(ratePlanId)}
      pending={pending}
      submitLabel="Save override"
      onSubmit={() =>
        onSave({ ...(value ? { id: value.id } : {}), ratePlanId, rateDate, nightlyRate })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Rate plan</Label>
          <Select
            value={ratePlanId}
            disabled={!canEdit || Boolean(value)}
            onValueChange={setRatePlanId}
          >
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
          <Input
            id="cal-date"
            type="date"
            value={rateDate}
            disabled={!canEdit}
            onChange={(event) => setRateDate(event.target.value)}
          />
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
      </div>
    </Card3OverlapSheet>
  );
}
