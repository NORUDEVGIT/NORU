import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { PmsPropertySetupCard8Workspace } from "@/packages/pms/components/settings/pms-property-setup-card8-workspace";
import { activatePmsSet1 } from "@/packages/pms/lib/pms-set1-foundation.functions";
import { CARD8_ACTIVATION_HONESTY } from "@/packages/pms/lib/pms-property-setup-card8";
import { getCard8ActivationEligibility } from "@/packages/pms/lib/pms-property-setup-card8-activation.functions";
import {
  CARD8_ACTIVATION_EXPLICIT_CONFIRM,
  CARD8_ACTIVATION_NO_LIFECYCLE_SQL,
  CARD8_ACTIVATION_WRAP_ONLY,
} from "@/packages/pms/lib/pms-property-setup-card8-activation";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/lib/utils";

function Requirement({ pass, children }: { pass: boolean; children: React.ReactNode }) {
  return (
    <li className={pass ? "text-emerald-700" : "text-muted-foreground"}>
      {pass ? "✓" : "○"} {children}
    </li>
  );
}

export function Card8ActivationTab({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCard8ActivationEligibility);
  const activate = useServerFn(activatePmsSet1);
  const [confirmed, setConfirmed] = useState(false);
  const query = useQuery({
    queryKey: ["pms-card8-activation-eligibility", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const eligibility = query.data;
  const mutation = useMutation({
    mutationFn: () =>
      activate({
        data: { restaurantId, explicitConfirmation: confirmed },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.blockers.join(" "));
        return;
      }
      setConfirmed(false);
      toast.success("Property is active.");
      void queryClient.invalidateQueries({
        queryKey: ["pms-card8-activation-eligibility", restaurantId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["pms-set1-foundation", restaurantId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["pms-card8-readiness", restaurantId],
      });
      void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const live = eligibility?.canonicalLive === true;
  const eligible = eligibility?.eligible === true;
  const loading = query.isPending;

  return (
    <PmsPropertySetupCard8Workspace
      lifecycle={
        <>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Property lifecycle
          </p>
          <p className="mt-2 text-sm font-medium text-[#251605]">
            {live
              ? "Live — derived from pms_set1_live"
              : eligible
                ? "Ready to activate"
                : "Pre-live"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{CARD8_ACTIVATION_NO_LIFECYCLE_SQL}</p>
        </>
      }
      checklist={
        <section className="rounded-2xl border border-[#E6DCC8] bg-card p-5">
          <h3 className="font-display text-lg text-[#251605]">Activation requirements</h3>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            <Requirement pass={eligibility?.validation.critical === 0}>
              System Validation has no critical issues
            </Requirement>
            <Requirement pass={eligibility?.golive.ready === true}>
              Go-Live governance is ready
            </Requirement>
            <Requirement pass={Boolean(eligibility?.businessDate)}>
              Authoritative business date exists
            </Requirement>
            <Requirement pass={eligibility?.golive.businessDateConfirmed === true}>
              Business date is confirmed
            </Requirement>
            <Requirement pass={eligibility?.ownerAuthorized === true}>
              Caller is the property owner
            </Requirement>
            <Requirement pass={eligibility?.set1ChecklistReady === true}>
              Existing SET1 mandatory checklist is complete
            </Requirement>
          </ul>
        </section>
      }
      validation={
        <section className="rounded-2xl border border-[#E6DCC8] bg-card p-5">
          <h3 className="font-display text-lg text-[#251605]">System Validation</h3>
          <p
            className={cn(
              "mt-2 text-xl font-semibold",
              eligibility?.validation.critical === 0 ? "text-emerald-700" : "text-destructive",
            )}
          >
            {loading
              ? "Loading…"
              : `${eligibility?.validation.critical ?? 0} critical · ${
                  eligibility?.validation.warning ?? 0
                } warnings`}
          </p>
        </section>
      }
      summary={
        <>
          <h3 className="font-display text-lg text-[#251605]">Activation status</h3>
          <p
            className={cn(
              "mt-2 text-xl font-semibold",
              live || eligible ? "text-emerald-700" : "text-destructive",
            )}
            data-testid="pms-card8-activation-status"
          >
            {live ? "ACTIVE" : loading ? "CHECKING" : eligible ? "READY" : "BLOCKED"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{CARD8_ACTIVATION_WRAP_ONLY}</p>
        </>
      }
      status={
        <p className="text-sm text-muted-foreground">
          Canonical state: {live ? "pms_set1_live = true" : "pms_set1_live = false"}
        </p>
      }
      actions={
        <div className="space-y-3">
          {!live ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id="card8-activation-confirm"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <Label htmlFor="card8-activation-confirm" className="leading-5">
                I explicitly confirm that this property should become live.
              </Label>
            </div>
          ) : null}
          <Button
            type="button"
            disabled={!eligible || !confirmed || mutation.isPending || live}
            onClick={() => mutation.mutate()}
            data-testid="pms-card8-property-activation-action"
          >
            {live ? "Property is active" : mutation.isPending ? "Activating…" : "Activate Property"}
          </Button>
          <p className="text-xs text-muted-foreground">{CARD8_ACTIVATION_EXPLICIT_CONFIRM}</p>
        </div>
      }
    >
      <div className="space-y-4">
        <section className="rounded-2xl border border-[#E6DCC8] bg-card p-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Property</p>
          <h3 className="mt-1 font-display text-xl text-[#251605]">
            {eligibility?.property.name ?? "Loading property…"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {eligibility?.property.propertyCode
              ? `Code ${eligibility.property.propertyCode} · `
              : ""}
            Business date: {eligibility?.businessDate ?? "Missing"}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">{CARD8_ACTIVATION_HONESTY}</p>
        </section>
        {query.isError ? (
          <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
            <h3 className="font-medium text-destructive">Preflight failed</h3>
            <p className="mt-1 text-sm text-muted-foreground">{(query.error as Error).message}</p>
          </section>
        ) : null}
        {eligibility?.blockers.length ? (
          <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
            <h3 className="font-medium text-destructive">Blockers</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {eligibility.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {eligibility?.warnings.length ? (
          <section className="rounded-2xl border border-[#C89933]/40 bg-[#C89933]/5 p-5">
            <h3 className="font-medium text-[#251605]">Warnings</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {eligibility.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="rounded-2xl border border-[#E6DCC8] bg-card p-5">
          <h3 className="font-display text-lg text-[#251605]">Go-Live readiness</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Status: {eligibility?.golive.status ?? "Loading"} · Required tasks incomplete:{" "}
            {eligibility?.golive.incompleteRequiredTasks ?? "—"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Opening state{" "}
            {eligibility?.golive.openingStateConfirmed ? "confirmed" : "not confirmed"} · Future
            reservations{" "}
            {eligibility?.golive.futureReservationsConfirmed ? "confirmed" : "not confirmed"}
          </p>
        </section>
        <div className="rounded-2xl border border-dashed border-[#D8CDBB] bg-card p-5">
          <p className="text-xs text-muted-foreground">
            This is activation preflight, not an operational dashboard.
          </p>
        </div>
      </div>
    </PmsPropertySetupCard8Workspace>
  );
}
