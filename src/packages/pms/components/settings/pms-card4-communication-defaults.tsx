import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { FieldShell } from "@/packages/pms/components/settings/pms-card6-integration-bits";
import {
  getPmsCard4CommunicationDefaults,
  savePmsCard4CommunicationDefaults,
} from "@/packages/pms/lib/communication-defaults-card4.functions";
import {
  COMMUNICATION_DATE_FORMATS,
  COMMUNICATION_DATE_FORMAT_LABELS,
  COMMUNICATION_TEMPLATE_CATEGORIES,
  COMMUNICATION_TEMPLATE_CATEGORY_LABELS,
  COMMUNICATION_TIME_FORMATS,
  COMMUNICATION_TIME_FORMAT_LABELS,
  card1LanguageOptions,
  channelOptionLabel,
  communicationDefaultsToDraft,
  senderOptionLabel,
  validateCommunicationDefaultsDraft,
  type CommunicationDateFormat,
  type CommunicationDefaultsDraft,
  type CommunicationTimeFormat,
  type CommunicationTemplateCategory,
} from "@/packages/pms/lib/communication-defaults-card4.server";
import { CARD1_LANGUAGES } from "@/packages/pms/lib/pms-property-setup-card1";
import { COMMON_CURRENCIES, COMMON_TIMEZONES } from "@/shared/lib/property-time";
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
import { Textarea } from "@/shared/components/ui/textarea";

export function PmsCard4CommunicationDefaults({
  restaurantId,
  canEdit,
  onSavingChange,
  saveRequest,
  onSaved,
}: {
  restaurantId: string;
  canEdit: boolean;
  onSavingChange: (saving: boolean, canSave: boolean) => void;
  saveRequest: { token: number; thenNext: boolean } | null;
  onSaved: (thenNext: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard4CommunicationDefaults);
  const save = useServerFn(savePmsCard4CommunicationDefaults);
  const queryKey = ["pms-card4-communication-defaults", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });
  const [draft, setDraft] = useState<CommunicationDefaultsDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const handledSaveToken = useRef(0);
  const thenNextRef = useRef(false);

  useEffect(() => {
    if (!query.data || dirty) return;
    setDraft(communicationDefaultsToDraft(query.data.defaults));
  }, [query.data, dirty]);

  const channels = query.data?.channels ?? [];
  const senders = query.data?.senders ?? [];
  const inherited = query.data?.inherited;
  const errors = draft ? validateCommunicationDefaultsDraft(draft, channels, senders) : [];
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;

  function mark<K extends keyof CommunicationDefaultsDraft>(
    key: K,
    value: CommunicationDefaultsDraft[K],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
  }

  const languages = useMemo(
    () => card1LanguageOptions(draft?.defaultLanguage || inherited?.language || "en"),
    [draft?.defaultLanguage, inherited?.language],
  );
  const timezones = useMemo(() => {
    const current = draft?.timezone || inherited?.timezone || "";
    if (current && !COMMON_TIMEZONES.includes(current as (typeof COMMON_TIMEZONES)[number])) {
      return [current, ...COMMON_TIMEZONES];
    }
    return [...COMMON_TIMEZONES];
  }, [draft?.timezone, inherited?.timezone]);
  const currencies = useMemo(() => {
    const current = draft?.currencyCode || inherited?.currencyCode || "";
    if (current && !COMMON_CURRENCIES.some((row) => row.code === current)) {
      return [{ code: current, label: current }, ...COMMON_CURRENCIES];
    }
    return [...COMMON_CURRENCIES];
  }, [draft?.currencyCode, inherited?.currencyCode]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draft?.id) throw new Error("Communication defaults are not ready.");
      return save({
        data: {
          restaurantId,
          id: draft.id,
          defaultGuestChannelId: draft.defaultGuestChannelId,
          defaultInternalChannelId: draft.defaultInternalChannelId,
          defaultMarketingChannelId: draft.defaultMarketingChannelId,
          defaultLanguage: draft.defaultLanguage,
          timezone: draft.timezone,
          dateFormat: draft.dateFormat,
          timeFormat: draft.timeFormat,
          defaultSenderId: draft.defaultSenderId,
          replyToEmail: draft.replyToEmail,
          signature: draft.signature,
          guestNotificationsEnabled: draft.guestNotificationsEnabled,
          internalNotificationsEnabled: draft.internalNotificationsEnabled,
          marketingCommunicationsEnabled: draft.marketingCommunicationsEnabled,
          useGuestLanguage: draft.useGuestLanguage,
          attachBranding: draft.attachBranding,
          currencyCode: draft.currencyCode,
          templateCategory: draft.templateCategory,
          deliveryTime: draft.deliveryTime,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setDirty(false);
      toast.success("Communication defaults saved successfully.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to save communication defaults."),
  });

  const busy = saveMutation.isPending;
  const canSave = canEdit && Boolean(draft?.id) && !busy && errors.length === 0;
  useEffect(() => {
    onSavingChange(busy, canSave);
  }, [busy, canSave, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (!canEdit || !draft || errors.length > 0) {
      if (errors[0]?.message) toast.error(errors[0].message);
      return;
    }
    if (!dirty) {
      onSaved(thenNextRef.current);
      return;
    }
    saveMutation.mutate(undefined, {
      onSuccess: () => onSaved(thenNextRef.current),
    });
  }, [saveRequest, canEdit, draft, errors, dirty, onSaved, saveMutation]);

  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";

  function channelLabel(id: string | null) {
    const row = channels.find((item) => item.id === id);
    return row ? channelOptionLabel(row) : "Unavailable — reselect";
  }
  function senderLabel(id: string | null) {
    const row = senders.find((item) => item.id === id);
    return row ? senderOptionLabel(row) : "Unavailable — reselect";
  }
  function languageLabel(id: string) {
    return languages.find((row) => row.id === id)?.label ?? id;
  }

  return (
    <div className="space-y-5" data-testid="card4-communication-defaults">
      <section className="space-y-1">
        <h2 className="font-display text-2xl text-[#251605]">Communication Defaults</h2>
        <p className="text-sm text-muted-foreground">
          Property-level defaults for guest, internal, and marketing communication. These do not
          override explicit templates, automation rules, or guest preferences.
        </p>
        <p className="text-xs text-muted-foreground">Last updated {lastUpdated}</p>
      </section>

      {query.isLoading ? (
        <div className="space-y-2 rounded-2xl border border-[#CCCCCC] bg-white p-6">
          {["a", "b", "c"].map((row) => (
            <div key={row} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-[#CCCCCC] bg-white p-6">
          <p className="text-sm text-destructive">Unable to load communication defaults.</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : !draft ? (
        <div className="space-y-2 rounded-2xl border border-[#CCCCCC] bg-white p-6">
          {["a", "b", "c"].map((row) => (
            <div key={row} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <section className="space-y-4 rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
            <h3 className="font-display text-xl text-[#251605]">Default Channels</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <FieldShell
                id="defaults-guest-channel"
                label="Default Guest Channel"
                required
                error={errorFor("defaultGuestChannelId") ?? undefined}
              >
                <Select
                  value={draft.defaultGuestChannelId ?? undefined}
                  disabled={!canEdit}
                  onValueChange={(value) => mark("defaultGuestChannelId", value)}
                >
                  <SelectTrigger id="defaults-guest-channel">
                    <SelectValue placeholder="Select a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {channelOptionLabel(row)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
              <FieldShell
                id="defaults-internal-channel"
                label="Default Internal Channel"
                required
                error={errorFor("defaultInternalChannelId") ?? undefined}
              >
                <Select
                  value={draft.defaultInternalChannelId ?? undefined}
                  disabled={!canEdit}
                  onValueChange={(value) => mark("defaultInternalChannelId", value)}
                >
                  <SelectTrigger id="defaults-internal-channel">
                    <SelectValue placeholder="Select a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {channelOptionLabel(row)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
              <FieldShell
                id="defaults-marketing-channel"
                label="Default Marketing Channel"
                required
                error={errorFor("defaultMarketingChannelId") ?? undefined}
              >
                <Select
                  value={draft.defaultMarketingChannelId ?? undefined}
                  disabled={!canEdit}
                  onValueChange={(value) => mark("defaultMarketingChannelId", value)}
                >
                  <SelectTrigger id="defaults-marketing-channel">
                    <SelectValue placeholder="Select a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {channelOptionLabel(row)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
            <h3 className="font-display text-xl text-[#251605]">Language & Localization</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell
                id="defaults-language"
                label="Default Language"
                required
                error={errorFor("defaultLanguage") ?? undefined}
              >
                <Select
                  value={draft.defaultLanguage}
                  disabled={!canEdit}
                  onValueChange={(value) => mark("defaultLanguage", value)}
                >
                  <SelectTrigger id="defaults-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
              <FieldShell
                id="defaults-timezone"
                label="Default Time Zone"
                required
                error={errorFor("timezone") ?? undefined}
              >
                <Select
                  value={draft.timezone}
                  disabled={!canEdit}
                  onValueChange={(value) => mark("timezone", value)}
                >
                  <SelectTrigger id="defaults-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
              <FieldShell
                id="defaults-date-format"
                label="Date Format"
                required
                error={errorFor("dateFormat") ?? undefined}
              >
                <Select
                  value={draft.dateFormat}
                  disabled={!canEdit}
                  onValueChange={(value) => mark("dateFormat", value as CommunicationDateFormat)}
                >
                  <SelectTrigger id="defaults-date-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMUNICATION_DATE_FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {COMMUNICATION_DATE_FORMAT_LABELS[format]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
              <FieldShell
                id="defaults-time-format"
                label="Time Format"
                required
                error={errorFor("timeFormat") ?? undefined}
              >
                <Select
                  value={draft.timeFormat}
                  disabled={!canEdit}
                  onValueChange={(value) => mark("timeFormat", value as CommunicationTimeFormat)}
                >
                  <SelectTrigger id="defaults-time-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMUNICATION_TIME_FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {COMMUNICATION_TIME_FORMAT_LABELS[format]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
            <h3 className="font-display text-xl text-[#251605]">Default Sender</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell
                id="defaults-sender"
                label="Default Sender"
                required
                error={errorFor("defaultSenderId") ?? undefined}
              >
                <Select
                  value={draft.defaultSenderId ?? undefined}
                  disabled={!canEdit}
                  onValueChange={(value) => mark("defaultSenderId", value)}
                >
                  <SelectTrigger id="defaults-sender">
                    <SelectValue placeholder="Select a sender" />
                  </SelectTrigger>
                  <SelectContent>
                    {senders.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {senderOptionLabel(row)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
              <FieldShell
                id="defaults-reply-to"
                label="Default Reply-To Email"
                error={errorFor("replyToEmail") ?? undefined}
              >
                <Input
                  id="defaults-reply-to"
                  type="email"
                  value={draft.replyToEmail}
                  disabled={!canEdit}
                  onChange={(event) => mark("replyToEmail", event.target.value)}
                />
              </FieldShell>
            </div>
            <FieldShell
              id="defaults-signature"
              label="Default Signature"
              error={errorFor("signature") ?? undefined}
            >
              <Textarea
                id="defaults-signature"
                rows={5}
                maxLength={4000}
                value={draft.signature}
                disabled={!canEdit}
                onChange={(event) => mark("signature", event.target.value)}
              />
            </FieldShell>
          </section>

          <section className="space-y-4 rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
            <h3 className="font-display text-xl text-[#251605]">Communication Preferences</h3>
            {(
              [
                [
                  "guestNotificationsEnabled",
                  "defaults-guest-notifications",
                  "Enable guest notifications by default",
                ],
                [
                  "internalNotificationsEnabled",
                  "defaults-internal-notifications",
                  "Enable internal notifications by default",
                ],
                [
                  "marketingCommunicationsEnabled",
                  "defaults-marketing",
                  "Enable marketing communications by default",
                ],
                [
                  "useGuestLanguage",
                  "defaults-guest-language",
                  "Use guest language for communications",
                ],
                ["attachBranding", "defaults-branding", "Attach hotel branding/logo in messages"],
              ] as const
            ).map(([key, id, label]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#CCCCCC] p-3"
              >
                <Label htmlFor={id}>{label}</Label>
                <Switch
                  id={id}
                  checked={draft[key]}
                  disabled={!canEdit}
                  onCheckedChange={(value) => mark(key, value)}
                />
              </div>
            ))}
            {inherited && !inherited.hasLogo ? (
              <p className="text-xs text-muted-foreground">
                Branding uses the property logo from Property & Business. No logo is uploaded yet.
              </p>
            ) : null}
          </section>

          <section className="space-y-4 rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
            <h3 className="font-display text-xl text-[#251605]">Other Defaults</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <FieldShell
                id="defaults-currency"
                label="Default Currency for Communication"
                required
                error={errorFor("currencyCode") ?? undefined}
              >
                <Select
                  value={draft.currencyCode}
                  disabled={!canEdit}
                  onValueChange={(value) => mark("currencyCode", value)}
                >
                  <SelectTrigger id="defaults-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((row) => (
                      <SelectItem key={row.code} value={row.code}>
                        {row.code} — {row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
              <FieldShell
                id="defaults-category"
                label="Default Template Category"
                required
                error={errorFor("templateCategory") ?? undefined}
              >
                <Select
                  value={draft.templateCategory}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    mark("templateCategory", value as CommunicationTemplateCategory)
                  }
                >
                  <SelectTrigger id="defaults-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMUNICATION_TEMPLATE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {COMMUNICATION_TEMPLATE_CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
              <FieldShell
                id="defaults-delivery-time"
                label="Default Notification Delivery Time"
                required
                help={`Uses ${draft.timezone.replace(/_/g, " ")}`}
                error={errorFor("deliveryTime") ?? undefined}
              >
                <Input
                  id="defaults-delivery-time"
                  type="time"
                  value={draft.deliveryTime}
                  disabled={!canEdit}
                  onChange={(event) => mark("deliveryTime", event.target.value.slice(0, 5))}
                />
              </FieldShell>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit}
              onClick={() => setResetOpen(true)}
            >
              Reset to System Defaults
            </Button>
          </div>

          <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
            <h3 className="font-display text-xl text-[#251605]">Current Settings Summary</h3>
            <ul className="mt-3 space-y-1 text-sm text-[#251605]">
              <li>Guest channel: {channelLabel(draft.defaultGuestChannelId)}</li>
              <li>Internal channel: {channelLabel(draft.defaultInternalChannelId)}</li>
              <li>Marketing channel: {channelLabel(draft.defaultMarketingChannelId)}</li>
              <li>Language: {languageLabel(draft.defaultLanguage)}</li>
              <li>Time zone: {draft.timezone.replace(/_/g, " ")}</li>
              <li>
                Date / time: {COMMUNICATION_DATE_FORMAT_LABELS[draft.dateFormat]} ·{" "}
                {COMMUNICATION_TIME_FORMAT_LABELS[draft.timeFormat]}
              </li>
              <li>Sender: {senderLabel(draft.defaultSenderId)}</li>
              <li>Reply-to: {draft.replyToEmail.trim() || "Not set"}</li>
              <li>
                Guest / internal / marketing notifications:{" "}
                {draft.guestNotificationsEnabled ? "On" : "Off"} /{" "}
                {draft.internalNotificationsEnabled ? "On" : "Off"} /{" "}
                {draft.marketingCommunicationsEnabled ? "On" : "Off"}
              </li>
              <li>Guest language: {draft.useGuestLanguage ? "On" : "Off"}</li>
              <li>Branding: {draft.attachBranding ? "On" : "Off"}</li>
              <li>Currency: {draft.currencyCode}</li>
              <li>
                Template category: {COMMUNICATION_TEMPLATE_CATEGORY_LABELS[draft.templateCategory]}
              </li>
              <li>Delivery time: {draft.deliveryTime}</li>
            </ul>
          </section>
        </>
      )}

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to system defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores the current form to canonical communication defaults for this property.
              Channels, templates, events, rules, and senders are not deleted. Save Draft or Save &
              Next to persist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!query.data) return;
                setDraft({ ...query.data.systemDefaults, id: draft?.id ?? query.data.defaults.id });
                setDirty(true);
                toast.message("System defaults applied. Save to persist.");
              }}
            >
              Reset form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function Card4CommunicationDefaultsGuide({
  draft,
}: {
  draft: CommunicationDefaultsDraft | null;
}) {
  return (
    <>
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
          <li>Choose default guest, internal, and marketing channels</li>
          <li>Confirm language, time zone, and formats</li>
          <li>Select the default sender</li>
          <li>Set communication preferences</li>
          <li>Save Draft or Save & Next to finish Notifications</li>
        </ol>
      </section>
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-[#251605]">Current language</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {draft
            ? (CARD1_LANGUAGES.find((row) => row.id === draft.defaultLanguage)?.label ??
              draft.defaultLanguage)
            : "Not loaded"}
        </p>
      </section>
    </>
  );
}
