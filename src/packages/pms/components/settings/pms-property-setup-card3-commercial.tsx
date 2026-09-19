import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Switch } from "@/shared/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import { propertySetupStatusLabel } from "@/packages/pms/lib/pms-property-setup-card1";
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
  type Card3CommercialTabId,
  type CommercialCard3AuditRow,
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

function roomTypeSummary(
  ids: string[],
  roomTypes: CommercialCard3Snapshot["roomTypes"],
) {
  if (ids.length === 0) return "All types (setup hint)";
  const labels = new Map(roomTypes.map((row) => [row.id, `${row.code} — ${row.name}`]));
  return ids.map((id) => labels.get(id) ?? id).join(", ");
}

export function PmsPropertySetupCard3Commercial({
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
  const load = useServerFn(getCommercialCard3);
  const saveRestriction = useServerFn(saveCommercialRestrictionCard3);
  const savePromotion = useServerFn(saveCommercialPromotionCard3);
  const saveSeason = useServerFn(saveCommercialSeasonCard3);
  const [tab, setTab] = useState<Card3CommercialTabId>("overview");
  const [search, setSearch] = useState("");
  const [showAudit, setShowAudit] = useState(false);
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
  const audit = (query.data?.audit ?? []) as CommercialCard3AuditRow[];
  const readiness = query.data?.readiness;
  const restrictions = useMemo(() => snapshot?.restrictions ?? [], [snapshot?.restrictions]);
  const promotions = useMemo(() => snapshot?.promotions ?? [], [snapshot?.promotions]);
  const seasons = useMemo(() => snapshot?.seasons ?? [], [snapshot?.seasons]);
  const roomTypes = snapshot?.roomTypes ?? [];
  const filteredRestrictions = useMemo(
    () =>
      restrictions.filter((row) =>
        matchesQuery(search, row.code, row.name, row.restrictionKindLabel, row.description),
      ),
    [restrictions, search],
  );
  const filteredPromotions = useMemo(
    () =>
      promotions.filter((row) =>
        matchesQuery(search, row.code, row.name, row.promoKindLabel, row.conditions, row.description),
      ),
    [promotions, search],
  );
  const filteredSeasons = useMemo(
    () =>
      seasons.filter((row) =>
        matchesQuery(search, row.code, row.name, row.seasonTypeLabel, row.description),
      ),
    [seasons, search],
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

  const searchLabel =
    tab === "restrictions"
      ? "Search restrictions"
      : tab === "promotions"
        ? "Search promotions"
        : "Search seasons";

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Card3CommercialTabId)}>
      <PmsPropertySetupCard3Workspace
        domain={domain}
        onBack={onBack}
        onAuditHistory={() => setShowAudit((open) => !open)}
        tabs={
          <TabsList className="mb-1 flex h-auto flex-wrap">
            {CARD3_COMMERCIAL_TABS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className={goldFocus}
                data-testid={`card3-commercial-tab-${item.id}`}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        }
        search={
          tab === "overview" || tab === "overbooking" ? null : (
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchLabel}
              aria-label={searchLabel}
              className={`max-w-sm ${goldFocus}`}
            />
          )
        }
        drawer={
          showAudit ? (
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="font-display text-lg text-[#251605]">Audit History</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {audit.length === 0 ? (
                  <li className="text-muted-foreground">
                    No commercial-rule changes recorded yet.
                  </li>
                ) : (
                  audit.map((row) => (
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
          <p className="text-sm text-muted-foreground">Loading revenue and commercial rules…</p>
        ) : query.isError || !snapshot ? (
          <p className="text-sm text-destructive">
            {(query.error as Error | undefined)?.message ??
              "Revenue & Commercial Rules are unavailable."}
          </p>
        ) : (
          <div className="space-y-4" data-testid="pms-card3-commercial">
            {tab === "overview" ? (
              <div className="space-y-4">
                <p className="rounded-xl border border-[#E6D7B8] bg-[#f7f4ef] p-4 text-sm text-[#251605]">
                  Restrictions, promotions, and seasons are setup catalogues. Room types are inherited from Card 2. Empty room-type mapping means all types as a setup hint, not an availability engine.
                </p>
                <p className="rounded-xl border border-[#E6D7B8] bg-white p-4 text-sm text-muted-foreground">
                  This configuration does not write hotel_rate_restrictions or price_hotel_stay. SET6 channel stop-sell stays out of this workspace.
                </p>
                <p className="text-sm font-medium text-[#251605]">
                  Domain status: {propertySetupStatusLabel(readiness?.status ?? "not_started")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {restrictions.length} restrictions · {promotions.length} promotions ·{" "}
                  {seasons.length} seasons
                </p>
                {(readiness?.blockers ?? []).length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {readiness?.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {tab === "restrictions" ? (
              <CatalogueTable
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
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setRestrictionDraft(row),
                }))}
              />
            ) : null}

            {tab === "promotions" ? (
              <CatalogueTable
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
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setPromotionDraft(row),
                }))}
              />
            ) : null}

            {tab === "seasons" ? (
              <CatalogueTable
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
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setSeasonDraft(row),
                }))}
              />
            ) : null}

            {tab === "overbooking" ? (
              <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
                <p className="text-sm text-[#251605]">
                  Overbooking policy is inherited from Card 2 Inventory Rules. This tab does not save overbooking.
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
            ) : null}

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
                promotionDraft === "new" ? "promotion-new" : (promotionDraft?.id ?? "promotion-closed")
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
    </Tabs>
  );
}

function CatalogueTable({
  canEdit,
  addLabel,
  empty,
  columns,
  rows,
  onAdd,
}: {
  canEdit: boolean;
  addLabel: string;
  empty: string;
  columns: string[];
  rows: { id: string; cells: string[]; onEdit: () => void }[];
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {canEdit ? (
        <Button
          type="button"
          onClick={onAdd}
          className={`bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 ${goldFocus}`}
        >
          {addLabel}
        </Button>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b bg-[#f7f4ef] text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2">
                  {column}
                </th>
              ))}
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
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
                    <td key={`${row.id}-${index}`} className="px-3 py-2 align-top">
                      {cell}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={goldFocus}
                        onClick={row.onEdit}
                      >
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
    </div>
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
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit restriction" : "Add restriction"}</SheetTitle>
          <SheetDescription>
            Setup catalogue only. Does not write hotel_rate_restrictions.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
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
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="restriction-code">Code</Label>
            <Input
              id="restriction-code"
              value={code}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="restriction-name">Name</Label>
            <Input
              id="restriction-name"
              value={name}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setName(event.target.value)}
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
          <ActiveField id="restriction-active" active={active} canEdit={canEdit} onChange={setActive} />
          {canEdit ? (
            <Button
              type="submit"
              disabled={pending}
              className={`w-full bg-[#C89933] text-[#251605] ${goldFocus}`}
            >
              Save restriction
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
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
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit promotion" : "Add promotion"}</SheetTitle>
          <SheetDescription>Setup classification only. Not a discount engine.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
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
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="promo-code">Code</Label>
            <Input
              id="promo-code"
              value={code}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setCode(event.target.value)}
            />
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
          {canEdit ? (
            <Button
              type="submit"
              disabled={pending}
              className={`w-full bg-[#C89933] text-[#251605] ${goldFocus}`}
            >
              Save promotion
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
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
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit season" : "Add season"}</SheetTitle>
          <SheetDescription>Named season catalogue. Does not write hotel_rate_calendar.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
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
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="season-code">Code</Label>
            <Input
              id="season-code"
              value={code}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="season-name">Name</Label>
            <Input
              id="season-name"
              value={name}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setName(event.target.value)}
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
          {canEdit ? (
            <Button
              type="submit"
              disabled={pending}
              className={`w-full bg-[#C89933] text-[#251605] ${goldFocus}`}
            >
              Save season
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
