import { AlertTriangle, Ban, CircleCheck } from "lucide-react";

import {
  ACTIVATION_OVERLAP_COPY,
  activationErrorCopy,
  activationWizardStatus,
  existingActivationIdFromErrors,
  isDuplicateActivationError,
  type ActivationWizardStatus,
} from "@/packages/pms/lib/revenue/commercial-activation-workflow";
import type { PackageActivationPreview } from "@/packages/pms/lib/revenue/commercial-package-activation";
import type { PromotionActivationPreview } from "@/packages/pms/lib/revenue/commercial-promotion-activation";
import { commercialOutlineButton } from "../commercial/commercial-ui";

export function ActivationValidation({
  loading,
  error,
  preview,
  roomNames,
  planNames,
  onViewExisting,
}: {
  loading: boolean;
  error: string | null;
  preview: PromotionActivationPreview | PackageActivationPreview | null;
  roomNames: Map<string, string>;
  planNames: Map<string, string>;
  onViewExisting?: (activationId: string) => void;
}) {
  if (loading) {
    return <p className="text-xs text-muted-foreground">Validating against the current commercial engine…</p>;
  }
  if (error && !preview) {
    return <p className="text-xs text-destructive">{error}</p>;
  }
  if (!preview) {
    return <p className="text-xs text-muted-foreground">Run validation to preview this activation.</p>;
  }

  const status = activationWizardStatus(preview.errors, preview.warnings.length);
  const duplicate = preview.errors.some((code) => isDuplicateActivationError(code));
  const existingId = existingActivationIdFromErrors(preview.errors, preview.warnings);
  const overlap = preview.warnings.some((row) => "code" in row && row.code === "PROMOTION_ACTIVATION_OVERLAP");

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-[#251605]">Validate</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Server preview is authoritative. No activation is written yet.
        </p>
      </div>
      <StatusBanner status={status} />
      <Section title="Eligibility">
        {preview.errors.includes("PROMOTION_KIND_UNSUPPORTED") ||
        preview.errors.includes("PROMOTION_INACTIVE") ||
        preview.errors.includes("PACKAGE_INACTIVE") ||
        preview.errors.includes("PROMOTION_NOT_FOUND") ||
        preview.errors.includes("PACKAGE_NOT_FOUND") ? (
          <ErrorList codes={preview.errors.filter((code) =>
            [
              "PROMOTION_KIND_UNSUPPORTED",
              "PROMOTION_INACTIVE",
              "PACKAGE_INACTIVE",
              "PROMOTION_NOT_FOUND",
              "PACKAGE_NOT_FOUND",
              "PACKAGE_PRICE_INVALID",
              "PACKAGE_CHARGE_BASIS_UNSUPPORTED",
            ].includes(code),
          )} />
        ) : (
          <p className="text-[11px] text-[#251605]">Master is eligible for Commercial Engine V1 activation.</p>
        )}
      </Section>
      <Section title="Dates">
        {preview.errors.includes("COMMERCIAL_DATES_INVALID") || preview.errors.includes("COMMERCIAL_MASTER_WINDOW_BROADEN") ? (
          <ErrorList codes={preview.errors.filter((code) =>
            ["COMMERCIAL_DATES_INVALID", "COMMERCIAL_MASTER_WINDOW_BROADEN"].includes(code),
          )} />
        ) : (
          <p className="text-[11px] text-[#251605]">Stay dates are accepted by preview.</p>
        )}
      </Section>
      <Section title="Scope">
        {preview.errors.includes("PROMOTION_SCOPE_BROADEN") ||
        preview.errors.includes("PACKAGE_SCOPE_BROADEN") ||
        preview.errors.includes("COMMERCIAL_SCOPE_WRONG_PROPERTY") ? (
          <ErrorList codes={preview.errors.filter((code) =>
            ["PROMOTION_SCOPE_BROADEN", "PACKAGE_SCOPE_BROADEN", "COMMERCIAL_SCOPE_WRONG_PROPERTY"].includes(code),
          )} />
        ) : (
          <div className="space-y-1 text-[11px] text-[#251605]">
            <p>
              Effective room scope: {preview.roomTypeScope.all
                ? "All eligible room types"
                : `${preview.roomTypeScope.effective.length} room types`}
            </p>
            {!preview.roomTypeScope.all ? (
              <p className="text-[10px] text-muted-foreground">
                {preview.roomTypeScope.effective.map((id) => roomNames.get(id) ?? id).join(", ")}
              </p>
            ) : null}
            <p>
              Effective rate-plan scope: {preview.ratePlanScope.all
                ? "All eligible rate plans"
                : `${preview.ratePlanScope.effective.length} rate plans`}
            </p>
            {!preview.ratePlanScope.all ? (
              <p className="text-[10px] text-muted-foreground">
                {preview.ratePlanScope.effective.map((id) => planNames.get(id) ?? id).join(", ")}
              </p>
            ) : null}
          </div>
        )}
      </Section>
      <Section title="Conflicts">
        {duplicate ? (
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-[11px] text-destructive">
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{activationErrorCopy(preview.errors.find((code) => isDuplicateActivationError(code)) ?? "")}</span>
            </p>
            {existingId && onViewExisting ? (
              <button type="button" className={commercialOutlineButton()} onClick={() => onViewExisting(existingId)}>
                View Existing Activation
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-[#251605]">No blocking duplicate found.</p>
        )}
      </Section>
      <Section title="Warnings">
        {overlap ? (
          <p className="flex items-start gap-2 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{ACTIVATION_OVERLAP_COPY}</span>
          </p>
        ) : (
          <p className="text-[11px] text-[#251605]">No overlap warnings.</p>
        )}
      </Section>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function StatusBanner({ status }: { status: ActivationWizardStatus }) {
  if (status === "blocked") {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
        <Ban className="h-3.5 w-3.5" aria-hidden />
        Blocked
      </p>
    );
  }
  if (status === "warnings") {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Warnings
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-800">
      <CircleCheck className="h-3.5 w-3.5" aria-hidden />
      Ready
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#E8E1D7] bg-white p-3">
      <h5 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h5>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function ErrorList({ codes }: { codes: string[] }) {
  return (
    <ul className="space-y-1">
      {codes.map((code) => (
        <li key={code} className="flex items-start gap-2 text-[11px] text-destructive">
          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{activationErrorCopy(code)}</span>
        </li>
      ))}
    </ul>
  );
}
