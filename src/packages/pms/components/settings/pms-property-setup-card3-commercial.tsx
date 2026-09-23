import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3InheritedStrip,
  Card3ListSection,
  Card3OverlapSheet,
  Card3StatusDot,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import { OVERBOOKING_CAPACITY_NOTE } from "@/packages/pms/lib/inventory-rules-card2.server";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  getCommercialCard3,
  saveCommercialPromotionCard3,
  saveCommercialRestrictionCard3,
  saveCommercialSeasonCard3,
} from "@/packages/pms/lib/commercial-card3.functions";
import {
  CARD3_COMMERCIAL_TABS,
  PROMO_KIND_LABELS,
  PROMO_KINDS,
  RESTRICTION_KIND_LABELS,
  RESTRICTION_KINDS,
  SEASON_TYPE_LABELS,
  SEASON_TYPES,
  type CommercialCard3Snapshot,
  type CommercialPromotionRow,
  type CommercialRestrictionRow,
  type CommercialSeasonRow,
  type PromoKind,
  type RestrictionKind,
  type SeasonType,
} from "@/packages/pms/lib/commercial-card3.server";

const goldFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2";

type RestrictionInput = {
  restaurantId: string;
  id?: string;
  code: string;
  name: string;
  restrictionKind: RestrictionKind;
  minStayNights?: number | null;
  validFrom: string;
  validTo: string;
  description?: string;
  active: boolean;
  roomTypeIds: string[];
};

type PromotionInput = {
  restaurantId: string;
  id?: string;
  code: string;
  name: string;
  promoKind: PromoKind;
  promoValue: number;
  validFrom: string;
  validTo: string;
  conditions?: string;
  description?: string;
  active: boolean;
  roomTypeIds: string[];
};

type SeasonInput = {
  restaurantId: string;
  id?: string;
  code: string;
  name: string;
  seasonType: SeasonType;
  validFrom: string;
  validTo: string;
  rateAdjustmentPercent?: number | null;
  description?: string;
  active: boolean;
  roomTypeIds: string[];
};

function matchesQuery(query: string, ...values: string[]) {
  const normalized = query.trim().toLowerCase();
  return !normalized || values.some((value) => value.toLowerCase().includes(normalized));
}

function roomTypeSummary(ids: string[], roomTypes: CommercialCard3Snapshot["roomTypes"]) {
  if (ids.length === 0) return "All types (setup hint)";
  const labels = new Map(roomTypes.map((row) => [row.id, `${row.code} — ${row.name}`]));
  return ids.map((id) => labels.get(id) ?? id).join(", ");
}

export function PmsPropertySetupCard3Commercial({
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
  const load = useServerFn(getCommercialCard3);
  const saveRestriction = useServerFn(saveCommercialRestrictionCard3);
  const savePromotion = useServerFn(saveCommercialPromotionCard3);
  const saveSeason = useServerFn(saveCommercialSeasonCard3);
  const [restrictionSearch, setRestrictionSearch] = useState("");
  const [promotionSearch, setPromotionSearch] = useState("");
  const [seasonSearch, setSeasonSearch] = useState("");
  const [restrictionDraft, setRestrictionDraft] = useState<CommercialRestrictionRow | "new" | null>(
    null,
  );
  const [promotionDraft, setPromotionDraft] = useState<CommercialPromotionRow | "new" | null>(null);
  const [seasonDraft, setSeasonDraft] = useState<CommercialSeasonRow | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-commercial", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: CommercialCard3Snapshot | undefined = query.data?.snapshot;
  const restrictions = useMemo(() => snapshot?.restrictions ?? [], [snapshot?.restrictions]);
  const promotions = useMemo(() => snapshot?.promotions ?? [], [snapshot?.promotions]);
  const seasons = useMemo(() => snapshot?.seasons ?? [], [snapshot?.seasons]);
  const roomTypes = snapshot?.roomTypes ?? [];
  const filteredRestrictions = useMemo(
    () =>
      restrictions.filter((row) =>
        matchesQuery(
          restrictionSearch,
          row.code,
          row.name,
          row.restrictionKindLabel,
          row.description,
        ),
      ),
    [restrictions, restrictionSearch],
  );
  const filteredPromotions = useMemo(
    () =>
      promotions.filter((row) =>
        matchesQuery(
          promotionSearch,
          row.code,
          row.name,
          row.promoKindLabel,
          row.conditions,
          row.description,
        ),
      ),
    [promotions, promotionSearch],
  );
  const filteredSeasons = useMemo(
    () =>
      seasons.filter((row) =>
        matchesQuery(seasonSearch, row.code, row.name, row.seasonTypeLabel, row.description),
      ),
    [seasons, seasonSearch],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-commercial", restaurantId] });
  }

  const restrictionMutation = useMutation({
    mutationFn: (input: RestrictionInput) => saveRestriction({ data: input }),
    onSuccess: () => {
      toast.success("Restriction saved.");
      setRestrictionDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const promotionMutation = useMutation({
    mutationFn: (input: PromotionInput) => savePromotion({ data: input }),
    onSuccess: () => {
      toast.success("Promotion saved.");
      setPromotionDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const seasonMutation = useMutation({
    mutationFn: (input: SeasonInput) => saveSeason({ data: input }),
    onSuccess: () => {
      toast.success("Season saved.");
      setSeasonDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  void CARD3_COMMERCIAL_TABS;

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading revenue and commercial rules…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ??
            "Revenue & Commercial Rules are unavailable."}
        </p>
      ) : (
        <div className="space-y-4" data-testid="pms-card3-commercial">
          <Card3InheritedStrip>
            Restrictions, promotions, and seasons are setup catalogues. Room types are inherited
            from Card 2. Empty room-type mapping means all types as a setup hint, not an
            availability engine. This configuration does not write hotel_rate_restrictions or
            price_hotel_stay. SET6 channel stop-sell stays out of this workspace.
          </Card3InheritedStrip>

          <Card3ListSection
            title="Restrictions"
            icon="date"
            search={restrictionSearch}
            onSearch={setRestrictionSearch}
            placeholder="Search restrictions"
            canEdit={canEdit}
            addLabel="Add restriction"
            onAdd={() => setRestrictionDraft("new")}
            columns={["Code", "Name", "Kind", "Dates", "Room types", "Status"]}
            empty="No restrictions saved yet."
            rows={filteredRestrictions.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.minStayNights
                  ? `${row.restrictionKindLabel} (${row.minStayNights}n)`
                  : row.restrictionKindLabel,
                `${row.validFrom} → ${row.validTo}`,
                roomTypeSummary(row.roomTypeIds, roomTypes),
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setRestrictionDraft(row),
            }))}
          />

          <Card3ListSection
            title="Promotions"
            icon="tag"
            search={promotionSearch}
            onSearch={setPromotionSearch}
            placeholder="Search promotions"
            canEdit={canEdit}
            addLabel="Add promotion"
            onAdd={() => setPromotionDraft("new")}
            columns={["Code", "Name", "Kind", "Value", "Dates", "Room types", "Status"]}
            empty="No promotions saved yet."
            rows={filteredPromotions.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.promoKindLabel,
                String(row.promoValue),
                `${row.validFrom} → ${row.validTo}`,
                roomTypeSummary(row.roomTypeIds, roomTypes),
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setPromotionDraft(row),
            }))}
          />

          <Card3ListSection
            title="Seasons"
            icon="date"
            search={seasonSearch}
            onSearch={setSeasonSearch}
            placeholder="Search seasons"
            canEdit={canEdit}
            addLabel="Add season"
            onAdd={() => setSeasonDraft("new")}
            columns={["Code", "Name", "Type", "Dates", "Adj %", "Room types", "Status"]}
            empty="No seasons saved yet."
            rows={filteredSeasons.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.seasonTypeLabel,
                `${row.validFrom} → ${row.validTo}`,
                row.rateAdjustmentPercent == null ? "—" : String(row.rateAdjustmentPercent),
                roomTypeSummary(row.roomTypeIds, roomTypes),
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setSeasonDraft(row),
            }))}
          />

          <Card3InheritedStrip>
            <div className="space-y-3">
              <p className="text-sm text-[#251605]">
                Overbooking policy is inherited from Card 2 Inventory Rules. This tab does not save
                overbooking.
              </p>
              <p className="text-sm text-muted-foreground">{OVERBOOKING_CAPACITY_NOTE}</p>
              {snapshot.overbooking ? (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Allowed</dt>
                    <dd>{snapshot.overbooking.overbookingAllowed ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Maximum overbooking</dt>
                    <dd>{snapshot.overbooking.maximumOverbooking ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Percentage limit</dt>
                    <dd>{snapshot.overbooking.percentageLimit ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Manager approval required</dt>
                    <dd>{snapshot.overbooking.managerApprovalRequired ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Reason required</dt>
                    <dd>{snapshot.overbooking.overbookingReasonRequired ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Alerts enabled</dt>
                    <dd>{snapshot.overbooking.overbookingAlertEnabled ? "Yes" : "No"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Card 2 inventory rules found yet. Configure overbooking on Card 2.
                </p>
              )}
            </div>
          </Card3InheritedStrip>

          <RestrictionSheet
            key={
              restrictionDraft === "new"
                ? "restriction-new"
                : (restrictionDraft?.id ?? "restriction-closed")
            }
            open={restrictionDraft !== null}
            canEdit={canEdit}
            roomTypes={roomTypes}
            value={
              restrictionDraft === "new" || restrictionDraft === null ? null : restrictionDraft
            }
            pending={restrictionMutation.isPending}
            onClose={() => setRestrictionDraft(null)}
            onSave={(payload) => restrictionMutation.mutate({ restaurantId, ...payload })}
          />
          <PromotionSheet
            key={
              promotionDraft === "new"
                ? "promotion-new"
                : (promotionDraft?.id ?? "promotion-closed")
            }
            open={promotionDraft !== null}
            canEdit={canEdit}
            roomTypes={roomTypes}
            value={promotionDraft === "new" || promotionDraft === null ? null : promotionDraft}
            pending={promotionMutation.isPending}
            onClose={() => setPromotionDraft(null)}
            onSave={(payload) => promotionMutation.mutate({ restaurantId, ...payload })}
          />
          <SeasonSheet
            key={seasonDraft === "new" ? "season-new" : (seasonDraft?.id ?? "season-closed")}
            open={seasonDraft !== null}
            canEdit={canEdit}
            roomTypes={roomTypes}
            value={seasonDraft === "new" || seasonDraft === null ? null : seasonDraft}
            pending={seasonMutation.isPending}
            onClose={() => setSeasonDraft(null)}
            onSave={(payload) => seasonMutation.mutate({ restaurantId, ...payload })}
          />
        </div>
      )}
    </PmsPropertySetupCard3Workspace>
  );
}

function ActiveField({
  id,
  active,
  canEdit,
  onChange,
}: {
  id: string;
  active: boolean;
  canEdit: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2">
      <Label htmlFor={id}>Active</Label>
      <Switch
        id={id}
        checked={active}
        disabled={!canEdit}
        onCheckedChange={onChange}
        className={goldFocus}
      />
    </div>
  );
}

function ApplicabilityList({
  roomTypes,
  selected,
  canEdit,
  onToggle,
}: {
  roomTypes: CommercialCard3Snapshot["roomTypes"];
  selected: string[];
  canEdit: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-xl border px-3 py-2">
      <legend className="px-1 text-sm font-medium text-[#251605]">Room types (Card 2)</legend>
      <p className="text-xs text-muted-foreground">Leave empty for all types (setup hint).</p>
      {roomTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Card 2 room types available.</p>
      ) : (
        roomTypes.map((row) => {
          const id = `commercial-room-${row.id}`;
          return (
            <div key={row.id} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={selected.includes(row.id)}
                disabled={!canEdit}
                className={goldFocus}
                onCheckedChange={(next) => onToggle(row.id, next === true)}
              />
              <Label htmlFor={id}>
                {row.code} — {row.name}
              </Label>
            </div>
          );
        })
      )}
    </fieldset>
  );
}

function toggle(ids: string[], id: string, checked: boolean, setter: (next: string[]) => void) {
  setter(checked ? [...ids, id] : ids.filter((value) => value !== id));
}

function RestrictionSheet({
  open,
  canEdit,
  roomTypes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  roomTypes: CommercialCard3Snapshot["roomTypes"];
  value: CommercialRestrictionRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<RestrictionInput, "restaurantId">) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [restrictionKind, setRestrictionKind] = useState<RestrictionKind>(
    value?.restrictionKind ?? "min_stay",
  );
  const [minStayNights, setMinStayNights] = useState(value?.minStayNights ?? 1);
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? "");
  const [validTo, setValidTo] = useState(value?.validTo ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [active, setActive] = useState(value?.active ?? true);
  const [roomTypeIds, setRoomTypeIds] = useState(value?.roomTypeIds ?? []);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit restriction" : "Add restriction"}
      description="Setup catalogue only. Does not write hotel_rate_restrictions."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save restriction"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          restrictionKind,
          minStayNights: restrictionKind === "min_stay" ? minStayNights : null,
          validFrom,
          validTo,
          description,
          active,
          roomTypeIds,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="restriction-code">Code</Label>
          <Input
            id="restriction-code"
            value={code}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <p className="text-xs text-muted-foreground">
  Use 1–20 uppercase letters, numbers, or underscores. Example: MIN_STAY_2.
</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="restriction-name">Name</Label>
          <Input
            id="restriction-name"
            value={name}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setName(event.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="restriction-kind">Kind</Label>
          <Select
            value={restrictionKind}
            disabled={!canEdit}
            onValueChange={(next) => setRestrictionKind(next as RestrictionKind)}
          >
            <SelectTrigger id="restriction-kind" className={goldFocus}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESTRICTION_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {RESTRICTION_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {restrictionKind === "min_stay" ? (
          <div className="space-y-1">
            <Label htmlFor="restriction-nights">Minimum stay nights</Label>
            <Input
              id="restriction-nights"
              type="number"
              min={1}
              step={1}
              value={minStayNights}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setMinStayNights(Number(event.target.value))}
            />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="restriction-from">Valid from</Label>
            <Input
              id="restriction-from"
              type="date"
              value={validFrom}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="restriction-to">Valid to</Label>
            <Input
              id="restriction-to"
              type="date"
              value={validTo}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="restriction-description">Description</Label>
          <Textarea
            id="restriction-description"
            value={description}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <ApplicabilityList
          roomTypes={roomTypes}
          selected={roomTypeIds}
          canEdit={canEdit}
          onToggle={(id, checked) => toggle(roomTypeIds, id, checked, setRoomTypeIds)}
        />
        <ActiveField
          id="restriction-active"
          active={active}
          canEdit={canEdit}
          onChange={setActive}
        />
      </div>
    </Card3OverlapSheet>
  );
}

function PromotionSheet({
  open,
  canEdit,
  roomTypes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  roomTypes: CommercialCard3Snapshot["roomTypes"];
  value: CommercialPromotionRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<PromotionInput, "restaurantId">) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [promoKind, setPromoKind] = useState<PromoKind>(value?.promoKind ?? "percent");
  const [promoValue, setPromoValue] = useState(value?.promoValue ?? 0);
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? "");
  const [validTo, setValidTo] = useState(value?.validTo ?? "");
  const [conditions, setConditions] = useState(value?.conditions ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [active, setActive] = useState(value?.active ?? true);
  const [roomTypeIds, setRoomTypeIds] = useState(value?.roomTypeIds ?? []);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit promotion" : "Add promotion"}
      description="Setup classification only. Not a discount engine."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save promotion"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          promoKind,
          promoValue,
          validFrom,
          validTo,
          conditions,
          description,
          active,
          roomTypeIds,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="promo-code">Code</Label>
          <Input
            id="promo-code"
            value={code}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setCode(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
  Use 1–20 uppercase letters, numbers, or underscores. Example: EARLY_BIRD.
</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="promo-name">Name</Label>
          <Input
            id="promo-name"
            value={name}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="promo-kind">Kind</Label>
          <Select
            value={promoKind}
            disabled={!canEdit}
            onValueChange={(next) => setPromoKind(next as PromoKind)}
          >
            <SelectTrigger id="promo-kind" className={goldFocus}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROMO_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {PROMO_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="promo-value">Value</Label>
          <Input
            id="promo-value"
            type="number"
            min={0}
            step={promoKind === "free_night" ? 1 : 0.01}
            value={promoValue}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setPromoValue(Number(event.target.value))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="promo-from">Valid from</Label>
            <Input
              id="promo-from"
              type="date"
              value={validFrom}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="promo-to">Valid to</Label>
            <Input
              id="promo-to"
              type="date"
              value={validTo}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="promo-conditions">Conditions</Label>
          <Textarea
            id="promo-conditions"
            value={conditions}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setConditions(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="promo-description">Description</Label>
          <Textarea
            id="promo-description"
            value={description}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <ApplicabilityList
          roomTypes={roomTypes}
          selected={roomTypeIds}
          canEdit={canEdit}
          onToggle={(id, checked) => toggle(roomTypeIds, id, checked, setRoomTypeIds)}
        />
        <ActiveField id="promo-active" active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}

function SeasonSheet({
  open,
  canEdit,
  roomTypes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  roomTypes: CommercialCard3Snapshot["roomTypes"];
  value: CommercialSeasonRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<SeasonInput, "restaurantId">) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [seasonType, setSeasonType] = useState<SeasonType>(value?.seasonType ?? "high");
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? "");
  const [validTo, setValidTo] = useState(value?.validTo ?? "");
  const [adjustment, setAdjustment] = useState(
    value?.rateAdjustmentPercent == null ? "" : String(value.rateAdjustmentPercent),
  );
  const [description, setDescription] = useState(value?.description ?? "");
  const [active, setActive] = useState(value?.active ?? true);
  const [roomTypeIds, setRoomTypeIds] = useState(value?.roomTypeIds ?? []);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit season" : "Add season"}
      description="Named season catalogue. Does not write hotel_rate_calendar."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save season"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          seasonType,
          validFrom,
          validTo,
          rateAdjustmentPercent: adjustment.trim() === "" ? null : Number(adjustment),
          description,
          active,
          roomTypeIds,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="season-code">Code</Label>
          <Input
            id="season-code"
            value={code}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setCode(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
  Use 1–20 uppercase letters, numbers, or underscores. Example: HIGH_SEASON.
</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-name">Name</Label>
          <Input
            id="season-name"
            value={name}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setName(event.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-type">Type</Label>
          <Select
            value={seasonType}
            disabled={!canEdit}
            onValueChange={(next) => setSeasonType(next as SeasonType)}
          >
            <SelectTrigger id="season-type" className={goldFocus}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEASON_TYPES.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {SEASON_TYPE_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="season-from">Valid from</Label>
            <Input
              id="season-from"
              type="date"
              value={validFrom}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="season-to">Valid to</Label>
            <Input
              id="season-to"
              type="date"
              value={validTo}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-adj">Rate adjustment % (setup hint)</Label>
          <Input
            id="season-adj"
            type="number"
            min={-100}
            max={100}
            step={0.01}
            value={adjustment}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setAdjustment(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-description">Description</Label>
          <Textarea
            id="season-description"
            value={description}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <ApplicabilityList
          roomTypes={roomTypes}
          selected={roomTypeIds}
          canEdit={canEdit}
          onToggle={(id, checked) => toggle(roomTypeIds, id, checked, setRoomTypeIds)}
        />
        <ActiveField id="season-active" active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}
