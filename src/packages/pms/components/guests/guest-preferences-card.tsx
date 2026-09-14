import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  PREFERENCE_FLOORS_HREF,
  PREFERENCE_OPTION_CATEGORY_LABELS,
  PREFERENCE_ROOMS_HREF,
  PREFERENCE_SETUP_HREF,
  encodePreferenceValue,
  resolvePreferenceSelection,
  type PreferenceOptionCategory,
  type PreferenceSelection,
} from "@/packages/pms/lib/guest-profile-wave2";
import {
  getGuestPreferenceCatalogues,
  saveGuestPreferences,
  type GuestPreferenceCatalogues,
  type GuestPreferences,
  type PreferenceCatalogueOption,
} from "@/packages/pms/lib/guests.functions";

const NONE = "__none__";
const OTHER = "__other__";

type CatalogueField = {
  key: keyof GuestPreferences;
  label: string;
  source: "roomTypes" | "floors" | PreferenceOptionCategory;
  setupHref: string;
  emptyCopy: string;
};

const CATALOGUE_FIELDS: CatalogueField[] = [
  {
    key: "roomPreference",
    label: "Room preference",
    source: "roomTypes",
    setupHref: PREFERENCE_ROOMS_HREF,
    emptyCopy:
      "No room types in Property Setup yet. This field is gated until the hotel adds room types.",
  },
  {
    key: "floorPreference",
    label: "Floor preference",
    source: "floors",
    setupHref: PREFERENCE_FLOORS_HREF,
    emptyCopy: "No floors in Property Setup yet. This field is gated until the hotel adds floors.",
  },
  {
    key: "bedPreference",
    label: "Bed preference",
    source: "bed",
    setupHref: PREFERENCE_SETUP_HREF,
    emptyCopy: "No bed options yet. Add them in Property Setup — this is not a global list.",
  },
  {
    key: "viewPreference",
    label: "View preference",
    source: "view",
    setupHref: PREFERENCE_SETUP_HREF,
    emptyCopy: "No view options yet. Add them in Property Setup — this is not a global list.",
  },
  {
    key: "foodPreference",
    label: "Food preference",
    source: "food",
    setupHref: PREFERENCE_SETUP_HREF,
    emptyCopy: "No food preference options yet. Meal plans are not used as food preferences.",
  },
  {
    key: "communicationPreference",
    label: "Communication preference",
    source: "communication",
    setupHref: PREFERENCE_SETUP_HREF,
    emptyCopy:
      "No communication options yet. Add them in Property Setup — this is not a global list.",
  },
];

function optionsFor(
  catalogues: GuestPreferenceCatalogues | undefined,
  source: CatalogueField["source"],
): PreferenceCatalogueOption[] {
  if (!catalogues) return [];
  if (source === "roomTypes") return catalogues.roomTypes;
  if (source === "floors") return catalogues.floors;
  return catalogues.options[source].filter((option) => option.active !== false);
}

export function GuestPreferencesCard({
  restaurantId,
  guestId,
  preferences,
  onSaved,
}: {
  restaurantId: string;
  guestId: string;
  preferences: GuestPreferences;
  onSaved: () => void;
}) {
  const savePrefs = useServerFn(saveGuestPreferences);
  const loadCatalogues = useServerFn(getGuestPreferenceCatalogues);
  const [draft, setDraft] = useState<GuestPreferences>(preferences);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const cataloguesQuery = useQuery({
    queryKey: ["guest-preference-catalogues", restaurantId],
    queryFn: () => loadCatalogues({ data: { restaurantId } }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => savePrefs({ data: { restaurantId, guestId, preferences: draft } }),
    onSuccess: () => {
      toast.success("Preferences saved.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6" data-testid="guest-preferences-card">
      <div>
        <h2 className="font-display text-xl">Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Setup-owned options for this property. Accessibility and special requests stay free-text.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {CATALOGUE_FIELDS.map((field) => (
            <CataloguePreferenceField
              key={field.key}
              field={field}
              stored={draft[field.key]}
              options={optionsFor(cataloguesQuery.data, field.source)}
              loading={cataloguesQuery.isLoading}
              onChange={(value) => setDraft((prev) => ({ ...prev, [field.key]: value }))}
            />
          ))}
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="guest-wave2-accessibility">Accessibility requirements</Label>
            <Textarea
              id="guest-wave2-accessibility"
              rows={2}
              value={draft.accessibilityRequirements ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, accessibilityRequirements: event.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="guest-wave2-special">Special requests</Label>
            <Textarea
              id="guest-wave2-special"
              rows={3}
              value={draft.specialRequests ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, specialRequests: event.target.value }))
              }
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CataloguePreferenceField({
  field,
  stored,
  options,
  loading,
  onChange,
}: {
  field: CatalogueField;
  stored: string | null;
  options: PreferenceCatalogueOption[];
  loading: boolean;
  onChange: (value: string | null) => void;
}) {
  const mapped = options.map((option) => ({ id: option.id, label: option.label }));
  const selection = resolvePreferenceSelection(stored, mapped);
  const selectValue =
    selection.kind === "id" ? selection.id : selection.kind === "other" ? OTHER : NONE;
  const otherText = selection.kind === "other" ? selection.otherText : "";

  if (loading) {
    return (
      <div className="space-y-1.5">
        <Label>{field.label}</Label>
        <p className="text-sm text-muted-foreground">Loading options…</p>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="space-y-1.5" data-testid={`guest-pref-gated-${field.key}`}>
        <Label>{field.label}</Label>
        <p className="text-sm text-muted-foreground">{field.emptyCopy}</p>
        <a
          href={field.setupHref}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Open Property Setup
        </a>
      </div>
    );
  }

  function apply(next: PreferenceSelection) {
    onChange(encodePreferenceValue(next));
  }

  return (
    <div className="space-y-1.5">
      <Label>{field.label}</Label>
      <Select
        value={selectValue}
        onValueChange={(value) => {
          if (value === NONE) apply({ kind: "empty" });
          else if (value === OTHER) apply({ kind: "other", otherText: otherText || "" });
          else apply({ kind: "id", id: value });
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>Other</SelectItem>
        </SelectContent>
      </Select>
      {selection.kind === "other" ? (
        <Input
          value={otherText}
          placeholder={`Other ${field.label.toLowerCase()}`}
          onChange={(event) => apply({ kind: "other", otherText: event.target.value })}
        />
      ) : null}
    </div>
  );
}

export function preferenceCategoryLabel(category: PreferenceOptionCategory) {
  return PREFERENCE_OPTION_CATEGORY_LABELS[category];
}
