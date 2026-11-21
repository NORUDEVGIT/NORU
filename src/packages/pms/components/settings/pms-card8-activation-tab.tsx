import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { staffFacingActivationMessage } from "@/packages/pms/components/settings/pms-card8-activation-staff-copy";
import { PmsPropertySetupCard8Workspace } from "@/packages/pms/components/settings/pms-property-setup-card8-workspace";
import { activatePmsSet1 } from "@/packages/pms/lib/pms-set1-foundation.functions";
import { getCard8ActivationEligibility } from "@/packages/pms/lib/pms-property-setup-card8-activation.functions";
import { PMS_OPERATIONAL_HOME_PATH } from "@/core/lib/pms-operational-home";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/lib/utils";
import { friendlySetupError } from "@/packages/pms/lib/setup-form-errors";

function formatBusinessDate(value: string | null | undefined) {
  if (!value) return "Missing";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function CheckRow({
  name,
  pass,
  detail,
  ready = true,
}: {
  name: string;
  pass: boolean;
  detail?: string;
  ready?: boolean;
}) {
  const status = !ready ? "Checking" : pass ? "Passed" : "Blocked";
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-[#F0EBE3] px-3 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {!ready ? (
            <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-[#C89933]" />
          ) : pass ? (
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm bg-emerald-100 text-emerald-800">
              <Check className="size-3" strokeWidth={3} aria-hidden="true" />
            </span>
          ) : (
            <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-red-700" />
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-medium",
                !ready || pass ? "text-[#5C5346]" : "text-[#251605]",
              )}
            >
              {name}
            </p>
            {detail ? <p className="mt-0.5 text-[11px] text-[#6B6458]">{detail}</p> : null}
          </div>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 text-[11px] font-semibold uppercase tracking-wide",
          !ready && "text-[#9A6A12]",
          ready && pass && "text-emerald-800",
          ready && !pass && "text-red-800",
        )}
      >
        {status}
      </span>
    </li>
  );
}

export function Card8ActivationTab({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const load = useServerFn(getCard8ActivationEligibility);
  const activate = useServerFn(activatePmsSet1);
  const [confirmed, setConfirmed] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);
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
        toast.error(result.blockers.map(staffFacingActivationMessage).join(" "));
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
      void queryClient.invalidateQueries({ queryKey: ["my-restaurants"] });
      void navigate({ to: PMS_OPERATIONAL_HOME_PATH, replace: true });
    },
    onError: (error: Error) => toast.error(friendlySetupError(error)),
  });

  const live = eligibility?.canonicalLive === true;
  const eligible = eligibility?.eligible === true;
  const loading = query.isPending;
  const activationState = live
    ? "ACTIVE"
    : loading
      ? "CHECKING"
      : eligible
        ? "READY TO ACTIVATE"
        : "BLOCKED";
  const activationTone = live || eligible ? "ready" : loading ? "neutral" : "blocked";
  const lifecycleLabel = live
    ? "Live"
    : eligible
      ? "Ready to activate"
      : loading
        ? "Checking"
        : "Pre-live";

  // Display only: hide the live-state note from red blockers once the property is already active.
  // Staff copy is mapped here; server blocker strings stay unchanged.
  const displayBlockers = live
    ? []
    : (eligibility?.blockers ?? [])
        .filter((blocker) => blocker !== "Property is already active.")
        .map(staffFacingActivationMessage);
  const warnings = (eligibility?.warnings ?? []).map(staffFacingActivationMessage);
  const canActivate = eligible && confirmed && !mutation.isPending && !live;

  return (
    <PmsPropertySetupCard8Workspace
      fullWidth
      lifecycle={
        <>
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
            Property lifecycle
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#6B6458]">
            <span>Setup</span>
            <span aria-hidden="true">→</span>
            <span>Validation</span>
            <span aria-hidden="true">→</span>
            <span>Go-Live preparation</span>
            <span aria-hidden="true">→</span>
            <span
              className={cn(
                "border-b pb-px font-medium",
                live ? "border-emerald-700 text-emerald-800" : "border-[#C89933] text-[#251605]",
              )}
            >
              {live ? "Live" : "Property Activation"}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-[#6B6458]">
            Final decision to begin live hotel operations. This does not change setup data.
          </p>
        </>
      }
      status={
        <p className="text-sm text-[#5C5346]">
          Property Activation: {live ? "Property is live" : activationState}
        </p>
      }
      actions={null}
    >
      <div className="space-y-3">
        {query.isError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {(query.error as Error).message}
          </p>
        ) : null}

        <section
          className="flex overflow-hidden rounded-md border border-[#E6E1D8] bg-white"
          data-testid="pms-card8-activation-status"
        >
          <span
            aria-hidden="true"
            className={cn(
              "w-1 shrink-0",
              activationTone === "ready" && "bg-emerald-700",
              activationTone === "blocked" && "bg-red-700",
              activationTone === "neutral" && "bg-[#C89933]",
            )}
          />
          <div className="min-w-0 flex-1 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                  Property
                </p>
                <h3 className="mt-0.5 text-base font-semibold text-[#251605]">
                  {eligibility?.property.name ?? (loading ? "Loading property…" : "Property")}
                </h3>
                <p
                  className={cn(
                    "mt-2 text-lg font-semibold",
                    activationTone === "ready" && "text-emerald-800",
                    activationTone === "blocked" && "text-red-800",
                    activationTone === "neutral" && "text-[#9A6A12]",
                  )}
                >
                  {live ? "Property is live" : activationState}
                </p>
                {live ? (
                  <p className="mt-0.5 text-[11px] text-[#6B6458]">
                    Live hotel operations are already enabled for this property.
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-[#6B6458]">
                    Activation starts live operations. It is not automatic.
                  </p>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                    Property code
                  </dt>
                  <dd className="mt-0.5 font-medium text-[#251605]">
                    {eligibility?.property.propertyCode ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                    Business date
                  </dt>
                  <dd className="mt-0.5 font-medium text-[#251605]">
                    {formatBusinessDate(eligibility?.businessDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                    Lifecycle
                  </dt>
                  <dd className="mt-0.5 font-medium text-[#251605]">{lifecycleLabel}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-[#251605]">Pre-activation checks</h3>
            <p className="mt-0.5 text-[11px] text-[#6B6458]">
              Existing activation requirements. Warnings do not appear here.
            </p>
          </div>
          <ul className="overflow-hidden rounded-md border border-[#E6E1D8] bg-white">
            <CheckRow
              name="System Validation"
              ready={Boolean(eligibility)}
              pass={eligibility?.validation.critical === 0}
              detail={
                !eligibility
                  ? "Loading…"
                  : `${eligibility.validation.critical} critical · ${eligibility.validation.warning} warnings`
              }
            />
            <CheckRow
              name="Go-Live readiness"
              ready={Boolean(eligibility)}
              pass={eligibility?.golive.ready === true}
              detail={
                !eligibility
                  ? "Loading…"
                  : `${eligibility.golive.status} · ${eligibility.golive.incompleteRequiredTasks} required tasks incomplete`
              }
            />
            <CheckRow
              name="Authoritative business date"
              ready={Boolean(eligibility)}
              pass={Boolean(eligibility?.businessDate)}
              detail={
                !eligibility ? "Loading…" : formatBusinessDate(eligibility.businessDate)
              }
            />
            <CheckRow
              name="Business date confirmed"
              ready={Boolean(eligibility)}
              pass={eligibility?.golive.businessDateConfirmed === true}
              detail={
                !eligibility
                  ? "Loading…"
                  : eligibility.golive.businessDateConfirmed
                    ? "Confirmed in Go-Live preparation"
                    : "Confirm the business date in Go-Live"
              }
            />
            <CheckRow
              name="Property owner / activation authority"
              ready={Boolean(eligibility)}
              pass={eligibility?.ownerAuthorized === true}
              detail={
                !eligibility
                  ? "Loading…"
                  : eligibility.ownerAuthorized
                    ? "Caller may activate this property"
                    : "Owner access is required to activate"
              }
            />
            <CheckRow
              name="Required property checklist"
              ready={Boolean(eligibility)}
              pass={eligibility?.set1ChecklistReady === true}
              detail={
                !eligibility
                  ? "Loading…"
                  : eligibility.set1ChecklistReady
                    ? "Mandatory property checklist is complete"
                    : "Mandatory property checklist is incomplete"
              }
            />
          </ul>
        </section>

        {!live && displayBlockers.length > 0 ? (
          <section className="overflow-hidden rounded-md border border-red-200 bg-white">
            <div className="flex items-start gap-3 px-3 py-3">
              <span aria-hidden="true" className="mt-1 h-8 w-1 shrink-0 bg-red-700" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-red-800">
                  Blockers
                </p>
                <h3 className="text-sm font-semibold text-red-800">Action required</h3>
                <p className="mt-0.5 text-[11px] text-[#6B6458]">
                  Resolve these items before activation. Warnings are listed separately and do not
                  block.
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-[#251605]">
                  {displayBlockers.map((blocker) => (
                    <li key={blocker} className="flex gap-2">
                      <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-red-700" />
                      <span>{blocker}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        {warnings.length > 0 ? (
          <Collapsible open={warningsOpen} onOpenChange={setWarningsOpen}>
            <div className="overflow-hidden rounded-md border border-[#E6E1D8] bg-white">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  aria-label={`${warningsOpen ? "Collapse" : "Expand"} warnings`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#251605]">
                      Warnings ({warnings.length})
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[#6B6458]">
                      These do not block activation.
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-[#6B6458] transition-transform",
                      warningsOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-[#F0EBE3]">
                <ul className="max-h-64 space-y-0 overflow-y-auto px-3 py-2">
                  {warnings.map((warning, index) => (
                    <li
                      key={`${index}-${warning}`}
                      className="border-b border-[#F0EBE3] py-2 text-sm text-[#5C5346] last:border-0"
                    >
                      {warning}
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ) : null}

        <section
          className={cn(
            "rounded-md border px-4 py-4",
            live
              ? "border-emerald-200 bg-emerald-50/40"
              : eligible
                ? "border-[#E6D3A8] bg-white"
                : "border-[#E6E1D8] bg-[#FBF8F2]",
          )}
        >
          {live ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800">
                Property Active
              </p>
              <h3 className="mt-1 text-base font-semibold text-emerald-900">Property is live</h3>
              <p className="mt-1 text-sm text-[#5C5346]">
                Live hotel operations are enabled. No further activation action is available here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-[#251605]">Activate property</h3>
                <p className="mt-0.5 text-[11px] text-[#6B6458]">
                  Explicit confirmation is required. Activation is never automatic.
                </p>
              </div>

              {!eligible && !loading ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {displayBlockers[0] ??
                    "Activation requirements are incomplete. Resolve blockers above before continuing."}
                </p>
              ) : null}

              <div className="flex items-start gap-2">
                <Checkbox
                  id="card8-activation-confirm"
                  checked={confirmed}
                  disabled={!eligible || mutation.isPending}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                />
                <Label
                  htmlFor="card8-activation-confirm"
                  className="text-sm leading-5 text-[#251605]"
                >
                  I confirm that this property is ready to begin live hotel operations.
                </Label>
              </div>

              <Button
                type="button"
                className="bg-[#C89933] font-medium text-[#251605] shadow-none hover:bg-[#C89933]/90"
                disabled={!canActivate}
                onClick={() => mutation.mutate()}
                data-testid="pms-card8-property-activation-action"
              >
                {mutation.isPending ? "Activating…" : "Activate Property"}
              </Button>
            </div>
          )}
        </section>
      </div>
    </PmsPropertySetupCard8Workspace>
  );
}
