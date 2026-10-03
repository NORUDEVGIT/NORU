import { useEffect, useMemo, useState } from "react";
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
  Card3ListSection,
  Card3OverlapSheet,
  Card3StatusDot,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  getRatesCard2,
  saveRateCategoryCard2,
  saveRatePlanCard2,
} from "@/packages/pms/lib/rates-card2.functions";
import {
  CARD2_RATES_ROOM_TYPES_COPY,
  type RateCategoryRow,
  type RatePlanRow,
  type RatesCard2Snapshot,
} from "@/packages/pms/lib/rates-card2.server";

function matchesQuery(query: string, ...values: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => value.toLowerCase().includes(q));
}

export function PmsPropertySetupCard2Rates({
  restaurantId,
  canEdit,
  onReadiness,
}: {
  restaurantId: string;
  canEdit: boolean;
  onReadiness?: (status: PropertySetupCardStatus, blockers: string[], warnings: string[]) => void;
  onNavigateToRoomTypes?: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getRatesCard2);
  const saveCategory = useServerFn(saveRateCategoryCard2);
  const savePlan = useServerFn(saveRatePlanCard2);

  const [categorySearch, setCategorySearch] = useState("");
  const [planSearch, setPlanSearch] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<RateCategoryRow | "new" | null>(null);
  const [planDraft, setPlanDraft] = useState<RatePlanRow | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card2-rates", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  const snapshot: RatesCard2Snapshot | undefined = query.data?.snapshot;
  const readiness = query.data?.readiness;
  const roomTypes = snapshot?.roomTypes ?? [];
  const categories = snapshot?.categories ?? [];
  const plans = snapshot?.plans ?? [];

  useEffect(() => {
    if (readiness && onReadiness) {
      onReadiness(readiness.status, readiness.blockers, []);
    }
  }, [readiness, onReadiness]);

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

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });
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

  return (
    <div className="space-y-5" data-testid="pms-card2-rates">
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rates…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Rates & Pricing are unavailable."}
        </p>
      ) : (
        <div className="space-y-4">
          {roomTypes.length === 0 ? (
            <div className="flex items-center justify-between rounded-xl border border-[#F4EDE0] bg-[#FFFBF5] p-3 text-sm text-[#8A641A]">
              <div>
                <p className="font-medium">No room types are configured yet.</p>
                <p className="text-xs text-[#756A5B]">{CARD2_RATES_ROOM_TYPES_COPY}</p>
              </div>
              {onNavigateToRoomTypes ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onNavigateToRoomTypes}
                  className="border-[#D9D2C4] bg-white text-[#251605]"
                >
                  Configure Room Types
                </Button>
              ) : null}
            </div>
          ) : null}

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
              cells: [row.code, row.name, <Card3StatusDot key="status" active={row.active} />],
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
                <Card3StatusDot key="status" active={row.active} />,
              ],
              onEdit: () => setPlanDraft(row),
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
        </div>
      )}
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
  roomTypes: RatesCard2Snapshot["roomTypes"];
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
