import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, RotateCcw, Sliders, ExternalLink } from "lucide-react";

import {
  CONTACT_DEFAULTS_COPY,
  CONTACT_DEFAULTS_TITLE,
  PREFERENCES_APPLY_COPY,
  PREFERENCES_COPY,
  PREFERENCES_EMPTY_TYPES,
  PREFERENCES_IMPORTANT_NOTE,
  PREFERENCE_TEXT_MAX,
  contactDefaultChips,
  labelForPreferenceValues,
  type ContactDefaultsDraft,
  type PreferenceSummaryChip,
} from "@/packages/pms/lib/guest-preferences-workspace";
import {
  PREFERRED_CONTACT_METHODS,
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_TIMES,
  PREFERRED_CONTACT_TIME_LABELS,
} from "@/packages/pms/lib/guest-profile-overview";
import { PREFERENCE_SETUP_HREF } from "@/packages/pms/lib/guest-profile-wave2";
import {
  listGuestPreferenceWorkspace,
  saveGuestPreferenceWorkspace,
  type GuestPreferenceWorkspaceCategory,
  type GuestPreferenceWorkspaceType,
  type GuestPreferences,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
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
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

const NONE = "__none__";

type Draft = {
  applyToFutureReservations: boolean;
  answers: Record<string, string[]>;
  contactDefaults: ContactDefaultsDraft;
};

function answersFromCategories(categories: GuestPreferenceWorkspaceCategory[]) {
  const answers: Record<string, string[]> = {};
  for (const category of categories) {
    for (const type of category.types) answers[type.id] = [...type.values];
  }
  return answers;
}

function catalogueChips(categories: GuestPreferenceWorkspaceCategory[]): PreferenceSummaryChip[] {
  const chips: PreferenceSummaryChip[] = [];
  for (const category of categories) {
    for (const type of category.types) {
      const value = labelForPreferenceValues(type.options, type.values, type.valueType);
      if (!value) continue;
      chips.push({
        source: "catalogue",
        code: type.code,
        label: type.name,
        value,
      });
    }
  }
  return chips;
}

function TypeControl({
  type,
  values,
  onChange,
}: {
  type: GuestPreferenceWorkspaceType;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  if (!type.active) {
    const displayValue = labelForPreferenceValues(type.options, values, type.valueType);
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-xs text-[#756A5B]">{displayValue ?? "No value saved"}</span>
        <span className="text-[10px] text-[#8A641A] font-medium bg-[#FBF7EE] border border-[#DDD4C5] px-1.5 py-0.5 rounded">
          inactive type
        </span>
      </div>
    );
  }

  // 1. MULTI SELECT
  if (type.valueType === "multi" || (type.valueType as string) === "multiselect") {
    if (type.options.length === 0) {
      return (
        <div className="flex items-center gap-1.5 py-1 text-xs text-[#756A5B]">
          <span>No active options configured.</span>
          <a
            href={PREFERENCE_SETUP_HREF}
            className="inline-flex items-center gap-0.5 text-[#8A641A] hover:underline font-medium text-[11px]"
          >
            Review Property Setup
            <ExternalLink className="size-3 ml-0.5" />
          </a>
        </div>
      );
    }

    const selectable = type.options.filter(
      (option) => option.active || values.includes(option.value),
    );

    return (
      <div className="flex flex-wrap gap-2 pt-1" data-testid={`pref-multi-${type.code}`}>
        {selectable.map((option) => {
          const checked = values.includes(option.value);
          const isOptionInactive = !option.active;
          return (
            <label
              key={option.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors cursor-pointer select-none",
                checked
                  ? "border-[#C89933] bg-[#FBF7EE] text-[#8A641A] font-medium"
                  : "border-[#DDD4C5] bg-white text-[#756A5B] hover:border-[#8A641A]",
                isOptionInactive && !checked && "opacity-50 cursor-not-allowed",
              )}
            >
              <Checkbox
                checked={checked}
                disabled={isOptionInactive && !checked}
                onCheckedChange={(next) => {
                  if (isOptionInactive && !checked) return;
                  if (next) {
                    onChange([...values, option.value]);
                  } else {
                    onChange(values.filter((item) => item !== option.value));
                  }
                }}
                className="size-3.5 border-[#DDD4C5] data-[state=checked]:bg-[#8A641A] data-[state=checked]:border-[#8A641A]"
              />
              <span>
                {option.label}
                {isOptionInactive ? " — Inactive" : ""}
              </span>
            </label>
          );
        })}
      </div>
    );
  }

  // 2. YES / NO
  if (type.valueType === "yes_no") {
    const isYes = values[0] === "yes" || values[0] === "true";
    return (
      <div className="flex items-center gap-2 pt-1">
        <Switch
          checked={isYes}
          onCheckedChange={(checked) => onChange(checked ? ["yes"] : ["no"])}
        />
        <span className="text-xs font-medium text-[#251605]">{isYes ? "Yes" : "No"}</span>
      </div>
    );
  }

  // 3. NUMBER
  if (type.valueType === "number") {
    return (
      <Input
        type="number"
        className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
        value={values[0] ?? ""}
        placeholder={`Enter ${type.name.toLowerCase()}…`}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
      />
    );
  }

  // 4. TEXT
  if (type.valueType === "text") {
    const isLong =
      type.name.toLowerCase().includes("request") ||
      type.name.toLowerCase().includes("instruction") ||
      type.name.toLowerCase().includes("detail") ||
      type.name.toLowerCase().includes("note");
    if (isLong) {
      return (
        <Textarea
          rows={3}
          maxLength={PREFERENCE_TEXT_MAX}
          className="text-xs border-[#DDD4C5] bg-white text-[#251605]"
          value={values[0] ?? ""}
          placeholder={`Enter ${type.name.toLowerCase()}…`}
          onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
        />
      );
    }
    return (
      <Input
        className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
        maxLength={PREFERENCE_TEXT_MAX}
        value={values[0] ?? ""}
        placeholder={`Enter ${type.name.toLowerCase()}…`}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
      />
    );
  }

  // 5. OPTION / SINGLE SELECT (type.valueType === "single" || fallback if options exist)
  if (type.options.length === 0) {
    return (
      <div className="flex items-center gap-1.5 py-1 text-xs text-[#756A5B]">
        <span>No active options configured.</span>
        <a
          href={PREFERENCE_SETUP_HREF}
          className="inline-flex items-center gap-0.5 text-[#8A641A] hover:underline font-medium text-[11px]"
        >
          Review Property Setup
          <ExternalLink className="size-3 ml-0.5" />
        </a>
      </div>
    );
  }

  const selectable = type.options.filter(
    (option) => option.active || values.includes(option.value),
  );
  const selected = values[0] || NONE;

  return (
    <Select value={selected} onValueChange={(val) => onChange(val === NONE ? [] : [val])}>
      <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
        <SelectValue placeholder="Not set" />
      </SelectTrigger>
      <SelectContent className="border-[#DDD4C5] bg-white text-[#251605] shadow-xl text-xs">
        <SelectItem value={NONE} className="text-[#756A5B]">
          Not set
        </SelectItem>
        {selectable.map((option) => (
          <SelectItem
            key={option.id}
            value={option.value}
            disabled={!option.active}
            className={cn("text-xs", !option.active && "text-[#756A5B] italic")}
          >
            {option.label}
            {!option.active ? " — Inactive" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GuestPreferencesView({
  restaurantId,
  guestId,
  guest,
  preferences,
  canManage = true,
  onSaved,
}: {
  restaurantId: string;
  guestId: string;
  guest?: GuestProfile | undefined;
  preferences?: GuestPreferences | undefined;
  canManage?: boolean | undefined;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(listGuestPreferenceWorkspace);
  const saveWorkspace = useServerFn(saveGuestPreferenceWorkspace);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const workspaceQuery = useQuery({
    queryKey: ["guest-preference-workspace", restaurantId, guestId],
    queryFn: () => fetchWorkspace({ data: { restaurantId, guestId } }),
    retry: false,
  });

  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!workspaceQuery.data) return;
    const data = workspaceQuery.data;
    setDraft({
      applyToFutureReservations: data.applyToFutureReservations,
      answers: answersFromCategories(data.categories),
      contactDefaults: {
        language: data.contactDefaults.language,
        preferredContactMethod: data.contactDefaults.preferredContactMethod,
        preferredContactTime: data.contactDefaults.preferredContactTime,
      },
    });
  }, [workspaceQuery.data]);

  const isDirty = useMemo(() => {
    if (!draft || !workspaceQuery.data) return false;
    const initial = workspaceQuery.data;
    if (draft.applyToFutureReservations !== initial.applyToFutureReservations) return true;
    if (draft.contactDefaults.language !== initial.contactDefaults.language) return true;
    if (
      draft.contactDefaults.preferredContactMethod !==
      initial.contactDefaults.preferredContactMethod
    )
      return true;
    if (draft.contactDefaults.preferredContactTime !== initial.contactDefaults.preferredContactTime)
      return true;

    const initialAnswers = answersFromCategories(initial.categories);
    const keys = new Set([...Object.keys(draft.answers), ...Object.keys(initialAnswers)]);
    for (const key of keys) {
      const a = (draft.answers[key] ?? []).slice().sort().join(",");
      const b = (initialAnswers[key] ?? []).slice().sort().join(",");
      if (a !== b) return true;
    }
    return false;
  }, [draft, workspaceQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft || !workspaceQuery.data) return;
      const categories = workspaceQuery.data.categories;
      const typeById = new Map<string, GuestPreferenceWorkspaceType>();
      for (const cat of categories) {
        for (const t of cat.types) typeById.set(t.id, t);
      }

      const answersPayload = Object.entries(draft.answers).map(([typeId, values]) => {
        const t = typeById.get(typeId);
        return {
          typeId,
          code: t?.code ?? typeId,
          valueType: t?.valueType ?? "select",
          values,
        };
      });

      await saveWorkspace({
        data: {
          restaurantId,
          guestId,
          applyToFutureReservations: draft.applyToFutureReservations,
          contactDefaults: draft.contactDefaults,
          answers: answersPayload,
        },
      });
    },
    onSuccess: () => {
      toast.success("Preferences saved successfully.");
      void queryClient.invalidateQueries({
        queryKey: ["guest-preference-workspace", restaurantId, guestId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["guest", restaurantId, guestId],
      });
      onSaved?.();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save preferences.");
    },
  });

  if (workspaceQuery.isLoading || !draft) {
    return (
      <div className="space-y-4" data-testid="guest-preferences-loading">
        <div className="h-10 rounded-lg border border-[#DDD4C5] bg-white animate-pulse" />
        <div className="h-64 rounded-lg border border-[#DDD4C5] bg-white animate-pulse" />
      </div>
    );
  }

  if (workspaceQuery.isError) {
    return (
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-center text-xs text-[#756A5B]">
        Failed to load guest preferences.
      </div>
    );
  }

  if (!workspaceQuery.data) {
    return null;
  }

  const { categories } = workspaceQuery.data;
  const summary: PreferenceSummaryChip[] = [
    ...catalogueChips(categories),
    ...contactDefaultChips(draft.contactDefaults),
  ];

  function setAnswer(typeId: string, values: string[]) {
    setDraft((curr) => (curr ? { ...curr, answers: { ...curr.answers, [typeId]: values } } : curr));
  }

  function handleDiscard() {
    if (!workspaceQuery.data) return;
    const data = workspaceQuery.data;
    setDraft({
      applyToFutureReservations: data.applyToFutureReservations,
      answers: answersFromCategories(data.categories),
      contactDefaults: {
        language: data.contactDefaults.language,
        preferredContactMethod: data.contactDefaults.preferredContactMethod,
        preferredContactTime: data.contactDefaults.preferredContactTime,
      },
    });
  }

  const hasTypes = categories.some((category) => category.types.length > 0);

  return (
    <div ref={containerRef} className="space-y-4" data-testid="guest-preferences">
      {/* Top Workspace Bar: Single authoritative Apply toggle + Save/Discard controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#251605]">Preferences</h2>
            <p className="text-[11px] text-[#756A5B]">{PREFERENCES_COPY}</p>
          </div>
          <div className="h-6 w-px bg-[#DDD4C5]" />
          {/* Exactly ONE Authoritative Apply to Future Reservations toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#251605]">
            <Switch
              data-testid="guest-pref-apply-future-toggle"
              checked={draft.applyToFutureReservations}
              disabled={!canManage}
              onCheckedChange={(checked) =>
                setDraft((current) =>
                  current ? { ...current, applyToFutureReservations: checked } : current,
                )
              }
            />
            <span>Apply to future reservations</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {isDirty ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saveMutation.isPending}
              onClick={handleDiscard}
              className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B] hover:bg-[#F7F4EE]"
            >
              <RotateCcw className="mr-1.5 size-3.5" /> Discard
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!canManage || !isDirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="h-8 text-xs bg-[#8A641A] hover:bg-[#725215] text-white shadow-sm font-medium transition-colors"
          >
            <Check className="mr-1.5 size-3.5" />
            {saveMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Summary Strip */}
      <div
        className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm text-xs text-[#251605]"
        data-testid="guest-pref-summary"
      >
        <span className="font-semibold text-[#756A5B] mr-2">Summary:</span>
        {summary.length === 0 ? (
          <span className="text-[#756A5B]">No preferences recorded yet.</span>
        ) : (
          <span className="leading-relaxed">
            {summary.map((chip, idx) => (
              <span key={`${chip.source}-${chip.code}`}>
                {idx > 0 ? " | " : ""}
                <span className="text-[#756A5B]">{chip.label}:</span>{" "}
                <span className="font-medium text-[#251605]">{chip.value}</span>
              </span>
            ))}
          </span>
        )}
      </div>

      {!hasTypes ? (
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-center text-xs text-[#756A5B]">
          <p>{PREFERENCES_EMPTY_TYPES}</p>
          <a
            className="inline-flex items-center gap-1 mt-2 text-[#8A641A] hover:underline font-medium"
            href={PREFERENCE_SETUP_HREF}
          >
            <span>Open Property Setup</span>
            <ExternalLink className="size-3" />
          </a>
        </div>
      ) : null}

      {/* Preference Categories: 2-column operational form layout */}
      <div className="space-y-4">
        {categories.map((category) => (
          <section
            key={category.id}
            className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
            data-testid={`guest-pref-category-${category.code}`}
          >
            <div className="border-b border-[#DDD4C5] pb-2">
              <h3 className="font-display text-sm font-semibold text-[#251605]">{category.name}</h3>
              {category.description ? (
                <p className="text-[11px] text-[#756A5B] mt-0.5">{category.description}</p>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              {category.types.map((type) => (
                <div key={type.id} className="space-y-1">
                  <Label className="text-xs font-medium text-[#756A5B]">
                    {type.name}
                    {type.required && type.active ? " *" : ""}
                  </Label>
                  <TypeControl
                    type={type}
                    values={draft.answers[type.id] ?? []}
                    onChange={(next) => setAnswer(type.id, next)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Communication Defaults Section */}
        <section
          className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
          data-testid="guest-pref-contact-defaults"
        >
          <div className="border-b border-[#DDD4C5] pb-2">
            <h3 className="font-display text-sm font-semibold text-[#251605]">
              {CONTACT_DEFAULTS_TITLE}
            </h3>
            <p className="text-[11px] text-[#756A5B] mt-0.5">{CONTACT_DEFAULTS_COPY}</p>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="pref-language" className="text-xs font-medium text-[#756A5B]">
                Preferred Language
              </Label>
              <Input
                id="pref-language"
                className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
                value={draft.contactDefaults.language}
                disabled={!canManage}
                onChange={(event) =>
                  setDraft((curr) =>
                    curr
                      ? {
                          ...curr,
                          contactDefaults: {
                            ...curr.contactDefaults,
                            language: event.target.value,
                          },
                        }
                      : curr,
                  )
                }
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-[#756A5B]">Preferred Contact Method</Label>
              <Select
                value={draft.contactDefaults.preferredContactMethod || NONE}
                disabled={!canManage}
                onValueChange={(value) =>
                  setDraft((curr) =>
                    curr
                      ? {
                          ...curr,
                          contactDefaults: {
                            ...curr.contactDefaults,
                            preferredContactMethod:
                              value === NONE
                                ? ""
                                : (value as ContactDefaultsDraft["preferredContactMethod"]),
                          },
                        }
                      : curr,
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {PREFERRED_CONTACT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {PREFERRED_CONTACT_METHOD_LABELS[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-[#756A5B]">Preferred Contact Time</Label>
              <Select
                value={draft.contactDefaults.preferredContactTime || NONE}
                disabled={!canManage}
                onValueChange={(value) =>
                  setDraft((curr) =>
                    curr
                      ? {
                          ...curr,
                          contactDefaults: {
                            ...curr.contactDefaults,
                            preferredContactTime:
                              value === NONE
                                ? ""
                                : (value as ContactDefaultsDraft["preferredContactTime"]),
                          },
                        }
                      : curr,
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {PREFERRED_CONTACT_TIMES.map((time) => (
                    <SelectItem key={time} value={time}>
                      {PREFERRED_CONTACT_TIME_LABELS[time]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Operational Note */}
        <div className="rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] p-3 text-[11px] text-[#756A5B]">
          <span className="font-semibold text-[#251605]">Note: </span>
          {PREFERENCES_IMPORTANT_NOTE}
        </div>
      </div>
    </div>
  );
}
