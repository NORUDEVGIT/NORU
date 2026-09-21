import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";

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
  const selectable = type.options.filter(
    (option) => option.active || values.includes(option.value),
  );
  if (!type.active) {
    return (
      <p className="text-sm text-muted-foreground">
        {labelForPreferenceValues(type.options, values, type.valueType) ?? "No value saved"}
        <span className="ml-2 text-xs">(inactive type)</span>
      </p>
    );
  }
  if (type.valueType === "multi") {
    return (
      <div className="flex flex-col gap-2">
        {selectable.map((option) => {
          const checked = values.includes(option.value);
          return (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={checked}
                disabled={!option.active && !checked}
                onCheckedChange={(value) => {
                  if (!option.active) return;
                  onChange(
                    value === true
                      ? [...values, option.value]
                      : values.filter((item) => item !== option.value),
                  );
                }}
              />
              {option.label}
              {!option.active ? <span className="text-xs text-muted-foreground">(inactive)</span> : null}
            </label>
          );
        })}
      </div>
    );
  }
  if (type.valueType === "yes_no") {
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={values[0] === "yes"}
          onCheckedChange={(checked) => onChange(checked ? ["yes"] : ["no"])}
        />
        <span className="text-sm">{values[0] === "yes" ? "Yes" : "No"}</span>
      </div>
    );
  }
  if (type.valueType === "text") {
    return (
      <Textarea
        value={values[0] ?? ""}
        maxLength={PREFERENCE_TEXT_MAX}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
      />
    );
  }
  if (type.valueType === "number") {
    return (
      <Input
        type="number"
        value={values[0] ?? ""}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
      />
    );
  }
  return (
    <Select
      value={values[0] || NONE}
      onValueChange={(value) => onChange(value === NONE ? [] : [value])}
    >
      <SelectTrigger>
        <SelectValue placeholder="Not set" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not set</SelectItem>
        {selectable.map((option) => (
          <SelectItem key={option.id} value={option.value} disabled={!option.active}>
            {option.label}
            {!option.active ? " (inactive)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GuestPreferencesCard({
  restaurantId,
  guestId,
  guest,
  onSaved,
}: {
  restaurantId: string;
  guestId: string;
  guest?: GuestProfile;
  preferences?: GuestPreferences;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);
  const fetchWorkspace = useServerFn(listGuestPreferenceWorkspace);
  const saveWorkspace = useServerFn(saveGuestPreferenceWorkspace);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: ["guest-preference-workspace", restaurantId, guestId],
    queryFn: () => fetchWorkspace({ data: { restaurantId, guestId } }),
    retry: false,
  });

  useEffect(() => {
    const data = workspaceQuery.data;
    if (!data) return;
    setDraft({
      applyToFutureReservations: data.applyToFutureReservations,
      answers: answersFromCategories(data.categories),
      contactDefaults: data.contactDefaults,
    });
  }, [workspaceQuery.data]);

  const saved = workspaceQuery.data;
  const baseline = useMemo(() => {
    if (!saved) return null;
    return JSON.stringify({
      applyToFutureReservations: saved.applyToFutureReservations,
      answers: answersFromCategories(saved.categories),
      contactDefaults: saved.contactDefaults,
    });
  }, [saved]);
  const dirty = Boolean(draft && baseline && JSON.stringify(draft) !== baseline);

  function restore() {
    if (!saved) return;
    setDraft({
      applyToFutureReservations: saved.applyToFutureReservations,
      answers: answersFromCategories(saved.categories),
      contactDefaults: saved.contactDefaults,
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Nothing to save.");
      return saveWorkspace({
        data: {
          restaurantId,
          guestId,
          applyToFutureReservations: draft.applyToFutureReservations,
          answers: Object.entries(draft.answers).map(([typeId, values]) => ({ typeId, values })),
          contactDefaults: draft.contactDefaults,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Preferences saved.");
      void queryClient.invalidateQueries({
        queryKey: ["guest-preference-workspace", restaurantId, guestId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["guest-preference-summary", restaurantId, guestId],
      });
      void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (workspaceQuery.isLoading || !draft) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-preferences">
        <p className="text-sm text-muted-foreground">Loading preferences…</p>
      </section>
    );
  }
  if (workspaceQuery.isError) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-preferences">
        <p className="text-sm text-destructive">Could not load guest preferences.</p>
      </section>
    );
  }

  const categories = saved?.categories ?? [];
  const hasTypes = categories.some((category) => category.types.length > 0);
  const summary = [
    ...catalogueChips(categories),
    ...contactDefaultChips(saved?.contactDefaults ?? draft.contactDefaults),
  ];
  const commCategory = categories.find((category) => category.code === "COMM");
  const otherCategories = categories.filter((category) => category.code !== "COMM");

  function setAnswer(typeId: string, values: string[]) {
    setDraft((current) =>
      current ? { ...current, answers: { ...current.answers, [typeId]: values } } : current,
    );
  }

  function renderCategory(category: GuestPreferenceWorkspaceCategory, extra?: ReactNode) {
    return (
      <section
        key={category.id}
        className="rounded-2xl border border-border bg-card p-5"
        data-testid={`guest-pref-category-${category.code}`}
      >
        <h4 className="font-medium">{category.name}</h4>
        {category.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
        ) : null}
        <div className="mt-4 space-y-4">
          {category.types.map((type) => (
            <div key={type.id}>
              <Label>
                {type.name}
                {type.required && type.active ? " *" : ""}
              </Label>
              <div className="mt-1">
                <TypeControl
                  type={type}
                  values={draft.answers[type.id] ?? []}
                  onChange={(next) => setAnswer(type.id, next)}
                />
              </div>
            </div>
          ))}
          {extra}
        </div>
      </section>
    );
  }

  const contactBlock = (
    <div className="rounded-xl border border-border p-4" data-testid="guest-pref-contact-defaults">
      <h5 className="font-medium">{CONTACT_DEFAULTS_TITLE}</h5>
      <p className="mt-1 text-xs text-muted-foreground">{CONTACT_DEFAULTS_COPY}</p>
      <div className="mt-3 space-y-3">
        <div>
          <Label htmlFor="pref-language">Preferred Language</Label>
          <Input
            id="pref-language"
            className="mt-1"
            value={draft.contactDefaults.language}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      contactDefaults: { ...current.contactDefaults, language: event.target.value },
                    }
                  : current,
              )
            }
          />
        </div>
        <div>
          <Label>Preferred Contact Method</Label>
          <Select
            value={draft.contactDefaults.preferredContactMethod || NONE}
            onValueChange={(value) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      contactDefaults: {
                        ...current.contactDefaults,
                        preferredContactMethod:
                          value === NONE ? "" : (value as ContactDefaultsDraft["preferredContactMethod"]),
                      },
                    }
                  : current,
              )
            }
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {PREFERRED_CONTACT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {PREFERRED_CONTACT_METHOD_LABELS[method]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Preferred Contact Time</Label>
          <Select
            value={draft.contactDefaults.preferredContactTime || NONE}
            onValueChange={(value) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      contactDefaults: {
                        ...current.contactDefaults,
                        preferredContactTime:
                          value === NONE ? "" : (value as ContactDefaultsDraft["preferredContactTime"]),
                      },
                    }
                  : current,
              )
            }
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
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
    </div>
  );

  return (
    <div className="space-y-4" data-testid="guest-preferences" ref={formRef}>
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg">Guest Preferences</h3>
            <p className="mt-1 text-sm text-muted-foreground">{PREFERENCES_COPY}</p>
            {guest ? (
              <p className="mt-1 text-xs text-muted-foreground">{guest.fullName}</p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.applyToFutureReservations}
              onCheckedChange={(checked) =>
                setDraft((current) =>
                  current ? { ...current, applyToFutureReservations: checked } : current,
                )
              }
            />
            Apply to Future Reservations
          </label>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          {!hasTypes ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                {PREFERENCES_EMPTY_TYPES}{" "}
                <a className="underline" href={PREFERENCE_SETUP_HREF}>
                  Open Property Setup
                </a>
              </p>
            </section>
          ) : null}
          {otherCategories.map((category) => renderCategory(category))}
          {commCategory
            ? renderCategory(commCategory, contactBlock)
            : (
                <section className="rounded-2xl border border-border bg-card p-5">
                  <h4 className="font-medium">Communication Preferences</h4>
                  <div className="mt-4">{contactBlock}</div>
                </section>
              )}
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-pref-summary">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium">Preference Summary</h4>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                Edit
              </Button>
            </div>
            {summary.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No preferences recorded yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {summary.map((chip) => (
                  <li key={`${chip.source}-${chip.code}`}>
                    <span className="text-muted-foreground">{chip.label}: </span>
                    {chip.value}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h4 className="font-medium">Apply Preferences</h4>
            <p className="mt-2 text-sm text-muted-foreground">{PREFERENCES_APPLY_COPY}</p>
            <div className="mt-3 flex items-center gap-2">
              <Switch
                checked={draft.applyToFutureReservations}
                onCheckedChange={(checked) =>
                  setDraft((current) =>
                    current ? { ...current, applyToFutureReservations: checked } : current,
                  )
                }
              />
              <span className="text-sm">Apply to future reservations</span>
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h4 className="font-medium">Important Note</h4>
            <p className="mt-2 text-sm text-muted-foreground">{PREFERENCES_IMPORTANT_NOTE}</p>
          </section>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (dirty) setDiscardOpen(true);
            else restore();
          }}
        >
          Cancel
        </Button>
        <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save Preferences"}
        </Button>
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel restores the last saved guest preferences. Nothing is written until you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                restore();
                setDiscardOpen(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
