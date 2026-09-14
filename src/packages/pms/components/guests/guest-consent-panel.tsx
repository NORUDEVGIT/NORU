import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  GUEST_CONSENT_LABELS,
  GUEST_CONSENT_STATES,
  WAVE2_MIGRATION_UNAVAILABLE,
  type GuestConsentState,
} from "@/packages/pms/lib/guest-profile-wave2";
import { saveGuestConsent, type GuestConsent } from "@/packages/pms/lib/guests.functions";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

export function GuestConsentPanel({
  restaurantId,
  guestId,
  consent,
  onSaved,
}: {
  restaurantId: string;
  guestId: string;
  consent: GuestConsent;
  onSaved: () => void;
}) {
  const { dateTime } = useRestaurantTime();
  const save = useServerFn(saveGuestConsent);
  const [dataProcessing, setDataProcessing] = useState<GuestConsentState>(
    consent.dataProcessing.state,
  );
  const [marketing, setMarketing] = useState<GuestConsentState>(consent.marketing.state);

  useEffect(() => {
    setDataProcessing(consent.dataProcessing.state);
    setMarketing(consent.marketing.state);
  }, [consent]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { restaurantId, guestId, dataProcessing, marketing } }),
    onSuccess: () => {
      toast.success("Consent recorded.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!consent.available) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-5"
        data-testid="guest-consent-panel"
      >
        <p className="font-display text-lg">Consent</p>
        <p className="mt-2 text-sm text-muted-foreground">{WAVE2_MIGRATION_UNAVAILABLE}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5" data-testid="guest-consent-panel">
      <p className="font-display text-lg">Consent</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Recorded consent is what staff saved on this profile. Property Setup defaults are guidance
        only and are not recorded consent.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ConsentField
          id="consent-data"
          label="Data processing"
          value={dataProcessing}
          recorded={consent.dataProcessing}
          guidance={
            consent.defaults ? (consent.defaults.dataProcessing ? "granted" : "refused") : null
          }
          dateTime={dateTime}
          onChange={setDataProcessing}
        />
        <ConsentField
          id="consent-marketing"
          label="Marketing"
          value={marketing}
          recorded={consent.marketing}
          guidance={consent.defaults ? (consent.defaults.marketing ? "granted" : "refused") : null}
          dateTime={dateTime}
          onChange={setMarketing}
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save consent"}
        </Button>
      </div>
    </div>
  );
}

function ConsentField({
  id,
  label,
  value,
  recorded,
  guidance,
  dateTime,
  onChange,
}: {
  id: string;
  label: string;
  value: GuestConsentState;
  recorded: GuestConsent["dataProcessing"];
  guidance: GuestConsentState | null;
  dateTime: (value: string) => string;
  onChange: (value: GuestConsentState) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as GuestConsentState)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GUEST_CONSENT_STATES.map((state) => (
            <SelectItem key={state} value={state}>
              {GUEST_CONSENT_LABELS[state]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {recorded.state === "not_asked" && guidance ? (
        <p className="text-xs text-muted-foreground">
          Setup default suggests {GUEST_CONSENT_LABELS[guidance].toLowerCase()} — not recorded until
          you save.
        </p>
      ) : recorded.recordedAt ? (
        <p className="text-xs text-muted-foreground">
          Recorded {dateTime(recorded.recordedAt)}
          {recorded.recordedByName ? ` by ${recorded.recordedByName}` : ""}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Not asked — nothing has been recorded yet.</p>
      )}
    </div>
  );
}
