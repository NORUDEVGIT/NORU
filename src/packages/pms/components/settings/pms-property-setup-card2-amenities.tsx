import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { listRooms, listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import {
  evaluateCard2AmenitiesReadiness,
  getRoomAmenityOverrides,
  getRoomEffectiveAmenities,
  listAmenities,
  listRoomTypeAmenities,
  saveAmenity,
  saveRoomAmenityOverrides,
  saveRoomTypeAmenities,
  type Card2Amenity,
} from "@/packages/pms/lib/rooms-amenities.functions";
import {
  AMENITY_CATEGORIES,
  isApprovedAmenityCategory,
  uncategorizedAmenityCount,
  type AmenityOverrideKind,
} from "@/packages/pms/lib/rooms-card2-amenities.server";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";

type CatalogForm = {
  id?: string;
  name: string;
  code: string;
  category: string;
  description: string;
  icon: string;
  active: boolean;
  complimentary: boolean;
  displayToGuest: boolean;
  internalOnly: boolean;
};

const emptyCatalog = (): CatalogForm => ({
  name: "",
  code: "",
  category: "",
  description: "",
  icon: "",
  active: true,
  complimentary: true,
  displayToGuest: true,
  internalOnly: false,
});

export type AmenitiesRailStats = {
  total: number;
  active: number;
  uncategorized: number;
  typesConfigured: number;
  roomsWithOverrides: number;
  blockers: string[];
  stepStatus: PropertySetupCardStatus;
};

export function PmsPropertySetupCard2Amenities({
  restaurantId,
  canEdit,
  onReadiness,
  onStats,
  registerActions,
}: {
  restaurantId: string;
  canEdit: boolean;
  onReadiness: (status: PropertySetupCardStatus, blockers: string[]) => void;
  onStats: (stats: AmenitiesRailStats) => void;
  registerActions: (actions: { saveDraft: () => Promise<boolean>; saveAndContinue: () => Promise<boolean> }) => void;
}) {
  const queryClient = useQueryClient();
  const fetchAmenities = useServerFn(listAmenities);
  const persistAmenity = useServerFn(saveAmenity);
  const fetchTypes = useServerFn(listRoomTypes);
  const fetchRooms = useServerFn(listRooms);
  const fetchTypeAmenities = useServerFn(listRoomTypeAmenities);
  const persistTypeAmenities = useServerFn(saveRoomTypeAmenities);
  const fetchOverrides = useServerFn(getRoomAmenityOverrides);
  const fetchEffective = useServerFn(getRoomEffectiveAmenities);
  const persistOverrides = useServerFn(saveRoomAmenityOverrides);
  const fetchReady = useServerFn(evaluateCard2AmenitiesReadiness);

  const [form, setForm] = useState<CatalogForm>(emptyCatalog());
  const [formError, setFormError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);

  function readCatalogForm(): CatalogForm {
    const shownCategory = categoryTriggerRef.current?.textContent?.trim() ?? "";
    const category =
      form.category || AMENITY_CATEGORIES.find((row) => shownCategory === row || shownCategory.startsWith(row)) || "";
    return {
      ...form,
      name: nameRef.current?.value ?? form.name,
      code: codeRef.current?.value ?? form.code,
      icon: iconRef.current?.value ?? form.icon,
      description: descriptionRef.current?.value ?? form.description,
      category,
    };
  }
  const [search, setSearch] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [typeAmenityIds, setTypeAmenityIds] = useState<string[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [addAmenityId, setAddAmenityId] = useState("");

  const amenitiesQuery = useQuery({
    queryKey: ["pms-card2-amenities", restaurantId],
    queryFn: () => fetchAmenities({ data: { restaurantId } }),
  });
  const typesQuery = useQuery({
    queryKey: ["pms-card2-amenity-types", restaurantId],
    queryFn: () => fetchTypes({ data: { restaurantId, includeInactive: true } }),
  });
  const roomsQuery = useQuery({
    queryKey: ["pms-card2-amenity-rooms", restaurantId],
    queryFn: () => fetchRooms({ data: { restaurantId, includeInactive: true } }),
  });
  const readyQuery = useQuery({
    queryKey: ["pms-card2-amenities-ready", restaurantId],
    queryFn: () => fetchReady({ data: { restaurantId } }),
  });
  const typeMapQuery = useQuery({
    queryKey: ["pms-card2-type-amenities", restaurantId, selectedTypeId],
    enabled: Boolean(selectedTypeId),
    queryFn: () => fetchTypeAmenities({ data: { restaurantId, roomTypeId: selectedTypeId } }),
  });
  const effectiveQuery = useQuery({
    queryKey: ["pms-card2-effective", restaurantId, selectedRoomId],
    enabled: Boolean(selectedRoomId),
    queryFn: () => fetchEffective({ data: { restaurantId, roomId: selectedRoomId } }),
  });
  const overridesQuery = useQuery({
    queryKey: ["pms-card2-overrides", restaurantId, selectedRoomId],
    enabled: Boolean(selectedRoomId),
    queryFn: () => fetchOverrides({ data: { restaurantId, roomId: selectedRoomId } }),
  });

  const amenities = amenitiesQuery.data ?? [];
  const types = typesQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];
  const uncategorized = uncategorizedAmenityCount(amenities);
  const typesConfigured = types.filter((row) => row.active && (row.amenityIds?.length ?? 0) > 0).length;

  useEffect(() => {
    if (typeMapQuery.data?.ok) setTypeAmenityIds(typeMapQuery.data.amenityIds);
  }, [typeMapQuery.data]);

  useEffect(() => {
    const status = readyQuery.data?.stepStatus ?? "not_started";
    const blockers = readyQuery.data?.blockers ?? [];
    onReadiness(status, blockers);
    onStats({
      total: amenities.length,
      active: amenities.filter((row) => row.active).length,
      uncategorized,
      typesConfigured: readyQuery.data?.typesConfigured ?? typesConfigured,
      roomsWithOverrides: readyQuery.data?.roomsWithOverrides ?? 0,
      blockers,
      stepStatus: status,
    });
  }, [
    amenities,
    uncategorized,
    typesConfigured,
    readyQuery.data,
    overridesQuery.data,
    selectedRoomId,
    rooms,
    onReadiness,
    onStats,
  ]);

  const saveAmenityMutation = useMutation({
    mutationFn: () => {
      const draft = readCatalogForm();
      return persistAmenity({
        data: {
          restaurantId,
          id: draft.id,
          name: draft.name,
          code: draft.code || null,
          category: draft.category as (typeof AMENITY_CATEGORIES)[number],
          description: draft.description || null,
          icon: draft.icon || null,
          active: draft.active,
          complimentary: draft.complimentary,
          displayToGuest: draft.displayToGuest,
          internalOnly: draft.internalOnly,
        },
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setFormError(result.message);
        toast.error(result.message);
        return;
      }
      setFormError("");
      toast.success("Amenity saved");
      setForm(emptyCatalog());
      await queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities-ready", restaurantId] });
    },
    onError: () => toast.error("Could not save the amenity."),
  });

  const saveTypeMutation = useMutation({
    mutationFn: () =>
      persistTypeAmenities({
        data: { restaurantId, roomTypeId: selectedTypeId, amenityIds: typeAmenityIds },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Room type amenities saved");
      await queryClient.invalidateQueries({ queryKey: ["pms-card2-amenity-types", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities-ready", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["pms-card2-effective", restaurantId] });
    },
  });

  async function writeOverrides(overrides: { amenityId: string; kind: AmenityOverrideKind }[] | { reset: true }) {
    const result =
      "reset" in overrides
        ? await persistOverrides({ data: { restaurantId, roomId: selectedRoomId, reset: true } })
        : await persistOverrides({ data: { restaurantId, roomId: selectedRoomId, overrides } });
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: ["pms-card2-overrides", restaurantId, selectedRoomId] });
    await queryClient.invalidateQueries({ queryKey: ["pms-card2-effective", restaurantId, selectedRoomId] });
    await queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities-ready", restaurantId] });
    return true;
  }

  async function saveDraft(): Promise<boolean> {
    if (!canEdit) return false;
    const draft = readCatalogForm();
    if (draft.name.trim() && draft.category) {
      const result = await saveAmenityMutation.mutateAsync();
      if (!result.ok) return false;
    }
    if (selectedTypeId) {
      const result = await saveTypeMutation.mutateAsync();
      if (!result.ok) return false;
    }
    await readyQuery.refetch();
    return true;
  }

  async function saveAndContinue(): Promise<boolean> {
    const saved = await saveDraft();
    if (!saved) return false;
    const latest = await fetchReady({ data: { restaurantId } });
    onReadiness(latest.stepStatus, latest.blockers);
    if (!latest.ready) {
      toast.error(latest.blockers[0] ?? "Amenities is not complete yet.");
      return false;
    }
    return true;
  }

  useEffect(() => {
    registerActions({ saveDraft, saveAndContinue });
  });

  const filtered = amenities.filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${row.name} ${row.code} ${row.category}`.toLowerCase().includes(q);
  });

  const grouped = useMemo(() => {
    const buckets = new Map<string, Card2Amenity[]>();
    for (const category of AMENITY_CATEGORIES) buckets.set(category, []);
    buckets.set("Category Required", []);
    for (const row of amenities) {
      const key = isApprovedAmenityCategory(row.category) ? row.category : "Category Required";
      buckets.get(key)?.push(row);
    }
    return [...buckets.entries()].filter(([, rows]) => rows.length > 0);
  }, [amenities]);

  const selectedType = types.find((row) => row.id === selectedTypeId) ?? null;
  const selectedRoom = rooms.find((row) => row.id === selectedRoomId) ?? null;
  const effective = effectiveQuery.data?.ok ? effectiveQuery.data : null;
  const currentOverrides = overridesQuery.data?.ok ? overridesQuery.data.overrides : [];
  const addable = amenities.filter(
    (row) => row.active && !(effective?.effective ?? []).some((item) => item.id === row.id),
  );
  const disabled = !canEdit;

  function editRow(row: Card2Amenity) {
    setForm({
      id: row.id,
      name: row.name,
      code: row.code,
      category: isApprovedAmenityCategory(row.category) ? row.category : "",
      description: row.description,
      icon: row.icon,
      active: row.active,
      complimentary: row.complimentary,
      displayToGuest: row.displayToGuest,
      internalOnly: row.internalOnly,
    });
    setFormError("");
  }

  async function deactivate(row: Card2Amenity) {
    const result = await persistAmenity({
      data: {
        restaurantId,
        id: row.id,
        name: row.name,
        code: row.code || null,
        category: (isApprovedAmenityCategory(row.category) ? row.category : AMENITY_CATEGORIES[0]) as (typeof AMENITY_CATEGORIES)[number],
        description: row.description || null,
        icon: row.icon || null,
        active: false,
        complimentary: row.complimentary,
        displayToGuest: row.displayToGuest,
        internalOnly: row.internalOnly,
      },
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Amenity deactivated");
    await queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities", restaurantId] });
    await queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities-ready", restaurantId] });
  }

  async function removeInherited(amenityId: string) {
    const next = [
      ...currentOverrides.filter((row) => row.amenityId !== amenityId),
      { amenityId, kind: "remove" as const },
    ];
    const ok = await writeOverrides(next);
    if (ok) toast.success("Removed for this room");
  }

  async function restoreRemoved(amenityId: string) {
    const next = currentOverrides.filter((row) => row.amenityId !== amenityId);
    const ok = await writeOverrides(next);
    if (ok) toast.success("Restored inherited amenity");
  }

  async function addOverride() {
    if (!addAmenityId) return;
    const next = [
      ...currentOverrides.filter((row) => row.amenityId !== addAmenityId),
      { amenityId: addAmenityId, kind: "add" as const },
    ];
    const ok = await writeOverrides(next);
    if (ok) {
      toast.success("Added for this room");
      setAddAmenityId("");
    }
  }

  async function resetOverrides() {
    const ok = await writeOverrides({ reset: true });
    if (ok) toast.success("Reset to room type defaults");
  }

  return (
    <div className="space-y-5" data-testid="pms-card2-amenities-form">
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <h2 className="font-display text-xl text-[#251605]">Amenity Catalog</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Structured amenities are separate from freeform room features.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Stat label="Total Amenities" value={amenities.length} />
          <Stat label="Active Amenities" value={amenities.filter((row) => row.active).length} />
          <Stat label="Uncategorized Amenities" value={uncategorized} />
        </div>
        {uncategorized > 0 ? (
          <p className="mt-3 rounded-xl border border-[#C89933]/40 bg-[#C89933]/10 px-3 py-2 text-sm text-[#251605]" data-testid="pms-card2-uncategorized-banner">
            {uncategorized} amenities require a category before Amenities setup can be completed.
          </p>
        ) : null}
        <div className="mt-3 rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] px-3 py-2 text-sm" data-testid="pms-card2-amenities-readiness">
          <p className="font-medium text-[#251605]">
            {readyQuery.data?.ready
              ? "Ready"
              : readyQuery.data?.stepStatus === "in_progress"
                ? "Needs Attention"
                : "Not started"}
          </p>
          {(readyQuery.data?.blockers ?? []).length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {readyQuery.data?.blockers.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">All Amenities checks pass.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg text-[#251605]">{form.id ? "Edit amenity" : "Add amenity"}</h3>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setForm(emptyCatalog())}>
            New amenity
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Amenity Name *">
            <Input
              ref={nameRef}
              disabled={disabled}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Amenity Code">
            <Input
              ref={codeRef}
              disabled={disabled}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          <Field label="Category *">
            <Select
              disabled={disabled}
              value={form.category || undefined}
              onValueChange={(value) => setForm({ ...form, category: value })}
            >
              <SelectTrigger ref={categoryTriggerRef}>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {AMENITY_CATEGORIES.map((row) => (
                  <SelectItem key={row} value={row}>
                    {row}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Icon">
            <Input
              ref={iconRef}
              disabled={disabled}
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
            />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <Textarea
              ref={descriptionRef}
              disabled={disabled}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Toggle label="Status (active)" checked={form.active} disabled={disabled} onChange={(active) => setForm({ ...form, active })} />
          <Toggle label="Complimentary" checked={form.complimentary} disabled={disabled} onChange={(complimentary) => setForm({ ...form, complimentary })} />
          <Toggle label="Display to Guest" checked={form.displayToGuest} disabled={disabled} onChange={(displayToGuest) => setForm({ ...form, displayToGuest })} />
          <Toggle label="Internal Only" checked={form.internalOnly} disabled={disabled} onChange={(internalOnly) => setForm({ ...form, internalOnly })} />
        </div>
        {formError ? <p className="mt-2 text-sm text-destructive">{formError}</p> : null}
        <Button
          type="button"
          className="mt-4 scroll-mb-32 bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          disabled={disabled || saveAmenityMutation.isPending}
          onClick={() => {
            const draft = readCatalogForm();
            if (!draft.name.trim() || !draft.category) {
              setFormError("Amenity name and category are required.");
              return;
            }
            setForm(draft);
            saveAmenityMutation.mutate();
          }}
        >
          Save Amenity
        </Button>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg text-[#251605]">Catalog list</h3>
          <Input
            className="max-w-xs"
            placeholder="Search amenities"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search amenities"
          />
        </div>
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#CCCCCC] text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Amenity</th>
                <th className="py-2 pr-3 font-medium">Code</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Guest Display</th>
                <th className="py-2 pr-3 font-medium">Complimentary</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-[#EDE6D8]">
                  <td className="py-2 pr-3 text-[#251605]">{row.name}</td>
                  <td className="py-2 pr-3">{row.code || "—"}</td>
                  <td className="py-2 pr-3">
                    {isApprovedAmenityCategory(row.category) ? row.category : <span className="font-medium text-[#C89933]">Category Required</span>}
                  </td>
                  <td className="py-2 pr-3">{row.displayToGuest ? "Yes" : "No"}</td>
                  <td className="py-2 pr-3">{row.complimentary ? "Yes" : "No"}</td>
                  <td className="py-2 pr-3">{row.active ? "Active" : "Inactive"}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => editRow(row)}>
                        Edit
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={disabled || !row.active || !isApprovedAmenityCategory(row.category)} onClick={() => void deactivate(row)}>
                        Deactivate
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-2 md:hidden">
          {filtered.map((row) => (
            <article key={row.id} className="rounded-xl border border-[#CCCCCC] p-3">
              <p className="font-medium text-[#251605]">{row.name}</p>
              <p className="text-sm text-muted-foreground">{row.code || "No code"}</p>
              <p className="mt-1 text-sm">
                {isApprovedAmenityCategory(row.category) ? row.category : "Category Required"}
              </p>
              <p className="text-sm">{row.active ? "Active" : "Inactive"} · Guest {row.displayToGuest ? "yes" : "no"} · Complimentary {row.complimentary ? "yes" : "no"}</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => editRow(row)}>
                  Edit
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={disabled || !row.active || !isApprovedAmenityCategory(row.category)} onClick={() => void deactivate(row)}>
                  Deactivate
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg text-[#251605]">Room Type Amenities</h3>
        <p className="mt-1 text-sm text-muted-foreground">These amenities become the default amenity set for this room type.</p>
        <Field label="Select Room Type *" className="mt-3 max-w-md">
          <Select disabled={disabled} value={selectedTypeId || undefined} onValueChange={setSelectedTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a room type" />
            </SelectTrigger>
            <SelectContent>
              {types.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} — {row.displayName || row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {selectedType ? (
          <>
            <p className="mt-3 text-sm text-[#251605]">{typeAmenityIds.length} selected</p>
            <div className="mt-3 space-y-4">
              {grouped.map(([category, rows]) => (
                <div key={category}>
                  <p className="text-sm font-medium text-[#251605]">{category}</p>
                  <ul className="mt-1 space-y-1">
                    {rows.map((row) => {
                      const checked = typeAmenityIds.includes(row.id);
                      return (
                        <li key={row.id}>
                          <label className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm focus-within:ring-2 focus-within:ring-[#C89933]">
                            <input
                              type="checkbox"
                              className="accent-[#C89933]"
                              disabled={disabled}
                              checked={checked}
                              onChange={() =>
                                setTypeAmenityIds((current) =>
                                  checked ? current.filter((id) => id !== row.id) : [...current, row.id],
                                )
                              }
                            />
                            <span>{row.name}</span>
                            {checked ? <span className="text-xs text-muted-foreground">(selected)</span> : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <Button
              type="button"
              className="mt-4 scroll-mb-32 bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={disabled || saveTypeMutation.isPending}
              onClick={() => saveTypeMutation.mutate()}
            >
              Save Room Type Amenities
            </Button>
          </>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg text-[#251605]">Room-Specific Overrides</h3>
        <Field label="Select Physical Room *" className="mt-3 max-w-md">
          <Select disabled={disabled} value={selectedRoomId || undefined} onValueChange={setSelectedRoomId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a room" />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.roomNumber} — {row.roomTypeCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {selectedRoom && effective ? (
          <>
            <p className="mt-3 text-sm text-[#251605]">
              Room Number {selectedRoom.roomNumber} · Room Type {selectedRoom.roomTypeName || selectedRoom.roomTypeCode}
            </p>
            <OverrideGroup
              title="Inherited Amenities"
              items={effective.inherited.filter((row) => !effective.removed.some((removed) => removed.id === row.id))}
              empty="No inherited amenities."
            >
              {(row) => (
                <>
                  <span>{row.name}</span>
                  <span className="text-xs text-muted-foreground">Inherited from {selectedRoom.roomTypeName || selectedRoom.roomTypeCode}</span>
                  <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void removeInherited(row.id)}>
                    Remove Inherited Amenity
                  </Button>
                </>
              )}
            </OverrideGroup>
            <OverrideGroup title="Added Amenities" items={effective.added} empty="No added amenities.">
              {(row) => (
                <>
                  <span>{row.name}</span>
                  <span className="text-xs text-muted-foreground">Added for this room</span>
                </>
              )}
            </OverrideGroup>
            <OverrideGroup title="Removed Amenities" items={effective.removed} empty="No removed amenities.">
              {(row) => (
                <>
                  <span>{row.name}</span>
                  <span className="text-xs text-muted-foreground">Removed for this room</span>
                  <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void restoreRemoved(row.id)}>
                    Restore Removed Amenity
                  </Button>
                </>
              )}
            </OverrideGroup>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Field label="Add Amenity" className="min-w-[12rem] flex-1">
                <Select disabled={disabled} value={addAmenityId || undefined} onValueChange={setAddAmenityId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose amenity" />
                  </SelectTrigger>
                  <SelectContent>
                    {addable.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button type="button" variant="outline" className="scroll-mb-32" disabled={disabled || !addAmenityId} onClick={() => void addOverride()}>
                Add Amenity
              </Button>
              <Button type="button" variant="outline" className="scroll-mb-32" disabled={disabled} onClick={() => void resetOverrides()}>
                Reset to Room Type Defaults
              </Button>
            </div>
          </>
        ) : selectedRoom && effectiveQuery.data && !effectiveQuery.data.ok ? (
          <p className="mt-3 text-sm text-destructive">{effectiveQuery.data.message}</p>
        ) : null}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-[#251605]">{value}</p>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-[#251605]">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#EDE6D8] px-3 py-2">
      <Label className="text-[#251605]">{label}</Label>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function OverrideGroup({
  title,
  items,
  empty,
  children,
}: {
  title: string;
  items: Card2Amenity[];
  empty: string;
  children: (row: Card2Amenity) => ReactNode;
}) {
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-[#251605]">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EDE6D8] px-3 py-2 text-sm">
              {children(row)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
