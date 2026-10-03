import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
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
  saveRateCancellationPolicyCard3,
  saveRateCategoryCard3,
  saveRateOverrideCard3,
  saveRatePlanCard3,
  saveRateRefundabilityCard3,
} from "@/packages/pms/lib/rates-card3.functions";
import {
  CARD3_RATES_CARD2_COPY,
  CARD3_RATES_DERIVED_COPY,
  CARD3_RATES_TABS,
  type RateCalendarRow,
  type RateCancellationPolicyRow,
  type RateCategoryRow,
  type RatePlanRow,
  type RateRefundabilityRow,
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
  const saveCancellation = useServerFn(saveRateCancellationPolicyCard3);
  const saveRefundability = useServerFn(saveRateRefundabilityCard3);
  const [categorySearch, setCategorySearch] = useState("");
  const [planSearch, setPlanSearch] = useState("");
  const [calendarSearch, setCalendarSearch] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<RateCategoryRow | "new" | null>(null);
  const [planDraft, setPlanDraft] = useState<RatePlanRow | "new" | null>(null);
  const [calendarDraft, setCalendarDraft] = useState<RateCalendarRow | "new" | null>(null);
  const [cancellationDraft, setCancellationDraft] = useState<RateCancellationPolicyRow | "new" | null>(null);
  const [refundabilityDraft, setRefundabilityDraft] = useState<RateRefundabilityRow | "new" | null>(null);
  const [cancellationSearch, setCancellationSearch] = useState("");
  const [refundabilitySearch, setRefundabilitySearch] = useState("");

  const query = useQuery({
    queryKey: ["pms-card3-rates", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: RatesCard3Snapshot | undefined = query.data?.snapshot;
  const roomTypes = snapshot?.roomTypes ?? [];
  const categories = snapshot?.categories ?? [];
  const plans = snapshot?.plans ?? [];
  const calendar = snapshot?.calendar ?? [];
  const cancellationPolicies = snapshot?.cancellationPolicies ?? [];
  const refundabilityCodes = snapshot?.refundabilityCodes ?? [];

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
  const filteredCancellation = useMemo(
    () => cancellationPolicies.filter((row) => matchesQuery(cancellationSearch, row.code, row.name)),
    [cancellationPolicies, cancellationSearch],
  );
  const filteredRefundability = useMemo(
    () => refundabilityCodes.filter((row) => matchesQuery(refundabilitySearch, row.code, row.name, row.kind)),
    [refundabilityCodes, refundabilitySearch],
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
  const cancellationMut = useMutation({
    mutationFn: (input: Parameters<typeof saveCancellation>[0]["data"]) =>
      saveCancellation({ data: input }),
    onSuccess: () => {
      toast.success("Cancellation policy saved.");
      setCancellationDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const refundabilityMut = useMutation({
    mutationFn: (input: Parameters<typeof saveRefundability>[0]["data"]) =>
      saveRefundability({ data: input }),
    onSuccess: () => {
      toast.success("Refundability saved.");
      setRefundabilityDraft(null);
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
            columns={["Code", "Name", "Category", "Room type", "Base rate", "Validity", "Status"]}
            rows={filteredPlans.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.categoryName || row.categoryId,
                `${row.roomTypeCode} ${row.roomTypeName}`.trim(),
                String(row.baseRate),
                `${row.validFrom ?? "Any"} → ${row.validTo ?? "Any"}`,
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setPlanDraft(row),
            }))}
          />

          <Card3ListSection
            title="Cancellation policies"
            icon="tag"
            search={cancellationSearch}
            onSearch={setCancellationSearch}
            placeholder="Search cancellation policies"
            addLabel="Add cancellation policy"
            onAdd={() => setCancellationDraft("new")}
            canEdit={canEdit}
            empty="No guest-facing cancellation policies yet. This catalogue is not the Front Office cancel-fee default."
            columns={["Code", "Name", "Deadline (hours)", "Penalty", "Status"]}
            rows={filteredCancellation.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.deadlineHours == null ? "—" : String(row.deadlineHours),
                `${row.penaltyType} ${row.penaltyValue}`,
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setCancellationDraft(row),
            }))}
          />

          <Card3ListSection
            title="Refundability"
            icon="tag"
            search={refundabilitySearch}
            onSearch={setRefundabilitySearch}
            placeholder="Search refundability"
            addLabel="Add refundability"
            onAdd={() => setRefundabilityDraft("new")}
            canEdit={canEdit}
            empty="No refundability codes yet. Attach one to a rate plan for Step 2 merchandising."
            columns={["Code", "Name", "Kind", "Status"]}
            rows={filteredRefundability.map((row) => ({
              id: row.id,
              cells: [row.code, row.name, row.kind.replaceAll("_", " "), <Card3StatusDot active={row.active} />],
              onEdit: () => setRefundabilityDraft(row),
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
            cancellationPolicies={cancellationPolicies}
            refundabilityCodes={refundabilityCodes}
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
          <CancellationDrawer
            key={cancellationDraft === "new" ? "cx-new" : (cancellationDraft?.id ?? "cx-closed")}
            open={cancellationDraft !== null}
            canEdit={canEdit}
            value={cancellationDraft === "new" || cancellationDraft === null ? null : cancellationDraft}
            pending={cancellationMut.isPending}
            onClose={() => setCancellationDraft(null)}
            onSave={(payload) => cancellationMut.mutate({ restaurantId, ...payload })}
          />
          <RefundabilityDrawer
            key={refundabilityDraft === "new" ? "rf-new" : (refundabilityDraft?.id ?? "rf-closed")}
            open={refundabilityDraft !== null}
            canEdit={canEdit}
            value={refundabilityDraft === "new" || refundabilityDraft === null ? null : refundabilityDraft}
            pending={refundabilityMut.isPending}
            onClose={() => setRefundabilityDraft(null)}
            onSave={(payload) => refundabilityMut.mutate({ restaurantId, ...payload })}
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
  cancellationPolicies,
  refundabilityCodes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  categories: RateCategoryRow[];
  roomTypes: RatesCard3Snapshot["roomTypes"];
  cancellationPolicies: RateCancellationPolicyRow[];
  refundabilityCodes: RateRefundabilityRow[];
  value: RatePlanRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    categoryId: string;
    roomTypeId: string;
    code: string;
    name: string;
    description: string | null;
    baseRate: number;
    validFrom: string | null;
    validTo: string | null;
    cancellationPolicyId: string | null;
    refundabilityId: string | null;
    minAdvanceDays: number | null;
    maxAdvanceDays: number | null;
    active: boolean;
  }) => void;
}) {
  const none = "__none__";
  const [categoryId, setCategoryId] = useState(value?.categoryId ?? categories[0]?.id ?? "");
  const [roomTypeId, setRoomTypeId] = useState(value?.roomTypeId ?? roomTypes[0]?.id ?? "");
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [baseRate, setBaseRate] = useState(value?.baseRate ?? 0);
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? "");
  const [validTo, setValidTo] = useState(value?.validTo ?? "");
  const [cancellationPolicyId, setCancellationPolicyId] = useState(value?.cancellationPolicyId ?? none);
  const [refundabilityId, setRefundabilityId] = useState(value?.refundabilityId ?? none);
  const [minAdvanceDays, setMinAdvanceDays] = useState(value?.minAdvanceDays ?? 0);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(value?.maxAdvanceDays ?? 0);
  const [hasMinAdvance, setHasMinAdvance] = useState(value?.minAdvanceDays != null);
  const [hasMaxAdvance, setHasMaxAdvance] = useState(value?.maxAdvanceDays != null);
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
          description: description.trim() || null,
          baseRate,
          validFrom: validFrom || null,
          validTo: validTo || null,
          cancellationPolicyId: cancellationPolicyId === none ? null : cancellationPolicyId,
          refundabilityId: refundabilityId === none ? null : refundabilityId,
          minAdvanceDays: hasMinAdvance ? minAdvanceDays : null,
          maxAdvanceDays: hasMaxAdvance ? maxAdvanceDays : null,
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
          <Label htmlFor="plan-description">Description</Label>
          <Textarea
            id="plan-description"
            rows={3}
            value={description}
            disabled={!canEdit}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="plan-valid-from">Valid from</Label>
            <Input
              id="plan-valid-from"
              type="date"
              value={validFrom}
              disabled={!canEdit}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-valid-until">Valid until</Label>
            <Input
              id="plan-valid-until"
              type="date"
              value={validTo}
              disabled={!canEdit}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </div>
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
        <div className="space-y-1">
          <Label>Cancellation policy</Label>
          <Select value={cancellationPolicyId} disabled={!canEdit} onValueChange={setCancellationPolicyId}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={none}>None</SelectItem>
              {cancellationPolicies.filter((row) => row.active).map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Refundability</Label>
          <Select value={refundabilityId} disabled={!canEdit} onValueChange={setRefundabilityId}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={none}>None</SelectItem>
              {refundabilityCodes.filter((row) => row.active).map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="plan-min-advance">Min advance days</Label>
            <Input
              id="plan-min-advance"
              type="number"
              min={0}
              value={hasMinAdvance ? minAdvanceDays : ""}
              disabled={!canEdit}
              onChange={(event) => {
                const next = event.target.value;
                setHasMinAdvance(next !== "");
                setMinAdvanceDays(next === "" ? 0 : Number(next));
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-max-advance">Max advance days</Label>
            <Input
              id="plan-max-advance"
              type="number"
              min={0}
              value={hasMaxAdvance ? maxAdvanceDays : ""}
              disabled={!canEdit}
              onChange={(event) => {
                const next = event.target.value;
                setHasMaxAdvance(next !== "");
                setMaxAdvanceDays(next === "" ? 0 : Number(next));
              }}
            />
          </div>
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

function CancellationDrawer({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: RateCancellationPolicyRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    description: string | null;
    deadlineHours: number | null;
    penaltyType: RateCancellationPolicyRow["penaltyType"];
    penaltyValue: number;
    active: boolean;
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [deadlineHours, setDeadlineHours] = useState(value?.deadlineHours ?? 0);
  const [hasDeadline, setHasDeadline] = useState(value?.deadlineHours != null);
  const [penaltyType, setPenaltyType] = useState<RateCancellationPolicyRow["penaltyType"]>(
    value?.penaltyType ?? "none",
  );
  const [penaltyValue, setPenaltyValue] = useState(value?.penaltyValue ?? 0);
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit cancellation policy" : "Add cancellation policy"}
      description="Guest-facing rate policy. This is not the Front Office cancel-fee default on the property."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save policy"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          description: null,
          deadlineHours: hasDeadline ? deadlineHours : null,
          penaltyType,
          penaltyValue,
          active,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="cx-code">Code</Label>
          <Input id="cx-code" value={code} disabled={!canEdit} onChange={(event) => setCode(event.target.value.toUpperCase())} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cx-name">Name</Label>
          <Input id="cx-name" value={name} disabled={!canEdit} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cx-hours">Deadline hours before arrival</Label>
          <Input
            id="cx-hours"
            type="number"
            min={0}
            value={hasDeadline ? deadlineHours : ""}
            disabled={!canEdit}
            onChange={(event) => {
              const next = event.target.value;
              setHasDeadline(next !== "");
              setDeadlineHours(next === "" ? 0 : Number(next));
            }}
          />
        </div>
        <div className="space-y-1">
          <Label>Penalty type</Label>
          <Select value={penaltyType} disabled={!canEdit} onValueChange={(next) => setPenaltyType(next as RateCancellationPolicyRow["penaltyType"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="percent">Percent</SelectItem>
              <SelectItem value="nights">Nights</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cx-value">Penalty value</Label>
          <Input
            id="cx-value"
            type="number"
            min={0}
            step="any"
            value={penaltyValue}
            disabled={!canEdit}
            onChange={(event) => setPenaltyValue(Number(event.target.value))}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2">
          <Label htmlFor="cx-active">Active</Label>
          <Switch id="cx-active" checked={active} disabled={!canEdit} onCheckedChange={setActive} />
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

function RefundabilityDrawer({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: RateRefundabilityRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    description: string | null;
    kind: RateRefundabilityRow["kind"];
    active: boolean;
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [kind, setKind] = useState<RateRefundabilityRow["kind"]>(value?.kind ?? "refundable");
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit refundability" : "Add refundability"}
      description="Reusable refundability label for rate plans. Not a cashiering refund."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save refundability"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          description: null,
          kind,
          active,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="rf-code">Code</Label>
          <Input id="rf-code" value={code} disabled={!canEdit} onChange={(event) => setCode(event.target.value.toUpperCase())} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rf-name">Name</Label>
          <Input id="rf-name" value={name} disabled={!canEdit} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Kind</Label>
          <Select value={kind} disabled={!canEdit} onValueChange={(next) => setKind(next as RateRefundabilityRow["kind"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="refundable">Refundable</SelectItem>
              <SelectItem value="non_refundable">Non-refundable</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2">
          <Label htmlFor="rf-active">Active</Label>
          <Switch id="rf-active" checked={active} disabled={!canEdit} onCheckedChange={setActive} />
        </div>
      </div>
    </Card3OverlapSheet>
  );
}
