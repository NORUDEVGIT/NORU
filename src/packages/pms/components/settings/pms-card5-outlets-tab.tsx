import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ROLE_LABELS } from "@/core/lib/module-access";
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
import { Switch } from "@/shared/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { PmsPropertySetupCard5Workspace } from "./pms-property-setup-card5-workspace";
import { getCard5Facilities, saveCard5Facility } from "../../lib/outlets-card5.functions";
import {
  CARD5_AVAILABILITY_MODES,
  CARD5_FACILITY_CATEGORIES,
  CARD5_FACILITY_CATEGORY_LABELS,
  CARD5_FACILITY_TYPE_SUGGESTIONS,
  CARD5_FEATURES,
  emptyFacilityDraft,
  evaluateCard5FacilitiesReadiness,
  type Card5FacilitiesReadiness,
  type Card5FacilitiesSnapshot,
  type Card5Facility,
  type Card5FacilityCategory,
} from "../../lib/outlets-card5.server";
import {
  CARD5_STAFF_ROLES,
  emptyOperatingHours,
  hoursConfigured,
  type Card5HoursWindow,
  type Card5OperatingHours,
} from "../../lib/departments-card5.server";
import { propertySetupStatusLabel } from "../../lib/pms-property-setup-card1";

const DRAWER_SECTIONS = [
  "Basic",
  "Location",
  "Organization",
  "Capacity & Hours",
  "Commercial",
  "Reservation",
  "Features",
] as const;

const EMPTY_SNAPSHOT: Card5FacilitiesSnapshot = {
  facilities: [],
  buildings: [],
  floors: [],
  wings: [],
  departments: [],
  staff: [],
  taxGroups: [],
  currencies: [],
};

function none(value: string): string | null {
  return value === "none" ? null : value;
}

function nullableNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

function title(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function OptionSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Array<{ id: string; name: string; active: boolean }>;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select
        value={value ?? "none"}
        onValueChange={(next) => onChange(none(next))}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {options
            .filter((row) => row.active || row.id === value)
            .map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
                {!row.active ? " (inactive)" : ""}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function HoursWindow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: Card5HoursWindow | null;
  disabled: boolean;
  onChange: (value: Card5HoursWindow | null) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Switch
          checked={value != null}
          onCheckedChange={(checked) =>
            onChange(checked ? { open: "08:00", close: "17:00" } : null)
          }
          disabled={disabled}
        />
      </div>
      {value ? (
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label={`${label} open`}
            type="time"
            value={value.open}
            onChange={(event) => onChange({ ...value, open: event.target.value })}
            disabled={disabled}
          />
          <Input
            aria-label={`${label} close`}
            type="time"
            value={value.close}
            onChange={(event) => onChange({ ...value, close: event.target.value })}
            disabled={disabled}
          />
        </div>
      ) : null}
    </div>
  );
}

export function Card5OutletsTab({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  function invalidateHub() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card5-validation", restaurantId] });
  }
  const load = useServerFn(getCard5Facilities);
  const save = useServerFn(saveCard5Facility);
  const query = useQuery({
    queryKey: ["pms-card5-facilities", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot = query.data?.snapshot ?? EMPTY_SNAPSHOT;
  const readiness = query.data?.readiness ?? evaluateCard5FacilitiesReadiness(snapshot);
  const editor = canEdit && (query.data?.canEdit ?? canEdit);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | Card5FacilityCategory>("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [draft, setDraft] = useState<Card5Facility | null>(null);
  const [section, setSection] = useState<(typeof DRAWER_SECTIONS)[number]>("Basic");
  const [validated, setValidated] = useState<Card5FacilitiesReadiness | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return snapshot.facilities.filter((row) => {
      if (category !== "all" && row.facilityCategory !== category) return false;
      if (status === "active" && !row.active) return false;
      if (status === "inactive" && row.active) return false;
      return (
        !term || `${row.name} ${row.code} ${row.facilityTypeCode}`.toLowerCase().includes(term)
      );
    });
  }, [snapshot.facilities, search, category, status]);

  const mutation = useMutation({
    mutationFn: (facility: Card5Facility) =>
      save({
        data: {
          restaurantId,
          ...(facility.id ? { id: facility.id } : {}),
          code: facility.code,
          name: facility.name,
          description: facility.description,
          facilityCategory: facility.facilityCategory,
          facilityTypeCode: facility.facilityTypeCode,
          buildingId: facility.buildingId,
          floorId: facility.floorId,
          wingId: facility.wingId,
          departmentId: facility.departmentId,
          managerUserId: facility.managerUserId,
          responsibleRole: facility.responsibleRole,
          minimumCapacity: facility.minimumCapacity,
          standardCapacity: facility.standardCapacity,
          maximumCapacity: facility.maximumCapacity,
          operatingHours: facility.operatingHours,
          chargeable: facility.chargeable,
          revenueCenter: facility.revenueCenter,
          taxGroupId: facility.taxGroupId,
          currencyCode: facility.currencyCode,
          reservationRequired: facility.reservationRequired,
          advanceBookingRequired: facility.advanceBookingRequired,
          minimumLeadMinutes: facility.minimumLeadMinutes,
          availabilityMode: facility.availabilityMode,
          features: facility.features,
          active: facility.active,
        },
      }),
    onSuccess: (result) => {
      invalidateHub();
      queryClient.setQueryData(["pms-card5-facilities", restaurantId], {
        ...query.data,
        snapshot: result.snapshot,
        readiness: result.readiness,
      });
      const saved =
        result.snapshot.facilities.find((row) => row.id === draft?.id) ??
        result.snapshot.facilities.find((row) => row.code === draft?.code) ??
        null;
      setDraft(saved);
      setValidated(null);
      toast.success("Facility saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openCreate() {
    setDraft(
      emptyFacilityDraft({
        operatingHours: emptyOperatingHours({ is24Hours: true }),
      }),
    );
    setSection("Basic");
  }

  function patchHours(next: Partial<Card5OperatingHours>) {
    if (!draft) return;
    setDraft({
      ...draft,
      operatingHours: emptyOperatingHours({ ...draft.operatingHours, ...next }),
    });
  }

  const shownReadiness = validated ?? readiness;
  const filteredFloors = snapshot.floors.filter(
    (row) => !draft?.buildingId || row.buildingId === draft.buildingId,
  );
  const filteredWings = snapshot.wings.filter(
    (row) =>
      (!draft?.floorId || !row.parentId || row.parentId === draft.floorId) &&
      (!draft?.buildingId || !row.buildingId || row.buildingId === draft.buildingId),
  );

  return (
    <PmsPropertySetupCard5Workspace
      validate={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const next = evaluateCard5FacilitiesReadiness(snapshot);
            setValidated(next);
            if (next.ready) toast.success("Outlets & Facilities are ready.");
            else toast.error(next.blockers[0] ?? "Outlets & Facilities are not ready.");
          }}
        >
          Validate
        </Button>
      }
      search={
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1 space-y-1">
              <Label htmlFor="card5-facility-search">Search</Label>
              <Input
                id="card5-facility-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, code or facility type"
              />
            </div>
            <div className="w-36 space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editor ? <Button onClick={openCreate}>Add Facility</Button> : null}
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Facility category filters">
            {(["all", ...CARD5_FACILITY_CATEGORIES] as const).map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={category === item ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setCategory(item)}
              >
                {item === "all" ? "All categories" : CARD5_FACILITY_CATEGORY_LABELS[item]}
              </Button>
            ))}
          </div>
        </div>
      }
      drawer={
        draft ? (
          <div
            className="rounded-2xl border border-[#E6D7B8] bg-card p-4"
            data-testid="pms-card5-facility-drawer"
          >
            <h2 className="font-display text-lg text-[#251605]">
              {draft.id ? draft.name || "Edit facility" : "Add facility"}
            </h2>
            <Tabs
              value={section}
              onValueChange={(value) => setSection(value as typeof section)}
              className="mt-3"
            >
              <TabsList className="mb-3 flex h-auto flex-wrap justify-start">
                {DRAWER_SECTIONS.map((item) => (
                  <TabsTrigger key={item} value={item} className="text-xs">
                    {item}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="Basic" className="space-y-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Unique code</Label>
                  <Input
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select
                    value={draft.facilityCategory}
                    onValueChange={(value) =>
                      setDraft({ ...draft, facilityCategory: value as Card5FacilityCategory })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD5_FACILITY_CATEGORIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {CARD5_FACILITY_CATEGORY_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Facility type code</Label>
                  <Input
                    list="card5-facility-types"
                    value={draft.facilityTypeCode}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        facilityTypeCode: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                      })
                    }
                    disabled={!editor}
                    placeholder="conference_hall or a custom code"
                  />
                  <datalist id="card5-facility-types">
                    {CARD5_FACILITY_TYPE_SUGGESTIONS.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground">
                    Enter a custom snake_case type when the suggested catalogue does not fit.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch
                    checked={draft.active}
                    onCheckedChange={(active) => setDraft({ ...draft, active })}
                    disabled={!editor}
                  />
                </div>
              </TabsContent>

              <TabsContent value="Location" className="space-y-3">
                <OptionSelect
                  label="Building"
                  value={draft.buildingId}
                  options={snapshot.buildings}
                  disabled={!editor}
                  onChange={(buildingId) => setDraft({ ...draft, buildingId, floorId: null })}
                />
                <OptionSelect
                  label="Floor"
                  value={draft.floorId}
                  options={filteredFloors}
                  disabled={!editor}
                  onChange={(floorId) => setDraft({ ...draft, floorId })}
                />
                <OptionSelect
                  label="Wing"
                  value={draft.wingId}
                  options={filteredWings}
                  disabled={!editor}
                  onChange={(wingId) => setDraft({ ...draft, wingId })}
                />
                <p className="text-xs text-muted-foreground">Location options come from Card 2.</p>
              </TabsContent>

              <TabsContent value="Organization" className="space-y-3">
                <OptionSelect
                  label="Department"
                  value={draft.departmentId}
                  options={snapshot.departments}
                  disabled={!editor}
                  onChange={(departmentId) => setDraft({ ...draft, departmentId })}
                />
                <OptionSelect
                  label="Manager"
                  value={draft.managerUserId}
                  options={snapshot.staff}
                  disabled={!editor}
                  onChange={(managerUserId) => setDraft({ ...draft, managerUserId })}
                />
                <div className="space-y-1">
                  <Label>Responsible role</Label>
                  <Select
                    value={draft.responsibleRole ?? "none"}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        responsibleRole:
                          value === "none" ? null : (value as Card5Facility["responsibleRole"]),
                      })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {CARD5_STAFF_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="Capacity & Hours" className="space-y-3">
                {(["minimumCapacity", "standardCapacity", "maximumCapacity"] as const).map(
                  (key) => (
                    <div key={key} className="space-y-1">
                      <Label>{title(key.replace("Capacity", ""))} capacity</Label>
                      <Input
                        type="number"
                        min={0}
                        value={draft[key] ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: nullableNumber(e.target.value) })
                        }
                        disabled={!editor}
                      />
                    </div>
                  ),
                )}
                <div className="flex items-center justify-between">
                  <Label>24-hour operation</Label>
                  <Switch
                    checked={draft.operatingHours.is24Hours}
                    onCheckedChange={(is24Hours) => patchHours({ is24Hours })}
                    disabled={!editor}
                  />
                </div>
                {!draft.operatingHours.is24Hours ? (
                  <HoursWindow
                    label="Daily schedule"
                    value={draft.operatingHours.daily}
                    onChange={(daily) => patchHours({ daily })}
                    disabled={!editor}
                  />
                ) : null}
                <HoursWindow
                  label="Weekend differences"
                  value={draft.operatingHours.weekend}
                  onChange={(weekend) => patchHours({ weekend })}
                  disabled={!editor}
                />
                <HoursWindow
                  label="Holiday setup"
                  value={draft.operatingHours.holiday}
                  onChange={(holiday) => patchHours({ holiday })}
                  disabled={!editor}
                />
                <div className="space-y-1">
                  <Label>Holiday notes</Label>
                  <Input
                    value={draft.operatingHours.holidayNotes}
                    onChange={(e) => patchHours({ holidayNotes: e.target.value })}
                    disabled={!editor}
                  />
                </div>
              </TabsContent>

              <TabsContent value="Commercial" className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Chargeable</Label>
                  <Switch
                    checked={draft.chargeable === true}
                    onCheckedChange={(chargeable) => setDraft({ ...draft, chargeable })}
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Revenue center</Label>
                  <Input
                    value={draft.revenueCenter}
                    onChange={(e) => setDraft({ ...draft, revenueCenter: e.target.value })}
                    disabled={!editor}
                  />
                </div>
                <OptionSelect
                  label="Tax group"
                  value={draft.taxGroupId}
                  options={snapshot.taxGroups}
                  disabled={!editor}
                  onChange={(taxGroupId) => setDraft({ ...draft, taxGroupId })}
                />
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Select
                    value={draft.currencyCode ?? "none"}
                    onValueChange={(value) => setDraft({ ...draft, currencyCode: none(value) })}
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Property default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Property default</SelectItem>
                      {snapshot.currencies
                        .filter((row) => row.active || row.code === draft.currencyCode)
                        .map((row) => (
                          <SelectItem key={row.code} value={row.code}>
                            {row.code} — {row.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="Reservation" className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Reservation required</Label>
                  <Switch
                    checked={draft.reservationRequired === true}
                    onCheckedChange={(reservationRequired) =>
                      setDraft({ ...draft, reservationRequired })
                    }
                    disabled={!editor}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Advance booking required</Label>
                  <Switch
                    checked={draft.advanceBookingRequired === true}
                    onCheckedChange={(advanceBookingRequired) =>
                      setDraft({ ...draft, advanceBookingRequired })
                    }
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Minimum lead time (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.minimumLeadMinutes ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, minimumLeadMinutes: nullableNumber(e.target.value) })
                    }
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Availability mode</Label>
                  <Select
                    value={draft.availabilityMode}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        availabilityMode: value as Card5Facility["availabilityMode"],
                      })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD5_AVAILABILITY_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {title(mode)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Setup policy only; this does not create bookings or closures.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="Features" className="space-y-2">
                {CARD5_FEATURES.map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <Label>{title(feature)}</Label>
                    <Switch
                      checked={draft.features[feature]}
                      onCheckedChange={(checked) =>
                        setDraft({ ...draft, features: { ...draft.features, [feature]: checked } })
                      }
                      disabled={!editor}
                    />
                  </div>
                ))}
              </TabsContent>
            </Tabs>
            <div className="mt-4 flex gap-2">
              {editor ? (
                <Button onClick={() => mutation.mutate(draft)} disabled={mutation.isPending}>
                  Save
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setDraft(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-[#D8CDBB] p-4 text-sm text-muted-foreground">
            Select a facility to edit it in this drawer.
          </p>
        )
      }
      status={
        <div className="text-sm">
          <p>
            Outlets & Facilities:{" "}
            {query.isLoading
              ? "Checking…"
              : `${propertySetupStatusLabel(shownReadiness.status)}${shownReadiness.ready ? " — ready" : ""}`}
          </p>
          {shownReadiness.blockers[0] ? (
            <p className="text-destructive">{shownReadiness.blockers[0]}</p>
          ) : shownReadiness.warnings[0] ? (
            <p className="text-[#C89933]">{shownReadiness.warnings[0]}</p>
          ) : null}
        </div>
      }
    >
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading facilities…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#D8CDBB] p-6 text-sm text-muted-foreground">
          No facilities match this view. Add a facility to begin the property catalogue.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table
            className="w-full min-w-[46rem] text-left text-sm"
            data-testid="pms-card5-facility-table"
          >
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Facility</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Category / type</th>
                <th className="px-3 py-2 font-medium">Capacity</th>
                <th className="px-3 py-2 font-medium">Availability</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-[#251605]">{row.name}</td>
                  <td className="px-3 py-2">{row.code}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-[#C89933]/10 px-2 py-1 text-xs">
                      {CARD5_FACILITY_CATEGORY_LABELS[row.facilityCategory]}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {title(row.facilityTypeCode)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.standardCapacity ?? row.maximumCapacity ?? "—"}
                  </td>
                  <td className="px-3 py-2">{title(row.availabilityMode)}</td>
                  <td className="px-3 py-2">{row.active ? "Active" : "Inactive"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDraft({
                            ...row,
                            operatingHours: emptyOperatingHours(row.operatingHours),
                          });
                          setSection("Basic");
                        }}
                      >
                        Edit
                      </Button>
                      {editor ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => mutation.mutate({ ...row, active: !row.active })}
                        >
                          {row.active ? "Deactivate" : "Activate"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PmsPropertySetupCard5Workspace>
  );
}
