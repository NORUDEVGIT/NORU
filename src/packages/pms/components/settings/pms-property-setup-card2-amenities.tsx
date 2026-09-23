import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
  registerActions: (actions: {
    saveDraft: () => Promise<boolean>;
    saveAndContinue: () => Promise<boolean>;
  }) => void;
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
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [typeManagerOpen, setTypeManagerOpen] = useState(false);
  const [overrideManagerOpen, setOverrideManagerOpen] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("__all");
  const [statusFilter, setStatusFilter] = useState("__all");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [typeAmenityIds, setTypeAmenityIds] = useState<string[]>([]);
  const [typeAmenitySearch, setTypeAmenitySearch] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [addAmenityId, setAddAmenityId] = useState("");

  function readCatalogForm(): CatalogForm {
    const shownCategory = categoryTriggerRef.current?.textContent?.trim() ?? "";
    const category =
      form.category ||
      AMENITY_CATEGORIES.find(
        (row) => shownCategory === row || shownCategory.startsWith(row),
      ) ||
      "";

    return {
      ...form,
      name: nameRef.current?.value ?? form.name,
      code: codeRef.current?.value ?? form.code,
      icon: iconRef.current?.value ?? form.icon,
      description: descriptionRef.current?.value ?? form.description,
      category,
    };
  }

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
    queryFn: () =>
      fetchTypeAmenities({
        data: { restaurantId, roomTypeId: selectedTypeId },
      }),
  });

  const effectiveQuery = useQuery({
    queryKey: ["pms-card2-effective", restaurantId, selectedRoomId],
    enabled: Boolean(selectedRoomId),
    queryFn: () =>
      fetchEffective({ data: { restaurantId, roomId: selectedRoomId } }),
  });

  const overridesQuery = useQuery({
    queryKey: ["pms-card2-overrides", restaurantId, selectedRoomId],
    enabled: Boolean(selectedRoomId),
    queryFn: () =>
      fetchOverrides({ data: { restaurantId, roomId: selectedRoomId } }),
  });

  const amenities = amenitiesQuery.data ?? [];
  const types = typesQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];
  const uncategorized = uncategorizedAmenityCount(amenities);
  const activeAmenityCount = amenities.filter((row) => row.active).length;
  const typesConfigured = types.filter(
    (row) => row.active && (row.amenityIds?.length ?? 0) > 0,
  ).length;

  useEffect(() => {
    if (typeMapQuery.data?.ok) {
      setTypeAmenityIds(typeMapQuery.data.amenityIds);
    }
  }, [typeMapQuery.data]);

  useEffect(() => {
    const status = readyQuery.data?.stepStatus ?? "not_started";
    const blockers = readyQuery.data?.blockers ?? [];

    onReadiness(status, blockers);
    onStats({
      total: amenities.length,
      active: activeAmenityCount,
      uncategorized,
      typesConfigured: readyQuery.data?.typesConfigured ?? typesConfigured,
      roomsWithOverrides: readyQuery.data?.roomsWithOverrides ?? 0,
      blockers,
      stepStatus: status,
    });
  }, [
    amenities.length,
    activeAmenityCount,
    uncategorized,
    typesConfigured,
    readyQuery.data,
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
      setCatalogEditorOpen(false);
      setForm(emptyCatalog());

      await queryClient.invalidateQueries({
        queryKey: ["pms-card2-amenities", restaurantId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["pms-card2-amenities-ready", restaurantId],
      });
    },
    onError: () => toast.error("Could not save the amenity."),
  });

  const saveTypeMutation = useMutation({
    mutationFn: () =>
      persistTypeAmenities({
        data: {
          restaurantId,
          roomTypeId: selectedTypeId,
          amenityIds: typeAmenityIds,
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success("Room type amenities saved");
      setTypeManagerOpen(false);

      await queryClient.invalidateQueries({
        queryKey: ["pms-card2-amenity-types", restaurantId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["pms-card2-amenities-ready", restaurantId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["pms-card2-effective", restaurantId],
      });
    },
  });

  async function writeOverrides(
    overrides:
      | { amenityId: string; kind: AmenityOverrideKind }[]
      | { reset: true },
  ) {
    const result =
      "reset" in overrides
        ? await persistOverrides({
            data: { restaurantId, roomId: selectedRoomId, reset: true },
          })
        : await persistOverrides({
            data: { restaurantId, roomId: selectedRoomId, overrides },
          });

    if (!result.ok) {
      toast.error(result.message);
      return false;
    }

    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-overrides", restaurantId, selectedRoomId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-effective", restaurantId, selectedRoomId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-amenities-ready", restaurantId],
    });

    return true;
  }

  async function saveDraft(): Promise<boolean> {
    if (!canEdit) return false;

    if (catalogEditorOpen) {
      const draft = readCatalogForm();
      if (draft.name.trim() || draft.category) {
        if (!draft.name.trim() || !draft.category) {
          setFormError("Amenity name and category are required.");
          toast.error("Amenity name and category are required.");
          return false;
        }

        const result = await saveAmenityMutation.mutateAsync();
        if (!result.ok) return false;
      }
    }

    if (typeManagerOpen && selectedTypeId) {
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
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      `${row.name} ${row.code} ${row.category}`.toLowerCase().includes(query);
    const matchesCategory =
      categoryFilter === "__all" || row.category === categoryFilter;
    const matchesStatus =
      statusFilter === "__all" ||
      (statusFilter === "active" ? row.active : !row.active);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const grouped = useMemo(() => {
    const buckets = new Map<string, Card2Amenity[]>();

    for (const category of AMENITY_CATEGORIES) {
      buckets.set(category, []);
    }
    buckets.set("Category Required", []);

    for (const row of amenities.filter((amenity) => amenity.active)) {
      const key = isApprovedAmenityCategory(row.category)
        ? row.category
        : "Category Required";
      buckets.get(key)?.push(row);
    }

    return [...buckets.entries()].filter(([, rows]) => rows.length > 0);
  }, [amenities]);

  const selectedType =
    types.find((row) => row.id === selectedTypeId) ?? null;
  const selectedRoom =
    rooms.find((row) => row.id === selectedRoomId) ?? null;
  const effective = effectiveQuery.data?.ok ? effectiveQuery.data : null;
  const currentOverrides = overridesQuery.data?.ok
    ? overridesQuery.data.overrides
    : [];

  const selectedTypeAmenities = amenities.filter((row) =>
    typeAmenityIds.includes(row.id),
  );

  const filteredGrouped = grouped
    .map(([category, rows]) => [
      category,
      rows.filter((row) =>
        row.name.toLowerCase().includes(typeAmenitySearch.trim().toLowerCase()),
      ),
    ] as const)
    .filter(([, rows]) => rows.length > 0);

  const inheritedAmenities =
    effective?.inherited.filter(
      (row) =>
        !effective.removed.some((removed) => removed.id === row.id),
    ) ?? [];
  const addedAmenities = effective?.added ?? [];
  const removedAmenities = effective?.removed ?? [];

  const addable = amenities.filter(
    (row) =>
      row.active &&
      !(effective?.effective ?? []).some((item) => item.id === row.id),
  );

  const disabled = !canEdit;

  function newAmenity() {
    setForm(emptyCatalog());
    setFormError("");
    setCatalogEditorOpen(true);
  }

  function editRow(row: Card2Amenity) {
    setForm({
      id: row.id,
      name: row.name,
      code: row.code,
      category: isApprovedAmenityCategory(row.category)
        ? row.category
        : "",
      description: row.description,
      icon: row.icon,
      active: row.active,
      complimentary: row.complimentary,
      displayToGuest: row.displayToGuest,
      internalOnly: row.internalOnly,
    });
    setFormError("");
    setCatalogEditorOpen(true);
  }

  async function deactivate(row: Card2Amenity) {
    const result = await persistAmenity({
      data: {
        restaurantId,
        id: row.id,
        name: row.name,
        code: row.code || null,
        category: (
          isApprovedAmenityCategory(row.category)
            ? row.category
            : AMENITY_CATEGORIES[0]
        ) as (typeof AMENITY_CATEGORIES)[number],
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
    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-amenities", restaurantId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-amenities-ready", restaurantId],
    });
  }

  async function removeInherited(amenityId: string) {
    const next = [
      ...currentOverrides.filter((row) => row.amenityId !== amenityId),
      { amenityId, kind: "remove" as const },
    ];

    const ok = await writeOverrides(next);
    if (ok) toast.success("Removed for this room");
  }

  async function removeAdded(amenityId: string) {
    const next = currentOverrides.filter(
      (row) => row.amenityId !== amenityId,
    );

    const ok = await writeOverrides(next);
    if (ok) toast.success("Removed room-specific amenity");
  }

  async function restoreRemoved(amenityId: string) {
    const next = currentOverrides.filter(
      (row) => row.amenityId !== amenityId,
    );

    const ok = await writeOverrides(next);
    if (ok) toast.success("Restored inherited amenity");
  }

  async function addOverride() {
    if (!addAmenityId) return;

    const next = [
      ...currentOverrides.filter(
        (row) => row.amenityId !== addAmenityId,
      ),
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-[#251605]">
              Amenity Catalog
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage structured amenities used across room types and physical rooms.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={newAmenity}
          >
            <Plus className="mr-1 h-4 w-4" />
            New amenity
          </Button>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-[1.3fr_0.8fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search amenities"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search amenities"
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All categories</SelectItem>
              {AMENITY_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 hidden overflow-x-auto rounded-lg border border-[#E6DFD3] md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F7F4EE] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Amenity</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Guest Display</th>
                <th className="px-3 py-2">Complimentary</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-[#EDE6D8] hover:bg-[#FBF9F5]"
                >
                  <td className="px-3 py-2 font-medium text-[#251605]">
                    {row.name}
                  </td>
                  <td className="px-3 py-2">{row.code || "—"}</td>
                  <td className="px-3 py-2">
                    {isApprovedAmenityCategory(row.category) ? (
                      row.category
                    ) : (
                      <span className="font-medium text-[#C89933]">
                        Category Required
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.displayToGuest ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2">
                    {row.complimentary ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          row.active ? "bg-green-500" : "bg-gray-400"
                        }`}
                      />
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => editRow(row)}
                      >
                        Edit
                      </Button>
                      {row.active ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={
                            disabled ||
                            !isApprovedAmenityCategory(row.category)
                          }
                          onClick={() => void deactivate(row)}
                        >
                          Deactivate
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    No amenities match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-2 md:hidden">
          {filtered.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-[#E6DFD3] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#251605]">{row.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.code || "No code"} ·{" "}
                    {isApprovedAmenityCategory(row.category)
                      ? row.category
                      : "Category Required"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => editRow(row)}
                >
                  Edit
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-[#251605]">
              Room Type Amenities
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Assign default amenities to each configured room type.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={disabled || !selectedTypeId}
            onClick={() => setTypeManagerOpen(true)}
          >
            Manage amenities
          </Button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[28rem_1fr] lg:items-start">
          <Field label="Select Room Type">
            <Select
              disabled={disabled}
              value={selectedTypeId || undefined}
              onValueChange={setSelectedTypeId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a room type" />
              </SelectTrigger>
              <SelectContent>
                {types.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.displayName || row.name} ({row.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div>
            {selectedType ? (
              <>
                <p className="text-sm font-medium text-[#251605]">
                  {typeAmenityIds.length} amenities assigned
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedTypeAmenities.length > 0 ? (
                    selectedTypeAmenities.map((amenity) => (
                      <span
                        key={amenity.id}
                        className="rounded-full border border-[#E6DFD3] bg-[#F7F4EE] px-3 py-1 text-sm text-[#251605]"
                      >
                        {amenity.name}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No amenities assigned.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="pt-6 text-sm text-muted-foreground">
                Select a room type to review its default amenities.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-[#251605]">
              Room-Specific Overrides
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Override inherited room-type amenities for an individual physical room.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={disabled || !selectedRoomId || !effective}
            onClick={() => setOverrideManagerOpen(true)}
          >
            Manage overrides
          </Button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[28rem_1fr] lg:items-start">
          <Field label="Select Physical Room">
            <Select
              disabled={disabled}
              value={selectedRoomId || undefined}
              onValueChange={(value) => {
                setSelectedRoomId(value);
                setAddAmenityId("");
              }}
            >
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
            <div className="grid gap-3 sm:grid-cols-3">
              <CountMetric label="Inherited" value={inheritedAmenities.length} />
              <CountMetric label="Added" value={addedAmenities.length} />
              <CountMetric label="Removed" value={removedAmenities.length} />
            </div>
          ) : (
            <p className="pt-6 text-sm text-muted-foreground">
              Select a room to review its inherited and overridden amenities.
            </p>
          )}
        </div>

        {selectedRoom && effective ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <AmenityPreviewGroup
              title={`Inherited Amenities (${inheritedAmenities.length})`}
              items={inheritedAmenities}
              empty="None"
            />
            <AmenityPreviewGroup
              title={`Added Amenities (${addedAmenities.length})`}
              items={addedAmenities}
              empty="None"
            />
            <AmenityPreviewGroup
              title={`Removed Amenities (${removedAmenities.length})`}
              items={removedAmenities}
              empty="None"
              removed
            />
          </div>
        ) : selectedRoom && effectiveQuery.data && !effectiveQuery.data.ok ? (
          <p className="mt-3 text-sm text-destructive">
            {effectiveQuery.data.message}
          </p>
        ) : null}
      </section>

      <Dialog
        open={catalogEditorOpen}
        onOpenChange={(open) => {
          setCatalogEditorOpen(open);
          if (!open) {
            setFormError("");
            setForm(emptyCatalog());
          }
        }}
      >
        <DialogContent className="block max-h-[88dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-[#CCCCCC] bg-white p-0 shadow-xl">
          <div className="sticky top-0 z-10 border-b border-[#EDE6D8] bg-white px-5 py-4">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="font-sans text-lg font-semibold text-[#251605]">
                {form.id ? "Edit amenity" : "New amenity"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Configure amenity identity, category, guest visibility, and commercial behavior.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#251605]">
                Basic information
              </h4>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Amenity Name *">
                  <Input
                    ref={nameRef}
                    disabled={disabled}
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                </Field>

                <Field label="Amenity Code">
                  <Input
                    ref={codeRef}
                    disabled={disabled}
                    value={form.code}
                    onChange={(event) =>
                      setForm({ ...form, code: event.target.value })
                    }
                  />
                </Field>

                <Field label="Category *">
                  <Select
                    disabled={disabled}
                    value={form.category || undefined}
                    onValueChange={(value) =>
                      setForm({ ...form, category: value })
                    }
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
                    onChange={(event) =>
                      setForm({ ...form, icon: event.target.value })
                    }
                  />
                </Field>

                <Field label="Description" className="md:col-span-2">
                  <Textarea
                    ref={descriptionRef}
                    disabled={disabled}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                  />
                </Field>
              </div>
            </div>

            <div className="border-t border-[#EDE6D8] pt-5">
              <h4 className="mb-3 text-sm font-semibold text-[#251605]">
                Visibility & behaviour
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle
                  label="Active"
                  checked={form.active}
                  disabled={disabled}
                  onChange={(active) => setForm({ ...form, active })}
                />
                <Toggle
                  label="Complimentary"
                  checked={form.complimentary}
                  disabled={disabled}
                  onChange={(complimentary) =>
                    setForm({ ...form, complimentary })
                  }
                />
                <Toggle
                  label="Display to Guest"
                  checked={form.displayToGuest}
                  disabled={disabled}
                  onChange={(displayToGuest) =>
                    setForm({ ...form, displayToGuest })
                  }
                />
                <Toggle
                  label="Internal Only"
                  checked={form.internalOnly}
                  disabled={disabled}
                  onChange={(internalOnly) =>
                    setForm({ ...form, internalOnly })
                  }
                />
              </div>
            </div>

            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#EDE6D8] bg-white px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCatalogEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
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
              {saveAmenityMutation.isPending ? "Saving..." : "Save amenity"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={typeManagerOpen}
        onOpenChange={(open) => {
          setTypeManagerOpen(open);
          if (!open) setTypeAmenitySearch("");
        }}
      >
        <DialogContent className="block max-h-[88dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-[#CCCCCC] bg-white p-0 shadow-xl">
          <div className="sticky top-0 z-10 border-b border-[#EDE6D8] bg-white px-5 py-4">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="font-sans text-lg font-semibold text-[#251605]">
                Manage amenities
                {selectedType
                  ? ` — ${selectedType.displayName || selectedType.name}`
                  : ""}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Select the default amenities inherited by rooms of this type.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search amenities"
                value={typeAmenitySearch}
                onChange={(event) =>
                  setTypeAmenitySearch(event.target.value)
                }
              />
            </div>

            <div className="mt-4 space-y-5">
              {filteredGrouped.map(([category, rows]) => (
                <div key={category}>
                  <p className="text-sm font-semibold text-[#251605]">
                    {category}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {rows.map((row) => {
                      const checked = typeAmenityIds.includes(row.id);

                      return (
                        <label
                          key={row.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#E6DFD3] px-3 py-2 text-sm hover:bg-[#FBF9F5]"
                        >
                          <input
                            type="checkbox"
                            className="accent-[#C89933]"
                            disabled={disabled}
                            checked={checked}
                            onChange={() =>
                              setTypeAmenityIds((current) =>
                                checked
                                  ? current.filter((id) => id !== row.id)
                                  : [...current, row.id],
                              )
                            }
                          />
                          <span className="text-[#251605]">{row.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[#EDE6D8] bg-white px-5 py-4">
            <p className="text-sm text-muted-foreground">
              {typeAmenityIds.length} selected
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTypeManagerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={
                  disabled ||
                  saveTypeMutation.isPending ||
                  !selectedTypeId
                }
                onClick={() => saveTypeMutation.mutate()}
              >
                {saveTypeMutation.isPending
                  ? "Saving..."
                  : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={overrideManagerOpen}
        onOpenChange={(open) => {
          setOverrideManagerOpen(open);
          if (!open) setAddAmenityId("");
        }}
      >
        <DialogContent className="block max-h-[88dvh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto rounded-xl border border-[#CCCCCC] bg-white p-0 shadow-xl">
          <div className="sticky top-0 z-10 border-b border-[#EDE6D8] bg-white px-5 py-4">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="font-sans text-lg font-semibold text-[#251605]">
                Manage overrides
                {selectedRoom ? ` — Room ${selectedRoom.roomNumber}` : ""}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Manage inherited, added, and removed amenities for this physical room.
              </DialogDescription>
            </DialogHeader>
          </div>

          {selectedRoom && effective ? (
            <div className="space-y-5 p-5">
              <div className="rounded-lg border border-[#E6DFD3] bg-[#F7F4EE] px-3 py-2 text-sm text-[#251605]">
                Room {selectedRoom.roomNumber} ·{" "}
                {selectedRoom.roomTypeName || selectedRoom.roomTypeCode}
              </div>

              <OverrideGroup
                title="Inherited from Room Type"
                items={inheritedAmenities}
                empty="No inherited amenities."
              >
                {(row) => (
                  <>
                    <span>{row.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Inherited from{" "}
                      {selectedRoom.roomTypeName ||
                        selectedRoom.roomTypeCode}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => void removeInherited(row.id)}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </OverrideGroup>

              <OverrideGroup
                title="Added for this Room"
                items={addedAmenities}
                empty="No room-specific amenities."
              >
                {(row) => (
                  <>
                    <span>{row.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Added specifically for this room
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => void removeAdded(row.id)}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </OverrideGroup>

              <OverrideGroup
                title="Removed from Defaults"
                items={removedAmenities}
                empty="No removed amenities."
              >
                {(row) => (
                  <>
                    <span>{row.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Removed for this room
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => void restoreRemoved(row.id)}
                    >
                      Restore
                    </Button>
                  </>
                )}
              </OverrideGroup>

              <div className="border-t border-[#EDE6D8] pt-5">
                <Field label="Add Amenity">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select
                      disabled={disabled}
                      value={addAmenityId || undefined}
                      onValueChange={setAddAmenityId}
                    >
                      <SelectTrigger className="flex-1">
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

                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled || !addAmenityId}
                      onClick={() => void addOverride()}
                    >
                      Add Amenity
                    </Button>
                  </div>
                </Field>
              </div>
            </div>
          ) : null}

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[#EDE6D8] bg-white px-5 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !selectedRoomId}
              onClick={() => void resetOverrides()}
            >
              Reset to Room Type Defaults
            </Button>

            <Button
              type="button"
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              onClick={() => setOverrideManagerOpen(false)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CountMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-[#E6DFD3] bg-[#F7F4EE] px-3 py-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-[#251605]">{value}</p>
    </div>
  );
}

function AmenityPreviewGroup({
  title,
  items,
  empty,
  removed = false,
}: {
  title: string;
  items: Card2Amenity[];
  empty: string;
  removed?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#E6DFD3] p-3">
      <p className="text-sm font-medium text-[#251605]">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((row) => (
            <span
              key={row.id}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                removed
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-[#E6DFD3] bg-[#F7F4EE] text-[#251605]"
              }`}
            >
              {row.name}
            </span>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
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
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
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
    <div>
      <p className="text-sm font-medium text-[#251605]">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((row) => (
            <li
              key={row.id}
              className="grid gap-2 rounded-xl border border-[#EDE6D8] px-3 py-2 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-center"
            >
              {children(row)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
