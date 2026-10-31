import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  getRoomAmenityOverrides,
  getRoomEffectiveAmenities,
  listAmenities,
  listAmenityCategories,
  listRoomTypeAmenities,
  saveRoomAmenityOverrides,
  saveRoomTypeAmenities,
  type Card2Amenity,
} from "@/packages/pms/lib/rooms-amenities.functions";
import {
  CANONICAL_AMENITY_CATEGORIES,
  type AmenityOverrideKind,
} from "@/packages/pms/lib/rooms-card2-amenities.server";
import { AmenityIconDisplay } from "@/packages/pms/components/settings/amenity-icon-resolver";
import { useRoomTypeWizard } from "./room-type-wizard-context";

export function RoomTypeWizardStep3Amenities() {
  const { restaurantId, canEdit, roomTypeId, typeForm, stagedRooms, setStep } = useRoomTypeWizard();
  const disabled = !canEdit || !roomTypeId;
  const queryClient = useQueryClient();

  const fetchAmenities = useServerFn(listAmenities);
  const fetchCategories = useServerFn(listAmenityCategories);
  const fetchTypeAmenities = useServerFn(listRoomTypeAmenities);
  const saveTypeAmenitiesFn = useServerFn(saveRoomTypeAmenities);
  const fetchOverrides = useServerFn(getRoomAmenityOverrides);
  const fetchEffective = useServerFn(getRoomEffectiveAmenities);
  const saveOverridesFn = useServerFn(saveRoomAmenityOverrides);

  const [selectedCategory, setSelectedCategory] = useState<string>(CANONICAL_AMENITY_CATEGORIES[0]);
  const [typeAmenityIds, setTypeAmenityIds] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [customizeRoomId, setCustomizeRoomId] = useState<string | null>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);

  const amenitiesQuery = useQuery({
    queryKey: ["pms-card2-amenities", restaurantId],
    queryFn: () => fetchAmenities({ data: { restaurantId } }),
  });
  const categoriesQuery = useQuery({
    queryKey: ["pms-card2-amenity-categories", restaurantId],
    queryFn: () => fetchCategories({ data: { restaurantId } }),
  });
  const typeAmenitiesQuery = useQuery({
    queryKey: ["pms-card2-type-amenities", restaurantId, roomTypeId],
    enabled: Boolean(roomTypeId),
    queryFn: () => fetchTypeAmenities({ data: { restaurantId, roomTypeId: roomTypeId! } }),
  });

  useEffect(() => {
    const data = typeAmenitiesQuery.data;
    if (data && data.ok) setTypeAmenityIds(data.amenityIds);
  }, [typeAmenitiesQuery.data]);

  const amenities = useMemo(() => amenitiesQuery.data ?? [], [amenitiesQuery.data]);
  const categories = useMemo(() => {
    const custom = (categoriesQuery.data?.custom ?? []).map((c) =>
      typeof c === "string" ? c : String(c.name ?? ""),
    );
    return [...CANONICAL_AMENITY_CATEGORIES, ...custom.filter(Boolean)];
  }, [categoriesQuery.data]);

  const inCategory = useMemo(() => {
    return amenities.filter(
      (a) =>
        a.active &&
        (a.category || "Uncategorized").trim().toLowerCase() ===
          selectedCategory.trim().toLowerCase(),
    );
  }, [amenities, selectedCategory]);

  const filteredAmenities = useMemo(() => {
    if (!categorySearch.trim()) return inCategory;
    const q = categorySearch.trim().toLowerCase();
    return inCategory.filter((a) => a.name.toLowerCase().includes(q));
  }, [inCategory, categorySearch]);

  const toggleTypeAmenity = (id: string) => {
    if (disabled) return;
    setTypeAmenityIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAllCurrentCategory = () => {
    if (disabled) return;
    const catIds = inCategory.map((a) => a.id);
    setTypeAmenityIds((prev) => Array.from(new Set([...prev, ...catIds])));
  };

  const handleClearCurrentCategory = () => {
    if (disabled) return;
    const catIdSet = new Set(inCategory.map((a) => a.id));
    setTypeAmenityIds((prev) => prev.filter((id) => !catIdSet.has(id)));
  };

  const saveTypeMutation = useMutation({
    mutationFn: () =>
      saveTypeAmenitiesFn({
        data: {
          restaurantId,
          roomTypeId: roomTypeId!,
          amenityIds: typeAmenityIds,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Room type amenities saved");
      void queryClient.invalidateQueries({
        queryKey: ["pms-card2-type-amenities", restaurantId, roomTypeId],
      });
    },
  });

  async function handleContinue() {
    if (!disabled && roomTypeId) {
      await saveTypeMutation.mutateAsync();
    }
    setStep(4);
  }

  const persistedRooms = stagedRooms.filter((r) => r.persisted && r.id);

  return (
    <div className="space-y-5 pb-20">
      {/* Top Header Card */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDE6D8] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Amenities For
              </span>
              <span className="font-semibold text-[#251605]">
                {typeForm.name || "Room Type"}
                {typeForm.code ? ` · ${typeForm.code}` : ""}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select standard amenities included with this room type. All rooms inherit these unless
              overridden below.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#D9D2C4] text-xs text-[#251605] hover:bg-[#F4EDE0]"
              onClick={() => setCatalogueOpen(true)}
            >
              Property Amenity Catalogue
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#C89933] text-xs text-[#251605] hover:bg-[#C89933]/90 font-medium"
              disabled={disabled || saveTypeMutation.isPending}
              onClick={() => saveTypeMutation.mutate()}
            >
              {saveTypeMutation.isPending ? "Saving…" : "Save Amenities"}
            </Button>
          </div>
        </div>

        {/* Status bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EDE6D8] bg-[#F7F4EE] px-3.5 py-2 text-xs">
          <span className="font-medium text-[#251605]">
            {typeAmenityIds.length} amenities selected for {typeForm.name || "Room Type"}
          </span>
          <span className="text-muted-foreground">
            Selections persist when navigating categories.
          </span>
        </div>

        {/* Category First Navigator and Amenities Grid */}
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
          {/* Category Navigator (4 cols) */}
          <div className="lg:col-span-4 rounded-xl border border-[#E6DFD3] bg-[#FDFCFB] p-2.5 space-y-1">
            <span className="block px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Categories ({categories.length})
            </span>
            <nav
              className="max-h-[480px] space-y-1 overflow-y-auto pr-1"
              aria-label="Amenity Categories"
            >
              {categories.map((cat) => {
                const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
                const countInCat = amenities.filter(
                  (a) =>
                    a.active &&
                    (a.category || "Uncategorized").trim().toLowerCase() ===
                      cat.trim().toLowerCase(),
                ).length;
                const selectedInCat = amenities.filter(
                  (a) =>
                    a.active &&
                    (a.category || "Uncategorized").trim().toLowerCase() ===
                      cat.trim().toLowerCase() &&
                    typeAmenityIds.includes(a.id),
                ).length;

                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setCategorySearch("");
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-all ${
                      isSelected
                        ? "border border-[#C89933] bg-[#FBF8F2] font-semibold text-[#251605] shadow-xs"
                        : "border border-transparent text-[#4A3B2C] hover:bg-[#F7F4EE]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AmenityIconDisplay
                        categoryName={cat}
                        size={16}
                        className="h-4 w-4 shrink-0 text-[#251605]"
                      />
                      <span className="truncate">{cat}</span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        selectedInCat > 0
                          ? "bg-[#C89933]/20 font-semibold text-[#251605]"
                          : "bg-[#EDE6D8] text-muted-foreground"
                      }`}
                    >
                      {selectedInCat} / {countInCat}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Amenities Grid (8 cols) */}
          <div className="lg:col-span-8 space-y-3">
            {/* Category Header with Select All / Clear */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] p-3">
              <div className="flex items-center gap-2">
                <AmenityIconDisplay
                  categoryName={selectedCategory}
                  size={20}
                  className="h-5 w-5 text-[#251605]"
                />
                <div>
                  <h4 className="text-xs font-semibold text-[#251605]">{selectedCategory}</h4>
                  <p className="text-[11px] text-muted-foreground">
                    {inCategory.filter((a) => typeAmenityIds.includes(a.id)).length} of{" "}
                    {inCategory.length} selected
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 bg-white px-2.5 text-xs border-[#D9D2C4]"
                  disabled={disabled}
                  onClick={handleSelectAllCurrentCategory}
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-[#251605]"
                  disabled={disabled}
                  onClick={handleClearCurrentCategory}
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* In-category search box */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8 text-xs bg-white"
                placeholder={`Search ${selectedCategory} amenities...`}
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
              />
            </div>

            {/* Checkbox cards grid matching Card 2 Amenity design */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filteredAmenities.map((amenity) => {
                const isChecked = typeAmenityIds.includes(amenity.id);
                return (
                  <div
                    key={amenity.id}
                    role="checkbox"
                    aria-checked={isChecked}
                    tabIndex={0}
                    onClick={() => toggleTypeAmenity(amenity.id)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggleTypeAmenity(amenity.id);
                      }
                    }}
                    className={`flex h-[40px] cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 text-xs transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] ${
                      isChecked
                        ? "border-[#C89933] bg-[#FBF8F2] text-[#251605] font-medium shadow-xs"
                        : "border-[#EDE6D8] bg-white text-[#4A3B2C] hover:border-[#C89933]/50 hover:bg-[#FDFCFB]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={disabled}
                      readOnly
                      className="h-3.5 w-3.5 rounded border-gray-300 text-[#C89933] focus:ring-[#C89933] pointer-events-none"
                    />
                    <AmenityIconDisplay
                      icon={amenity.icon}
                      signedUrl={amenity.iconUrl}
                      categoryName={amenity.category}
                      size={16}
                      className="h-4 w-4 shrink-0 text-[#251605]"
                    />
                    <span className="truncate text-xs font-medium">
                      {amenity.name.replace(/\u200B/g, "")}
                    </span>
                  </div>
                );
              })}
            </div>

            {filteredAmenities.length === 0 ? (
              <div className="rounded-xl border border-[#EDE6D8] bg-white p-6 text-center text-xs text-muted-foreground">
                <Sparkles className="mx-auto h-6 w-6 text-[#C89933]/60 mb-1" />
                <p className="font-medium text-[#251605]">
                  No amenities found in {selectedCategory}
                </p>
                {categorySearch ? (
                  <p className="mt-0.5">Try clearing your search query.</p>
                ) : (
                  <p className="mt-0.5">
                    Configure additional amenities in the Property Amenity Catalogue.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* SECTION 2: Physical Room Overrides */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h3 className="font-display text-base font-semibold text-[#251605]">
            Physical Room Overrides
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Customize specific room overrides. Overrides allow adding extra features (e.g. Balcony)
            or removing unavailable amenities (e.g. Minibar) for individual physical rooms.
          </p>
        </div>

        <ul className="mt-3 divide-y divide-[#EDE6D8]">
          {persistedRooms.map((room) => (
            <RoomOverrideRow
              key={room.id}
              restaurantId={restaurantId}
              roomId={room.id!}
              roomNumber={room.roomNumber}
              disabled={disabled}
              onCustomize={() => setCustomizeRoomId(room.id!)}
            />
          ))}
          {persistedRooms.length === 0 ? (
            <li className="py-4 text-center text-xs text-muted-foreground">
              No persisted physical rooms found for this room type. Physical rooms created in Step 1
              will appear here.
            </li>
          ) : null}
        </ul>
      </section>

      {/* Sticky Bottom Actions Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#D9D2C4] bg-white/95 px-6 py-3.5 backdrop-blur-xs shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            className="border-[#D9D2C4] text-[#251605] hover:bg-[#F4EDE0]"
            onClick={() => setStep(2)}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Pricing
          </Button>
          <Button
            type="button"
            disabled={disabled || saveTypeMutation.isPending}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 font-medium"
            onClick={() => void handleContinue()}
          >
            {saveTypeMutation.isPending ? "Saving…" : "Save & Continue to Photos"}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </footer>

      {/* Property Amenity Catalogue Dialog */}
      <Dialog open={catalogueOpen} onOpenChange={setCatalogueOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#251605]">Property Amenity Catalogue</DialogTitle>
            <DialogDescription>
              All active amenities available property-wide. Manage catalogue definitions on the
              property Settings workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {amenities.map((a: Card2Amenity) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-[#EDE6D8] bg-[#FDFCFB] px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <AmenityIconDisplay
                    icon={a.icon}
                    categoryName={a.category}
                    size={16}
                    className="h-4 w-4 text-[#251605]"
                  />
                  <span className="font-medium text-[#251605]">{a.name}</span>
                </div>
                <span className="rounded bg-[#F7F4EE] px-2 py-0.5 text-[10px] text-muted-foreground border border-[#E6DFD3]">
                  {a.category}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Room Customize Dialog */}
      {customizeRoomId ? (
        <RoomCustomizeDialog
          restaurantId={restaurantId}
          roomId={customizeRoomId}
          roomTypeName={typeForm.name}
          typeAmenityIds={typeAmenityIds}
          amenities={amenities}
          disabled={disabled}
          open={Boolean(customizeRoomId)}
          onOpenChange={(open) => {
            if (!open) setCustomizeRoomId(null);
          }}
          fetchOverrides={fetchOverrides}
          fetchEffective={fetchEffective}
          saveOverridesFn={saveOverridesFn}
        />
      ) : null}
    </div>
  );
}

function RoomOverrideRow({
  restaurantId,
  roomId,
  roomNumber,
  disabled,
  onCustomize,
}: {
  restaurantId: string;
  roomId: string;
  roomNumber: string;
  disabled: boolean;
  onCustomize: () => void;
}) {
  const fetchOverrides = useServerFn(getRoomAmenityOverrides);
  const overridesQuery = useQuery({
    queryKey: ["pms-card2-room-overrides", restaurantId, roomId],
    queryFn: () => fetchOverrides({ data: { restaurantId, roomId } }),
  });
  const overrides =
    overridesQuery.data && overridesQuery.data.ok ? overridesQuery.data.overrides : [];
  const addedCount = overrides.filter((o) => o.kind === "add").length;
  const removedCount = overrides.filter((o) => o.kind === "remove").length;

  return (
    <li className="flex items-center justify-between py-2.5 text-xs">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-[#251605]">Room {roomNumber}</p>
          {overrides.length === 0 ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
              Inherits Defaults
            </span>
          ) : (
            <div className="flex items-center gap-1">
              {addedCount > 0 ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-200">
                  +{addedCount} Added
                </span>
              ) : null}
              {removedCount > 0 ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                  -{removedCount} Removed
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs border-[#D9D2C4] text-[#251605] hover:bg-[#F4EDE0]"
        disabled={disabled}
        onClick={onCustomize}
        aria-label={`Customize overrides for Room ${roomNumber}`}
      >
        <SlidersHorizontal className="mr-1 h-3 w-3" />
        Customize
      </Button>
    </li>
  );
}

function RoomCustomizeDialog({
  restaurantId,
  roomId,
  roomTypeName,
  typeAmenityIds,
  amenities,
  disabled,
  open,
  onOpenChange,
  fetchOverrides,
  fetchEffective,
  saveOverridesFn,
}: {
  restaurantId: string;
  roomId: string;
  roomTypeName: string;
  typeAmenityIds: string[];
  amenities: Card2Amenity[];
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchOverrides: (args: {
    data: { restaurantId: string; roomId: string };
  }) => Promise<Awaited<ReturnType<typeof getRoomAmenityOverrides>>>;
  fetchEffective: (args: {
    data: { restaurantId: string; roomId: string };
  }) => Promise<Awaited<ReturnType<typeof getRoomEffectiveAmenities>>>;
  saveOverridesFn: (args: {
    data:
      | { restaurantId: string; roomId: string; reset: true }
      | {
          restaurantId: string;
          roomId: string;
          overrides: { amenityId: string; kind: AmenityOverrideKind }[];
        };
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const queryClient = useQueryClient();
  const overridesQuery = useQuery({
    queryKey: ["pms-card2-room-overrides", restaurantId, roomId],
    queryFn: () => fetchOverrides({ data: { restaurantId, roomId } }),
    enabled: open,
  });
  const effectiveQuery = useQuery({
    queryKey: ["pms-card2-room-effective", restaurantId, roomId],
    queryFn: () => fetchEffective({ data: { restaurantId, roomId } }),
    enabled: open,
  });

  const [drafts, setDrafts] = useState<{ amenityId: string; kind: AmenityOverrideKind }[]>([]);
  useEffect(() => {
    const data = overridesQuery.data;
    if (data && data.ok) {
      setDrafts(data.overrides.map((row) => ({ amenityId: row.amenityId, kind: row.kind })));
    }
  }, [overridesQuery.data]);

  const byId = useMemo(() => new Map(amenities.map((a) => [a.id, a])), [amenities]);
  const removed = useMemo(
    () => new Set(drafts.filter((d) => d.kind === "remove").map((d) => d.amenityId)),
    [drafts],
  );
  const added = useMemo(() => drafts.filter((d) => d.kind === "add"), [drafts]);

  const saveMutation = useMutation({
    mutationFn: (
      payload: { reset: true } | { overrides: { amenityId: string; kind: AmenityOverrideKind }[] },
    ) =>
      "reset" in payload
        ? saveOverridesFn({ data: { restaurantId, roomId, reset: true } })
        : saveOverridesFn({ data: { restaurantId, roomId, overrides: payload.overrides } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message ?? "Could not save overrides.");
        return;
      }
      toast.success("Room amenities updated");
      void queryClient.invalidateQueries({
        queryKey: ["pms-card2-room-overrides", restaurantId, roomId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["pms-card2-room-effective", restaurantId, roomId],
      });
      onOpenChange(false);
    },
  });

  const addable = useMemo(() => {
    return amenities.filter(
      (a) => a.active && !typeAmenityIds.includes(a.id) && !added.some((d) => d.amenityId === a.id),
    );
  }, [amenities, typeAmenityIds, added]);

  const effectiveCount =
    effectiveQuery.data && effectiveQuery.data.ok ? effectiveQuery.data.effective.length : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#251605]">Room Amenity Overrides</DialogTitle>
          <DialogDescription>
            Configuring overrides based on {roomTypeName || "room type"} defaults.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Section 1: Inherited Amenities */}
          <div className="rounded-xl border border-[#EDE6D8] bg-[#FDFCFB] p-3.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Inherited Amenities ({typeAmenityIds.length})
            </h4>
            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {typeAmenityIds.map((id) => {
                const amenity = byId.get(id);
                if (!amenity) return null;
                const isRemoved = removed.has(id);
                return (
                  <div
                    key={id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs ${
                      isRemoved
                        ? "border-red-200 bg-red-50/50 text-muted-foreground line-through"
                        : "border-[#EDE6D8] bg-white text-[#251605]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AmenityIconDisplay
                        icon={amenity.icon}
                        categoryName={amenity.category}
                        size={14}
                      />
                      <span>{amenity.name}</span>
                      <span className="text-[10px] text-muted-foreground font-sans">
                        {isRemoved ? "(Removed for this room)" : "(Inherited)"}
                      </span>
                    </div>
                    {!isRemoved ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={disabled}
                        onClick={() =>
                          setDrafts((prev) => [
                            ...prev.filter((d) => d.amenityId !== id),
                            { amenityId: id, kind: "remove" },
                          ])
                        }
                      >
                        Remove
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-emerald-700 hover:bg-emerald-50"
                        disabled={disabled}
                        onClick={() => setDrafts((prev) => prev.filter((d) => d.amenityId !== id))}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                );
              })}
              {typeAmenityIds.length === 0 ? (
                <p className="text-xs text-muted-foreground">No room type amenities configured.</p>
              ) : null}
            </div>
          </div>

          {/* Section 2: Room-specific additions */}
          <div className="rounded-xl border border-[#EDE6D8] bg-[#FDFCFB] p-3.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Room-Specific Additions ({added.length})
            </h4>
            <div className="mt-2 space-y-1.5">
              {added.map((row) => (
                <div
                  key={row.amenityId}
                  className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-xs text-[#251605]"
                >
                  <div className="flex items-center gap-2">
                    <AmenityIconDisplay
                      icon={byId.get(row.amenityId)?.icon}
                      categoryName={byId.get(row.amenityId)?.category}
                      size={14}
                    />
                    <span>{byId.get(row.amenityId)?.name ?? row.amenityId}</span>
                    <span className="text-[10px] text-blue-700 font-medium">(Added)</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-[#251605]"
                    disabled={disabled}
                    onClick={() =>
                      setDrafts((prev) => prev.filter((d) => d.amenityId !== row.amenityId))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {added.length === 0 ? (
                <p className="text-xs text-muted-foreground">No room-specific additions.</p>
              ) : null}
            </div>

            {/* Add extra amenity select */}
            {addable.length > 0 && (
              <div className="mt-3">
                <select
                  className="w-full rounded-lg border border-[#D9D2C4] bg-white px-3 py-1.5 text-xs text-[#251605] outline-none focus:ring-1 focus:ring-[#C89933]"
                  disabled={disabled}
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    setDrafts((prev) => [...prev, { amenityId: id, kind: "add" }]);
                    e.target.value = "";
                  }}
                >
                  <option value="">+ Add custom amenity to this room…</option>
                  {addable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.category})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {effectiveCount != null ? (
            <p className="text-xs text-muted-foreground text-right">
              Total active room amenities:{" "}
              <span className="font-semibold text-[#251605]">{effectiveCount}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#EDE6D8] pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#D9D2C4] text-xs text-[#251605] hover:bg-[#F4EDE0]"
            disabled={disabled || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ reset: true })}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset to Room Type Defaults
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-xs font-medium text-[#251605] hover:bg-[#C89933]/90"
            disabled={disabled || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ overrides: drafts })}
          >
            {saveMutation.isPending ? "Saving…" : "Save Overrides"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const RoomTypeWizardStep2Amenities = RoomTypeWizardStep3Amenities;
