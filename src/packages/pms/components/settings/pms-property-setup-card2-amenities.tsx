import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FolderPlus,
  Image as ImageIcon,
  Link as LinkIcon,
  Plus,
  Search,
  Sparkles,
  UploadCloud,
} from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { listRooms, listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import {
  createAmenityIconUpload,
  evaluateCard2AmenitiesReadiness,
  getRoomAmenityOverrides,
  getRoomEffectiveAmenities,
  listAmenities,
  listAmenityCategories,
  listRoomTypeAmenities,
  saveAmenity,
  saveCustomAmenityCategory,
  saveRoomAmenityOverrides,
  saveRoomTypeAmenities,
  type Card2Amenity,
} from "@/packages/pms/lib/rooms-amenities.functions";
import {
  AMENITY_CATEGORIES,
  CANONICAL_AMENITY_CATEGORIES,
  CANONICAL_CATEGORY_ICONS,
  isApprovedAmenityCategory,
  isCanonicalAmenityCategory,
  isDuplicateCategoryName,
  uncategorizedAmenityCount,
  type AmenityOverrideKind,
  type CanonicalAmenityCategory,
} from "@/packages/pms/lib/rooms-card2-amenities.server";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  AmenityIconDisplay,
  PRESET_AMENITY_ICONS,
} from "./amenity-icon-resolver";

type CatalogForm = {
  id?: string;
  name: string;
  code: string;
  category: string;
  description: string;
  icon: string;
  iconUrl?: string | null;
  active: boolean;
  complimentary: boolean;
  displayToGuest: boolean;
  internalOnly: boolean;
};

const emptyCatalog = (defaultCategory: string = CANONICAL_AMENITY_CATEGORIES[0]): CatalogForm => ({
  name: "",
  code: "",
  category: defaultCategory,
  description: "",
  icon: "",
  iconUrl: null,
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

type CategoryNavItem = {
  name: string;
  icon?: string | null;
  signedUrl?: string | null;
  count: number;
  kind: "canonical" | "custom" | "uncategorized";
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
  const fetchCategories = useServerFn(listAmenityCategories);
  const persistAmenity = useServerFn(saveAmenity);
  const persistCustomCategory = useServerFn(saveCustomAmenityCategory);
  const startIconUploadTicket = useServerFn(createAmenityIconUpload);

  const fetchTypes = useServerFn(listRoomTypes);
  const fetchRooms = useServerFn(listRooms);
  const fetchTypeAmenities = useServerFn(listRoomTypeAmenities);
  const persistTypeAmenities = useServerFn(saveRoomTypeAmenities);
  const fetchOverrides = useServerFn(getRoomAmenityOverrides);
  const fetchEffective = useServerFn(getRoomEffectiveAmenities);
  const persistOverrides = useServerFn(saveRoomAmenityOverrides);
  const fetchReady = useServerFn(evaluateCard2AmenitiesReadiness);

  // Category-First state: user first selects a category
  const [selectedCategory, setSelectedCategory] = useState<string>(CANONICAL_AMENITY_CATEGORIES[0]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all");

  // Dialog states
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [form, setForm] = useState<CatalogForm>(emptyCatalog(selectedCategory));
  const [formError, setFormError] = useState("");
  const [amenityIconTab, setAmenityIconTab] = useState<"preset" | "upload" | "url">("preset");
  const [isUploadingAmenityIcon, setIsUploadingAmenityIcon] = useState(false);

  // Add Category dialog state
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("");
  const [newCatIconType, setNewCatIconType] = useState<"upload" | "url" | "preset" | "fallback">("fallback");
  const [newCatIconSignedUrl, setNewCatIconSignedUrl] = useState<string | null>(null);
  const [newCatIconTab, setNewCatIconTab] = useState<"preset" | "upload" | "url">("preset");
  const [newCatError, setNewCatError] = useState("");
  const [isUploadingCatIcon, setIsUploadingCatIcon] = useState(false);

  // Room type & overrides manager states
  const [typeManagerOpen, setTypeManagerOpen] = useState(false);
  const [overrideManagerOpen, setOverrideManagerOpen] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [typeAmenityIds, setTypeAmenityIds] = useState<string[]>([]);
  const [typeAmenitySearch, setTypeAmenitySearch] = useState("");
  const [selectedTypeCategory, setSelectedTypeCategory] = useState<string>(CANONICAL_AMENITY_CATEGORIES[0]);
  const [typeCategorySearch, setTypeCategorySearch] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [addAmenityId, setAddAmenityId] = useState("");

  const amenityFileInputRef = useRef<HTMLInputElement>(null);
  const catFileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const amenitiesQuery = useQuery({
    queryKey: ["pms-card2-amenities", restaurantId],
    queryFn: () => fetchAmenities({ data: { restaurantId } }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["pms-card2-amenity-categories", restaurantId],
    queryFn: () => fetchCategories({ data: { restaurantId } }),
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
  const customCategories = categoriesQuery.data?.custom ?? [];
  const customCategoryNames = customCategories.map((c) => c.name);

  const types = typesQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];
  const uncategorized = uncategorizedAmenityCount(
    amenities,
    customCategoryNames,
  );
  const activeAmenityCount = amenities.filter((row) => row.active).length;
  const typesConfigured = types.filter(
    (row) => row.active && (row.amenityIds?.length ?? 0) > 0,
  ).length;

  // Build the complete Category Navigation list (Canonical + Custom + Uncategorized)
  const categoryNavItems = useMemo<CategoryNavItem[]>(() => {
    const items: CategoryNavItem[] = [];

    // 1. Canonical 14 categories
    for (const cat of CANONICAL_AMENITY_CATEGORIES) {
      const count = amenities.filter(
        (a) => a.category?.trim().toLowerCase() === cat.toLowerCase(),
      ).length;
      items.push({
        name: cat,
        icon: CANONICAL_CATEGORY_ICONS[cat],
        count,
        kind: "canonical",
      });
    }

    // 2. Custom categories
    for (const custom of customCategories) {
      const count = amenities.filter(
        (a) => a.category?.trim().toLowerCase() === custom.name.toLowerCase(),
      ).length;
      items.push({
        name: custom.name,
        icon: custom.icon,
        signedUrl: custom.signedUrl,
        count,
        kind: "custom",
      });
    }

    // 3. Category Required (if any uncategorized exist)
    if (uncategorized > 0) {
      items.push({
        name: "Category Required",
        icon: "Tag",
        count: uncategorized,
        kind: "uncategorized",
      });
    }

    return items;
  }, [amenities, customCategories, uncategorized]);

  // All available categories for dropdowns
  const allSelectableCategories = useMemo(() => {
    const list: { name: string; kind: string }[] = [];
    for (const c of CANONICAL_AMENITY_CATEGORIES) list.push({ name: c, kind: "Canonical" });
    for (const c of customCategories) list.push({ name: c.name, kind: "Custom" });
    return list;
  }, [customCategories]);

  // Selected category amenities
  const categoryAmenities = useMemo(() => {
    return amenities.filter((row) => {
      if (selectedCategory === "Category Required") {
        return !isApprovedAmenityCategory(
          row.category,
          customCategoryNames,
        );
      }
      return row.category?.trim().toLowerCase() === selectedCategory.trim().toLowerCase();
    });
  }, [amenities, selectedCategory, customCategoryNames]);

  // In-category filtered amenities
  const filteredCategoryAmenities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categoryAmenities.filter((row) => {
      const matchesSearch =
        !query || `${row.name} ${row.code} ${row.description}`.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "__all" || (statusFilter === "active" ? row.active : !row.active);
      return matchesSearch && matchesStatus;
    });
  }, [categoryAmenities, search, statusFilter]);

  // Currently selected category nav metadata
  const selectedCategoryMeta = useMemo(() => {
    return categoryNavItems.find(
      (c) => c.name.toLowerCase() === selectedCategory.toLowerCase(),
    );
  }, [categoryNavItems, selectedCategory]);

  useEffect(() => {
    if (typeMapQuery.data?.ok) {
      setTypeAmenityIds(typeMapQuery.data.amenityIds);
    }
  }, [typeMapQuery.data]);

  useEffect(() => {
    if (!selectedTypeId && types.length > 0) {
      setSelectedTypeId(types[0].id);
    }
  }, [types, selectedTypeId]);

  function toggleTypeAmenity(amenityId: string) {
    if (disabled) return;
    setTypeAmenityIds((prev) =>
      prev.includes(amenityId)
        ? prev.filter((id) => id !== amenityId)
        : [...prev, amenityId],
    );
  }

  function handleSelectAllCurrentCategory(categoryName: string) {
    if (disabled) return;
    const catActiveIds = amenities
      .filter(
        (a) =>
          a.active &&
          a.category?.trim().toLowerCase() === categoryName.trim().toLowerCase(),
      )
      .map((a) => a.id);
    setTypeAmenityIds((prev) => Array.from(new Set([...prev, ...catActiveIds])));
  }

  function handleClearCurrentCategory(categoryName: string) {
    if (disabled) return;
    const catIdsSet = new Set(
      amenities
        .filter(
          (a) =>
            a.category?.trim().toLowerCase() === categoryName.trim().toLowerCase(),
        )
        .map((a) => a.id),
    );
    setTypeAmenityIds((prev) => prev.filter((id) => !catIdsSet.has(id)));
  }

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

  // Mutations
  const saveAmenityMutation = useMutation({
    mutationFn: () => {
      return persistAmenity({
        data: {
          restaurantId,
          id: form.id,
          name: form.name.trim(),
          code: form.code.trim() || null,
          category: form.category.trim(),
          description: form.description.trim() || null,
          icon: form.icon.trim() || null,
          active: form.active,
          complimentary: form.complimentary,
          displayToGuest: form.displayToGuest,
          internalOnly: form.internalOnly,
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
      toast.success(form.id ? "Amenity updated" : "Amenity added");
      setCatalogEditorOpen(false);
      setForm(emptyCatalog(selectedCategory));

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities-ready", restaurantId] }),
      ]);
    },
    onError: () => toast.error("Could not save the amenity."),
  });

  const saveCategoryMutation = useMutation({
    mutationFn: () => {
      return persistCustomCategory({
        data: {
          restaurantId,
          name: newCatName.trim(),
          icon: newCatIcon.trim() || null,
          iconType: newCatIconType,
        },
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setNewCatError(result.message);
        toast.error(result.message);
        return;
      }

      setNewCatError("");
      toast.success(`Category "${result.name}" added`);
      setAddCategoryOpen(false);
      setSelectedCategory(result.name);
      setNewCatName("");
      setNewCatIcon("");
      setNewCatIconSignedUrl(null);
      setNewCatIconType("fallback");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pms-card2-amenity-categories", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities-ready", restaurantId] }),
      ]);
    },
    onError: () => toast.error("Could not save the category."),
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

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pms-card2-amenity-types", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities-ready", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["pms-card2-effective", restaurantId] }),
      ]);
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

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pms-card2-overrides", restaurantId, selectedRoomId] }),
      queryClient.invalidateQueries({ queryKey: ["pms-card2-effective", restaurantId, selectedRoomId] }),
      queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities-ready", restaurantId] }),
    ]);

    return true;
  }

  async function saveDraft(): Promise<boolean> {
    if (!canEdit) return false;

    if (catalogEditorOpen && (form.name.trim() || form.category)) {
      if (!form.name.trim() || !form.category) {
        setFormError("Amenity name and category are required.");
        toast.error("Amenity name and category are required.");
        return false;
      }
      const result = await saveAmenityMutation.mutateAsync();
      if (!result.ok) return false;
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

  const selectedType = types.find((row) => row.id === selectedTypeId) ?? null;
  const selectedRoom = rooms.find((row) => row.id === selectedRoomId) ?? null;
  const effective = effectiveQuery.data?.ok ? effectiveQuery.data : null;
  const currentOverrides = overridesQuery.data?.ok ? overridesQuery.data.overrides : [];

  const selectedTypeAmenities = amenities.filter((row) =>
    typeAmenityIds.includes(row.id),
  );

  const inheritedAmenities =
    effective?.inherited.filter(
      (row) => !effective.removed.some((removed) => removed.id === row.id),
    ) ?? [];
  const addedAmenities = effective?.added ?? [];
  const removedAmenities = effective?.removed ?? [];

  const addable = amenities.filter(
    (row) =>
      row.active && !(effective?.effective ?? []).some((item) => item.id === row.id),
  );

  const disabled = !canEdit;

  function newAmenity() {
    const defaultCat =
      selectedCategory === "Category Required"
        ? CANONICAL_AMENITY_CATEGORIES[0]
        : selectedCategory;
    setForm(emptyCatalog(defaultCat));
    setFormError("");
    setAmenityIconTab("preset");
    setCatalogEditorOpen(true);
  }

  function editRow(row: Card2Amenity) {
    setForm({
      id: row.id,
      name: row.name,
      code: row.code,
      category: row.category || CANONICAL_AMENITY_CATEGORIES[0],
      description: row.description,
      icon: row.icon,
      iconUrl: row.iconUrl,
      active: row.active,
      complimentary: row.complimentary,
      displayToGuest: row.displayToGuest,
      internalOnly: row.internalOnly,
    });
    setFormError("");
    setAmenityIconTab(
      row.icon.startsWith("http")
        ? "url"
        : row.icon.includes("/")
          ? "upload"
          : "preset",
    );
    setCatalogEditorOpen(true);
  }

  async function deactivate(row: Card2Amenity) {
    const result = await persistAmenity({
      data: {
        restaurantId,
        id: row.id,
        name: row.name,
        code: row.code || null,
        category: row.category || CANONICAL_AMENITY_CATEGORIES[0],
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
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities-ready", restaurantId] }),
    ]);
  }

  async function activate(row: Card2Amenity) {
    const result = await persistAmenity({
      data: {
        restaurantId,
        id: row.id,
        name: row.name,
        code: row.code || null,
        category: row.category || CANONICAL_AMENITY_CATEGORIES[0],
        description: row.description || null,
        icon: row.icon || null,
        active: true,
        complimentary: row.complimentary,
        displayToGuest: row.displayToGuest,
        internalOnly: row.internalOnly,
      },
    });

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success("Amenity activated");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["pms-card2-amenities-ready", restaurantId] }),
    ]);
  }

  // Handle category icon upload
  async function handleCategoryIconFile(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNewCatError("Only PNG, JPEG, and WEBP image files are allowed.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setNewCatError("Image file size must be less than 1 MB.");
      return;
    }
    setNewCatError("");
    setIsUploadingCatIcon(true);
    try {
      const ticket = await startIconUploadTicket({
        data: {
          restaurantId,
          contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
          size: file.size,
        },
      });
      if (!ticket.ok) {
        setNewCatError(ticket.message || "Failed to start image upload.");
        return;
      }
      const { error: uploadError } = await supabase.storage
        .from("property-images")
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (uploadError) {
        setNewCatError(uploadError.message || "Failed to upload image.");
        return;
      }
      setNewCatIcon(ticket.path);
      setNewCatIconType("upload");
      setNewCatIconSignedUrl(URL.createObjectURL(file));
      toast.success("Icon uploaded");
    } catch {
      setNewCatError("Image upload failed. Please try again.");
    } finally {
      setIsUploadingCatIcon(false);
      if (catFileInputRef.current) catFileInputRef.current.value = "";
    }
  }

  // Handle amenity icon upload
  async function handleAmenityIconFile(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFormError("Only PNG, JPEG, and WEBP image files are allowed.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setFormError("Image file size must be less than 1 MB.");
      return;
    }
    setFormError("");
    setIsUploadingAmenityIcon(true);
    try {
      const ticket = await startIconUploadTicket({
        data: {
          restaurantId,
          contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
          size: file.size,
        },
      });
      if (!ticket.ok) {
        setFormError(ticket.message || "Failed to start image upload.");
        return;
      }
      const { error: uploadError } = await supabase.storage
        .from("property-images")
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (uploadError) {
        setFormError(uploadError.message || "Failed to upload image.");
        return;
      }
      const localBlob = URL.createObjectURL(file);
      setForm((prev) => ({
        ...prev,
        icon: ticket.path,
        iconUrl: localBlob,
      }));
      toast.success("Icon uploaded");
    } catch {
      setFormError("Image upload failed. Please try again.");
    } finally {
      setIsUploadingAmenityIcon(false);
      if (amenityFileInputRef.current) amenityFileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6" data-testid="pms-card2-amenities-form">
      {/* SECTION 1: Master/Detail Category-First Amenity Catalog */}
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm" data-testid="pms-amenity-catalog-section">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EDE6D8] pb-4">
          <div>
            <h3 className="font-display text-lg text-[#251605]">
              Amenity Catalog
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Category-first catalogue with 14 approved canonical categories, rich icon scanning, and custom classifications.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setNewCatName("");
                setNewCatIcon("");
                setNewCatIconSignedUrl(null);
                setNewCatIconType("fallback");
                setNewCatError("");
                setAddCategoryOpen(true);
              }}
            >
              <FolderPlus className="mr-1.5 h-4 w-4" />
              Add Category
            </Button>
            <Button
              type="button"
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              size="sm"
              disabled={disabled}
              onClick={newAmenity}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Amenity
            </Button>
          </div>
        </div>

        {/* Master / Detail Split */}
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* LEFT: Category Navigator (4 cols) */}
          <div className="lg:col-span-4 rounded-xl border border-[#E6DFD3] bg-[#FDFCFB] p-3 space-y-3">
            <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-[#EDE6D8]">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Categories ({categoryNavItems.length})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 text-[#8B6220] hover:text-[#251605]"
                disabled={disabled}
                onClick={() => {
                  setNewCatName("");
                  setNewCatIcon("");
                  setNewCatIconSignedUrl(null);
                  setNewCatIconType("fallback");
                  setNewCatError("");
                  setAddCategoryOpen(true);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            <nav className="space-y-1 max-h-[640px] overflow-y-auto pr-1" aria-label="Amenity Categories">
              {categoryNavItems.map((cat) => {
                const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                      isSelected
                        ? "bg-white border-2 border-[#C89933] shadow-sm text-[#251605] font-semibold"
                        : "hover:bg-[#F7F4EE] text-[#4A3B2C] border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* 20-24px icon container visually aligned with name */}
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                        <AmenityIconDisplay
                          icon={cat.icon}
                          signedUrl={cat.signedUrl}
                          categoryName={cat.name}
                          size={22}
                          className={`h-5.5 w-5.5 shrink-0 ${isSelected ? "text-[#C89933]" : "text-[#5C4528]"}`}
                        />
                      </div>
                      <span className="truncate text-sm">{cat.name}</span>
                      {cat.kind === "custom" ? (
                        <span className="shrink-0 text-[10px] font-medium tracking-wide uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          Custom
                        </span>
                      ) : null}
                      {cat.kind === "uncategorized" ? (
                        <span className="shrink-0 text-[10px] font-medium tracking-wide uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                          Action
                        </span>
                      ) : null}
                    </div>

                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        isSelected
                          ? "bg-[#C89933]/20 text-[#251605]"
                          : "bg-[#EDE6D8] text-[#5C4528]"
                      }`}
                    >
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* RIGHT: Selected Category Amenities (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Header of selected category */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-[#E6DFD3] shadow-sm">
                  <AmenityIconDisplay
                    icon={selectedCategoryMeta?.icon}
                    signedUrl={selectedCategoryMeta?.signedUrl}
                    categoryName={selectedCategory}
                    size={24}
                    className="h-6 w-6 text-[#251605]"
                  />
                </div>
                <div>
                  <h4 className="font-display text-base font-semibold text-[#251605] flex items-center gap-2">
                    {selectedCategory}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {filteredCategoryAmenities.length} of {categoryAmenities.length} amenities matching
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                  disabled={disabled}
                  onClick={newAmenity}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Amenity
                </Button>
              </div>
            </div>

            {/* Filter toolbar */}
            <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 bg-white"
                  placeholder={`Search in ${selectedCategory}...`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search amenities in selected category"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All statuses</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Compact Amenity Grid (36-42px height, 18-20px icons, 2-3 cols) */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {filteredCategoryAmenities.map((row) => (
                <div
                  key={row.id}
                  onClick={() => editRow(row)}
                  className="h-[40px] px-3 rounded-lg border border-[#EDE6D8] bg-white hover:border-[#C89933] hover:bg-[#FDFCFB] flex items-center justify-between gap-2.5 transition-all cursor-pointer group shadow-xs select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <AmenityIconDisplay
                        icon={row.icon}
                        signedUrl={row.iconUrl}
                        categoryName={row.category}
                        size={18}
                        className="h-4.5 w-4.5 shrink-0 text-[#251605]"
                      />
                    </div>
                    <span className="text-[13px] font-medium text-[#251605] truncate">
                      {row.name.replace(/\u200B/g, "")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {row.code ? (
                      <span className="text-[10px] font-mono bg-[#F7F4EE] text-muted-foreground px-1.5 py-0.5 rounded border border-[#EDE6D8]">
                        {row.code}
                      </span>
                    ) : null}
                    <span
                      title={row.active ? "Active" : "Inactive"}
                      className={`h-2 w-2 rounded-full ${
                        row.active ? "bg-emerald-500" : "bg-stone-300"
                      }`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground group-hover:text-[#251605]"
                      disabled={disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        editRow(row);
                      }}
                    >
                      <span className="sr-only">Edit</span>
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {filteredCategoryAmenities.length === 0 ? (
              <div className="rounded-xl border border-[#EDE6D8] bg-white p-8 text-center">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <Sparkles className="h-8 w-8 text-[#C89933]/60" />
                  <p className="font-medium text-[#251605]">
                    No amenities found in {selectedCategory}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {search
                      ? "Try clearing your search query."
                      : "Click '+ Add Amenity' to add a custom amenity to this category."}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={disabled}
                    onClick={newAmenity}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add Amenity
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* SECTION 2: Room Type Amenities — CATEGORY-FIRST COMPACT CHECKBOX UI */}
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm" data-testid="pms-room-type-amenities-section">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EDE6D8] pb-4">
          <div>
            <h3 className="font-display text-lg text-[#251605]">
              Room Type Amenities
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Category-first compact checkbox selector. Selections across categories persist when switching.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-64">
              <Select
                disabled={disabled}
                value={selectedTypeId || undefined}
                onValueChange={setSelectedTypeId}
              >
                <SelectTrigger className="bg-white">
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
            </div>

            <Button
              type="button"
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              size="sm"
              disabled={disabled || !selectedTypeId || saveTypeMutation.isPending}
              onClick={() => saveTypeMutation.mutate()}
            >
              {saveTypeMutation.isPending ? "Saving..." : "Save Assignments"}
            </Button>
          </div>
        </div>

        {selectedType ? (
          <div className="mt-4 space-y-4">
            {/* Top Selection Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#F7F4EE] px-4 py-2.5 border border-[#EDE6D8]">
              <span className="text-sm font-medium text-[#251605]">
                {typeAmenityIds.length} amenities selected for {selectedType.displayName || selectedType.name}
              </span>
              <span className="text-xs text-muted-foreground">
                All changes persist when switching categories. Click "Save Assignments" to commit.
              </span>
            </div>

            {/* Category-First Master / Detail Grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
              {/* Category Navigator (4 cols) */}
              <div className="lg:col-span-4 rounded-xl border border-[#E6DFD3] bg-[#FDFCFB] p-3 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
                  Categories ({categoryNavItems.length})
                </span>

                <nav className="space-y-1 max-h-[520px] overflow-y-auto pr-1" aria-label="Room Type Amenity Categories">
                  {categoryNavItems.map((cat) => {
                    const isSelected = selectedTypeCategory.toLowerCase() === cat.name.toLowerCase();
                    const inCat = amenities.filter(
                      (a) => a.active && a.category?.trim().toLowerCase() === cat.name.toLowerCase(),
                    );
                    const selectedInCat = inCat.filter((a) => typeAmenityIds.includes(a.id)).length;

                    return (
                      <button
                        key={cat.name}
                        type="button"
                        onClick={() => setSelectedTypeCategory(cat.name)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                          isSelected
                            ? "bg-white border-2 border-[#C89933] shadow-sm text-[#251605] font-semibold"
                            : "hover:bg-[#F7F4EE] text-[#4A3B2C] border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                            <AmenityIconDisplay
                              icon={cat.icon}
                              signedUrl={cat.signedUrl}
                              categoryName={cat.name}
                              size={22}
                              className={`h-5.5 w-5.5 shrink-0 ${isSelected ? "text-[#C89933]" : "text-[#5C4528]"}`}
                            />
                          </div>
                          <span className="truncate text-sm">{cat.name}</span>
                        </div>

                        <span
                          className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                            selectedInCat > 0
                              ? "bg-[#C89933]/20 text-[#251605] font-semibold"
                              : "bg-[#EDE6D8] text-muted-foreground"
                          }`}
                        >
                          {selectedInCat} / {inCat.length}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Selected Category Checkbox Grid (8 cols) */}
              <div className="lg:col-span-8 space-y-4">
                {/* Header with category info, Selected Count, and Select All / Clear */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] p-3.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white border border-[#E6DFD3] shadow-xs">
                      <AmenityIconDisplay
                        icon={categoryNavItems.find((c) => c.name.toLowerCase() === selectedTypeCategory.toLowerCase())?.icon}
                        categoryName={selectedTypeCategory}
                        size={22}
                        className="h-5.5 w-5.5 text-[#251605]"
                      />
                    </div>
                    <div>
                      <h4 className="font-display text-sm font-semibold text-[#251605]">
                        {selectedTypeCategory}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {
                          amenities.filter(
                            (a) =>
                              a.active &&
                              a.category?.trim().toLowerCase() === selectedTypeCategory.trim().toLowerCase() &&
                              typeAmenityIds.includes(a.id),
                          ).length
                        }{" "}
                        of{" "}
                        {
                          amenities.filter(
                            (a) =>
                              a.active &&
                              a.category?.trim().toLowerCase() === selectedTypeCategory.trim().toLowerCase(),
                          ).length
                        }{" "}
                        selected
                      </p>
                    </div>
                  </div>

                  {/* Select All | Clear Actions for THIS category only */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2.5 bg-white"
                      disabled={disabled}
                      onClick={() => handleSelectAllCurrentCategory(selectedTypeCategory)}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2.5 text-muted-foreground hover:text-[#251605]"
                      disabled={disabled}
                      onClick={() => handleClearCurrentCategory(selectedTypeCategory)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {/* In-category search box */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9 bg-white"
                    placeholder={`Search amenities in ${selectedTypeCategory}...`}
                    value={typeCategorySearch}
                    onChange={(e) => setTypeCategorySearch(e.target.value)}
                  />
                </div>

                {/* Compact CHECKBOX GRID (36-42px height, 18-20px icon, 13-14px label, 2-3 cols) */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {amenities
                    .filter((a) => {
                      if (!a.active) return false;
                      const inCat = a.category?.trim().toLowerCase() === selectedTypeCategory.trim().toLowerCase();
                      if (!inCat) return false;
                      if (!typeCategorySearch.trim()) return true;
                      return a.name.toLowerCase().includes(typeCategorySearch.trim().toLowerCase());
                    })
                    .map((amenity) => {
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
                          className={`h-[40px] px-3 rounded-lg border flex items-center gap-2.5 cursor-pointer transition-all select-none outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] ${
                            isChecked
                              ? "bg-[#FBF8F2] border-[#C89933] text-[#251605] shadow-xs"
                              : "bg-white border-[#EDE6D8] hover:border-[#C89933]/50 hover:bg-[#FDFCFB] text-[#4A3B2C]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={disabled}
                            readOnly
                            className="h-4 w-4 rounded border-gray-300 text-[#C89933] focus:ring-[#C89933] pointer-events-none"
                          />
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                            <AmenityIconDisplay
                              icon={amenity.icon}
                              signedUrl={amenity.iconUrl}
                              categoryName={amenity.category}
                              size={18}
                              className="h-4.5 w-4.5 shrink-0 text-[#251605]"
                            />
                          </div>
                          <span className="text-[13px] font-medium truncate flex-1">
                            {amenity.name.replace(/\u200B/g, "")}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="pt-6 text-sm text-muted-foreground text-center">
            Select a room type to configure its default amenities.
          </p>
        )}
      </section>

      {/* SECTION 3: Room-Specific Overrides (PRESERVED) */}
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

      {/* DIALOG 1: Add Custom Category */}
      <Dialog
        open={addCategoryOpen}
        onOpenChange={(open) => {
          setAddCategoryOpen(open);
          if (!open) {
            setNewCatError("");
            setNewCatName("");
            setNewCatIcon("");
            setNewCatIconSignedUrl(null);
            setNewCatIconType("fallback");
          }
        }}
      >
        <DialogContent className="block max-h-[88dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-xl border border-[#CCCCCC] bg-white p-0 shadow-xl">
          <div className="sticky top-0 z-10 border-b border-[#EDE6D8] bg-white px-5 py-4">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="font-sans text-lg font-semibold text-[#251605]">
                Add Amenity Category
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Create a new category for classifying property amenities.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 p-5">
            <Field label="Category Name *">
              <Input
                placeholder="e.g. Wellness & Spa, Butler Services"
                value={newCatName}
                maxLength={60}
                onChange={(e) => {
                  setNewCatName(e.target.value);
                  setNewCatError("");
                }}
              />
            </Field>

            {/* Icon selection with 20-24px visual alignment */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[#251605]">Category Icon (Optional)</Label>
                <div className="flex rounded-lg border border-[#EDE6D8] p-0.5 bg-[#F7F4EE]">
                  <button
                    type="button"
                    onClick={() => setNewCatIconTab("preset")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      newCatIconTab === "preset"
                        ? "bg-white text-[#251605] shadow-xs"
                        : "text-muted-foreground hover:text-[#251605]"
                    }`}
                  >
                    Preset Icons
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatIconTab("upload")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      newCatIconTab === "upload"
                        ? "bg-white text-[#251605] shadow-xs"
                        : "text-muted-foreground hover:text-[#251605]"
                    }`}
                  >
                    Upload Image
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatIconTab("url")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      newCatIconTab === "url"
                        ? "bg-white text-[#251605] shadow-xs"
                        : "text-muted-foreground hover:text-[#251605]"
                    }`}
                  >
                    Icon URL
                  </button>
                </div>
              </div>

              {/* Icon tab contents */}
              {newCatIconTab === "preset" ? (
                <div className="rounded-xl border border-[#EDE6D8] p-3 bg-[#FAF8F5]">
                  <p className="text-xs text-muted-foreground mb-2.5">
                    Click a preset icon to select:
                  </p>
                  <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto pr-1">
                    {PRESET_AMENITY_ICONS.map((preset) => {
                      const IconComp = preset.icon;
                      const isSelected = newCatIcon === preset.name;
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          title={preset.label}
                          onClick={() => {
                            setNewCatIcon(preset.name);
                            setNewCatIconType("preset");
                            setNewCatIconSignedUrl(null);
                          }}
                          className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-all ${
                            isSelected
                              ? "border-[#C89933] bg-[#C89933]/15 text-[#C89933] ring-2 ring-[#C89933]/30"
                              : "border-[#E6DFD3] bg-white hover:bg-[#F7F4EE] text-[#5C4528]"
                          }`}
                        >
                          <IconComp className="h-5.5 w-5.5" size={22} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : newCatIconTab === "upload" ? (
                <div className="rounded-xl border border-[#EDE6D8] p-4 bg-[#FAF8F5] text-center space-y-3">
                  <input
                    ref={catFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => void handleCategoryIconFile(e.target.files?.[0])}
                  />
                  <div className="flex flex-col items-center justify-center space-y-1">
                    <UploadCloud className="h-8 w-8 text-muted-foreground" />
                    <p className="text-xs font-medium text-[#251605]">
                      {isUploadingCatIcon ? "Uploading..." : "Upload PNG, JPEG, or WEBP (max 1 MB)"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUploadingCatIcon}
                    onClick={() => catFileInputRef.current?.click()}
                  >
                    <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                    Choose File
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-[#EDE6D8] p-3 bg-[#FAF8F5] space-y-2">
                  <Label className="text-xs text-muted-foreground">Direct Image or Icon URL</Label>
                  <div className="relative">
                    <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9 bg-white"
                      placeholder="https://example.com/icons/spa.png"
                      value={newCatIcon}
                      onChange={(e) => {
                        setNewCatIcon(e.target.value);
                        setNewCatIconType("url");
                        setNewCatIconSignedUrl(null);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Visual preview box (20-24px icon) */}
              <div className="flex items-center gap-3 rounded-lg border border-[#EDE6D8] bg-[#F7F4EE] px-3 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white border border-[#E6DFD3] shadow-xs">
                  <AmenityIconDisplay
                    icon={newCatIcon}
                    signedUrl={newCatIconSignedUrl}
                    categoryName={newCatName}
                    size={22}
                    className="h-5.5 w-5.5 text-[#251605]"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[#251605] truncate">
                    {newCatName.trim() || "Category Name Preview"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    22px scannable icon preview
                  </p>
                </div>
              </div>
            </div>

            {newCatError ? (
              <p className="text-xs text-destructive">{newCatError}</p>
            ) : null}
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#EDE6D8] bg-white px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddCategoryOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={disabled || saveCategoryMutation.isPending || isUploadingCatIcon}
              onClick={() => {
                if (!newCatName.trim()) {
                  setNewCatError("Category name is required.");
                  return;
                }
                if (
                  isDuplicateCategoryName(
                    newCatName,
                    customCategoryNames,
                  )
                ) {
                  setNewCatError("A category with this name already exists.");
                  return;
                }
                saveCategoryMutation.mutate();
              }}
            >
              {saveCategoryMutation.isPending ? "Saving..." : "Save Category"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: Add / Edit Amenity */}
      <Dialog
        open={catalogEditorOpen}
        onOpenChange={(open) => {
          setCatalogEditorOpen(open);
          if (!open) {
            setFormError("");
            setForm(emptyCatalog(selectedCategory));
          }
        }}
      >
        <DialogContent className="block max-h-[88dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-[#CCCCCC] bg-white p-0 shadow-xl">
          <div className="sticky top-0 z-10 border-b border-[#EDE6D8] bg-white px-5 py-4">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="font-sans text-lg font-semibold text-[#251605]">
                {form.id ? "Edit Amenity" : "New Amenity"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Configure identity, category classification, icon, and guest visibility.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#251605]">
                Basic Information
              </h4>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Amenity Name *">
                  <Input
                    disabled={disabled}
                    placeholder="e.g. King Bed, Espresso Machine"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                </Field>

                <Field label="Amenity Code">
                  <Input
                    disabled={disabled}
                    placeholder="e.g. BED-KING, ESPRESSO"
                    value={form.code}
                    onChange={(event) =>
                      setForm({ ...form, code: event.target.value })
                    }
                  />
                </Field>

                <Field label="Category *" className="md:col-span-2">
                  <Select
                    disabled={disabled}
                    value={form.category}
                    onValueChange={(value) =>
                      setForm({ ...form, category: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {allSelectableCategories.map((c) => (
                        <SelectItem key={c.name} value={c.name}>
                          {c.name} {c.kind !== "Canonical" ? `(${c.kind})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {/* Amenity Icon with 20-24px visual alignment */}
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[#251605]">Amenity Icon (Optional)</Label>
                    <div className="flex rounded-lg border border-[#EDE6D8] p-0.5 bg-[#F7F4EE]">
                      <button
                        type="button"
                        onClick={() => setAmenityIconTab("preset")}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                          amenityIconTab === "preset"
                            ? "bg-white text-[#251605] shadow-xs"
                            : "text-muted-foreground hover:text-[#251605]"
                        }`}
                      >
                        Preset
                      </button>
                      <button
                        type="button"
                        onClick={() => setAmenityIconTab("upload")}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                          amenityIconTab === "upload"
                            ? "bg-white text-[#251605] shadow-xs"
                            : "text-muted-foreground hover:text-[#251605]"
                        }`}
                      >
                        Upload Image
                      </button>
                      <button
                        type="button"
                        onClick={() => setAmenityIconTab("url")}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                          amenityIconTab === "url"
                            ? "bg-white text-[#251605] shadow-xs"
                            : "text-muted-foreground hover:text-[#251605]"
                        }`}
                      >
                        URL
                      </button>
                    </div>
                  </div>

                  {amenityIconTab === "preset" ? (
                    <div className="rounded-xl border border-[#EDE6D8] p-3 bg-[#FAF8F5]">
                      <div className="grid grid-cols-6 gap-2 max-h-36 overflow-y-auto pr-1">
                        {PRESET_AMENITY_ICONS.map((preset) => {
                          const IconComp = preset.icon;
                          const isSelected = form.icon === preset.name;
                          return (
                            <button
                              key={preset.name}
                              type="button"
                              title={preset.label}
                              onClick={() => {
                                setForm((prev) => ({
                                  ...prev,
                                  icon: preset.name,
                                  iconUrl: null,
                                }));
                              }}
                              className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-all ${
                                isSelected
                                  ? "border-[#C89933] bg-[#C89933]/15 text-[#C89933] ring-2 ring-[#C89933]/30"
                                  : "border-[#E6DFD3] bg-white hover:bg-[#F7F4EE] text-[#5C4528]"
                              }`}
                            >
                              <IconComp className="h-5.5 w-5.5" size={22} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : amenityIconTab === "upload" ? (
                    <div className="rounded-xl border border-[#EDE6D8] p-4 bg-[#FAF8F5] text-center space-y-2">
                      <input
                        ref={amenityFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => void handleAmenityIconFile(e.target.files?.[0])}
                      />
                      <p className="text-xs text-muted-foreground">
                        {isUploadingAmenityIcon ? "Uploading..." : "Upload PNG, JPEG, or WEBP icon (max 1 MB)"}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUploadingAmenityIcon}
                        onClick={() => amenityFileInputRef.current?.click()}
                      >
                        <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                        Choose File
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#EDE6D8] p-3 bg-[#FAF8F5] space-y-1">
                      <Input
                        className="bg-white"
                        placeholder="https://example.com/icons/wifi.png"
                        value={form.icon}
                        onChange={(e) =>
                          setForm({ ...form, icon: e.target.value, iconUrl: null })
                        }
                      />
                    </div>
                  )}

                  {/* Icon Live Preview (22px) */}
                  <div className="flex items-center gap-3 rounded-lg border border-[#EDE6D8] bg-[#F7F4EE] px-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white border border-[#E6DFD3] shadow-xs">
                      <AmenityIconDisplay
                        icon={form.icon}
                        signedUrl={form.iconUrl}
                        categoryName={form.category}
                        size={22}
                        className="h-5.5 w-5.5 text-[#251605]"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Icon display size: 22px (aligned with amenity name)
                    </p>
                  </div>
                </div>

                <Field label="Description" className="md:col-span-2">
                  <Textarea
                    disabled={disabled}
                    placeholder="Optional description shown in room detail or guest notes"
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
                Visibility & Behavior
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
              disabled={disabled || saveAmenityMutation.isPending || isUploadingAmenityIcon}
              onClick={() => {
                if (!form.name.trim() || !form.category.trim()) {
                  setFormError("Amenity name and category are required.");
                  return;
                }
                saveAmenityMutation.mutate();
              }}
            >
              {saveAmenityMutation.isPending ? "Saving..." : "Save Amenity"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: Manage Room Type Amenities (PRESERVED) */}
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

            <div className="mt-4 space-y-4 max-h-[440px] overflow-y-auto pr-1">
              {allSelectableCategories.map((cat) => {
                const inCat = amenities.filter(
                  (a) =>
                    a.active &&
                    a.category?.toLowerCase() === cat.name.toLowerCase() &&
                    (!typeAmenitySearch.trim() ||
                      a.name.toLowerCase().includes(typeAmenitySearch.trim().toLowerCase())),
                );
                if (inCat.length === 0) return null;

                return (
                  <div key={cat.name} className="rounded-xl border border-[#EDE6D8] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <AmenityIconDisplay categoryName={cat.name} size={16} className="h-4 w-4" />
                      {cat.name}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {inCat.map((amenity) => {
                        const isChecked = typeAmenityIds.includes(amenity.id);
                        return (
                          <label
                            key={amenity.id}
                            className={`flex items-center gap-2.5 p-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                              isChecked
                                ? "bg-[#F7F4EE] border-[#C89933] text-[#251605]"
                                : "hover:bg-[#FDFCFB] border-[#EDE6D8]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={disabled}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setTypeAmenityIds([...typeAmenityIds, amenity.id]);
                                } else {
                                  setTypeAmenityIds(typeAmenityIds.filter((id) => id !== amenity.id));
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-[#C89933] focus:ring-[#C89933]"
                            />
                            <AmenityIconDisplay
                              icon={amenity.icon}
                              signedUrl={amenity.iconUrl}
                              categoryName={amenity.category}
                              size={18}
                              className="h-4.5 w-4.5 shrink-0"
                            />
                            <span className="font-medium truncate">{amenity.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#EDE6D8] bg-white px-5 py-4">
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
              disabled={disabled || saveTypeMutation.isPending}
              onClick={() => saveTypeMutation.mutate()}
            >
              {saveTypeMutation.isPending ? "Saving..." : "Save Amenities"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 4: Manage Room Overrides (PRESERVED) */}
      <Dialog
        open={overrideManagerOpen}
        onOpenChange={setOverrideManagerOpen}
      >
        <DialogContent className="block max-h-[88dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-[#CCCCCC] bg-white p-0 shadow-xl">
          <div className="sticky top-0 z-10 border-b border-[#EDE6D8] bg-white px-5 py-4">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="font-sans text-lg font-semibold text-[#251605]">
                Room Overrides — Room {selectedRoom?.roomNumber}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Override inherited room-type amenities specifically for Room {selectedRoom?.roomNumber}.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 p-5">
            <div className="flex gap-2">
              <Select value={addAmenityId} onValueChange={setAddAmenityId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add an amenity to this room..." />
                </SelectTrigger>
                <SelectContent>
                  {addable.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={!addAmenityId}
                onClick={async () => {
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
                }}
              >
                Add
              </Button>
            </div>

            {/* Overrides list */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Inherited Amenities
              </p>
              <div className="space-y-1.5">
                {inheritedAmenities.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-[#EDE6D8] bg-[#FAF8F5]"
                  >
                    <div className="flex items-center gap-2">
                      <AmenityIconDisplay
                        icon={a.icon}
                        signedUrl={a.iconUrl}
                        categoryName={a.category}
                        size={18}
                        className="h-4.5 w-4.5"
                      />
                      <span className="text-sm font-medium">{a.name}</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-red-700 hover:bg-red-50 hover:text-red-800"
                      onClick={async () => {
                        const next = [
                          ...currentOverrides.filter((row) => row.amenityId !== a.id),
                          { amenityId: a.id, kind: "remove" as const },
                        ];
                        const ok = await writeOverrides(next);
                        if (ok) toast.success("Removed for this room");
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              {addedAmenities.length > 0 ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">
                    Room-Specific Added Amenities
                  </p>
                  <div className="space-y-1.5">
                    {addedAmenities.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50"
                      >
                        <div className="flex items-center gap-2">
                          <AmenityIconDisplay
                            icon={a.icon}
                            signedUrl={a.iconUrl}
                            categoryName={a.category}
                            size={18}
                            className="h-4.5 w-4.5"
                          />
                          <span className="text-sm font-medium">{a.name}</span>
                          <span className="text-xs text-emerald-800 font-medium">(Added)</span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const next = currentOverrides.filter((row) => row.amenityId !== a.id);
                            const ok = await writeOverrides(next);
                            if (ok) toast.success("Removed room-specific amenity");
                          }}
                        >
                          Clear
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {removedAmenities.length > 0 ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">
                    Removed Inherited Amenities
                  </p>
                  <div className="space-y-1.5">
                    {removedAmenities.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-red-200 bg-red-50/50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm line-through text-muted-foreground">{a.name}</span>
                          <span className="text-xs text-red-700 font-medium">(Removed)</span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const next = currentOverrides.filter((row) => row.amenityId !== a.id);
                            const ok = await writeOverrides(next);
                            if (ok) toast.success("Restored inherited amenity");
                          }}
                        >
                          Restore
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-between gap-2 border-t border-[#EDE6D8] bg-white px-5 py-4">
            <Button
              type="button"
              variant="outline"
              className="text-red-700 hover:bg-red-50"
              onClick={async () => {
                const ok = await writeOverrides({ reset: true });
                if (ok) toast.success("Reset to room type defaults");
              }}
            >
              Reset to Defaults
            </Button>
            <Button
              type="button"
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

function CountMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-[#251605]">{value}</p>
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
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                removed
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-[#E6DFD3] bg-[#F7F4EE] text-[#251605]"
              }`}
            >
              <AmenityIconDisplay
                icon={row.icon}
                signedUrl={row.iconUrl}
                categoryName={row.category}
                size={14}
                className="h-3.5 w-3.5"
              />
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
