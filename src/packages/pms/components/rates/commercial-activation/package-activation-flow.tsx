import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  ACTIVATION_STEPS,
  ACTIVATION_WIZARD_STALE_COPY,
  canApplyReviewedPreview,
  emptyPackageDraft,
  isStaleActivationError,
  packageApplyPayload,
  packageDatesCanAdvance,
  packageDraftFingerprint,
  packageDraftIsDirty,
  packagePreviewPayload,
  packageSelectCanAdvance,
  previewStillMatchesPackage,
  type CommercialActivationStep,
  type PackageActivationDraft,
} from "@/packages/pms/lib/revenue/commercial-activation-workflow";
import {
  applyPackageActivation,
  previewPackageActivation,
} from "@/packages/pms/lib/revenue/commercial-package-activation.functions";
import {
  packageActivationPreviewCanApply,
  type PackageActivationPreview,
} from "@/packages/pms/lib/revenue/commercial-package-activation";
import type { PackageWorkspaceMaster } from "@/packages/pms/lib/revenue/commercial-packages-ui";
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";
import { revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { commercialGoldButton, commercialOutlineButton, isCommercialStaleMessage } from "../commercial/commercial-ui";
import { CommercialActivationStepper } from "./commercial-activation-stepper";
import { PackageSelectStep } from "./activation-select-step";
import { PackageDatesStep } from "./activation-dates-step";
import { ActivationScopeStep } from "./activation-scope-step";
import { ActivationValidation } from "./activation-validation";
import { PackageActivationReview } from "./activation-review";

export function PackageActivationFlow({
  restaurantId,
  canManage,
  currency,
  masters,
  roomTypes,
  ratePlans,
  initialPackageId,
  onClose,
  onActivated,
  onDirtyChange,
}: {
  restaurantId: string;
  canManage: boolean;
  currency: string;
  masters: PackageWorkspaceMaster[];
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  initialPackageId?: string | null;
  onClose: () => void;
  onActivated?: (activationId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const previewFn = useServerFn(previewPackageActivation);
  const applyFn = useServerFn(applyPackageActivation);
  const [step, setStep] = useState<CommercialActivationStep>(initialPackageId ? 2 : 1);
  const [draft, setDraft] = useState<PackageActivationDraft>(() => emptyPackageDraft(initialPackageId));
  const [preview, setPreview] = useState<PackageActivationPreview | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const master = masters.find((row) => row.id === draft.packageId) ?? null;
  const roomNames = useMemo(() => new Map(roomTypes.map((row) => [row.id, row.name])), [roomTypes]);
  const planNames = useMemo(() => new Map(ratePlans.map((row) => [row.id, row.code])), [ratePlans]);
  const previewMatches = previewStillMatchesPackage(previewFingerprint, draft);

  useEffect(() => {
    onDirtyChange(packageDraftIsDirty(draft, initialPackageId));
  }, [draft, initialPackageId, onDirtyChange]);

  useEffect(() => {
    if (!initialPackageId) return;
    const selected = masters.find((row) => row.id === initialPackageId);
    if (selected && !packageSelectCanAdvance(selected)) setStep(1);
  }, [initialPackageId, masters]);

  function patchDraft(patch: Partial<PackageActivationDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setPreview(null);
    setPreviewFingerprint(null);
    setStale(false);
    setError(null);
    if (step >= 5) setStep(4);
  }

  const previewMutation = useMutation({
    mutationFn: () => previewFn({ data: packagePreviewPayload(restaurantId, draft) }),
    onSuccess: (result) => {
      setPreview(result);
      setPreviewFingerprint(packageDraftFingerprint(draft));
      setStale(result.errors.includes("COMMERCIAL_ACTIVATION_STALE"));
      setError(result.errors.includes("COMMERCIAL_ACTIVATION_STALE") ? ACTIVATION_WIZARD_STALE_COPY : null);
    },
    onError: (err) => {
      const message = revenueUiError(err, "Preview failed.");
      setError(isStaleActivationError(message) ? ACTIVATION_WIZARD_STALE_COPY : message);
      setPreview(null);
      setPreviewFingerprint(null);
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!preview || !previewMatches) throw new Error("Validate this activation again before activating.");
      const payload = packageApplyPayload(restaurantId, preview, draft.reason);
      if (!payload) throw new Error("Validate this activation again before activating.");
      return applyFn({ data: payload });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["commercial-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["commercial-packages"] });
      void queryClient.invalidateQueries({ queryKey: ["package-activation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["package-performance"] });
      void queryClient.invalidateQueries({ queryKey: ["commercial-activation-history"] });
      void queryClient.invalidateQueries({ queryKey: ["commercial-change-history"] });
      toast.success("Package activated");
      onActivated?.(result.activationId);
      onClose();
    },
    onError: (err) => {
      const message = revenueUiError(err, "Apply failed.");
      if (isCommercialStaleMessage(message) || isStaleActivationError(message)) {
        setStale(true);
        setError(ACTIVATION_WIZARD_STALE_COPY);
        setPreview(null);
        setPreviewFingerprint(null);
        setStep(4);
        return;
      }
      setError(message);
    },
  });

  function goNext() {
    if (step === 3) {
      setStep(4);
      previewMutation.mutate();
      return;
    }
    if (step === 4) {
      if (!previewMatches) {
        previewMutation.mutate();
        return;
      }
      if (preview && packageActivationPreviewCanApply(preview)) setStep(5);
      return;
    }
    if (step < 6) setStep((current) => (current + 1) as CommercialActivationStep);
  }

  function goBack() {
    if (step > 1) setStep((current) => (current - 1) as CommercialActivationStep);
  }

  const canNext =
    (step === 1 && packageSelectCanAdvance(master)) ||
    (step === 2 && packageSelectCanAdvance(master) && packageDatesCanAdvance(draft)) ||
    step === 3 ||
    (step === 4 && previewMatches && preview != null && packageActivationPreviewCanApply(preview)) ||
    (step === 5 &&
      canApplyReviewedPreview(previewFingerprint, packageDraftFingerprint(draft), Boolean(preview && packageActivationPreviewCanApply(preview))));

  const currentLabel = ACTIVATION_STEPS.find((item) => item.id === step)?.label ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="border-b border-[#E8E1D7] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Step {step} of 6 · {currentLabel}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">Activate Package</h3>
        <div className="mt-2">
          <CommercialActivationStepper step={step} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!canManage ? (
          <p className="mb-3 text-xs text-[#6B4A0A]">You do not have permission to manage activations.</p>
        ) : null}
        {step === 1 ? (
          <PackageSelectStep
            masters={masters}
            selectedId={draft.packageId}
            currency={currency}
            onSelect={(id) => patchDraft({ packageId: id })}
          />
        ) : null}
        {step === 2 ? <PackageDatesStep draft={draft} onChange={patchDraft} /> : null}
        {step === 3 ? (
          <ActivationScopeStep
            roomTypes={roomTypes}
            ratePlans={ratePlans}
            roomTypeIds={draft.roomTypeIds}
            ratePlanIds={draft.ratePlanIds}
            eligibleRoomTypeIds={master?.roomTypeIds}
            eligibleRatePlanIds={master?.ratePlanIds}
            onToggleRoom={(id) =>
              patchDraft({
                roomTypeIds: draft.roomTypeIds.includes(id)
                  ? draft.roomTypeIds.filter((item) => item !== id)
                  : [...draft.roomTypeIds, id],
              })
            }
            onTogglePlan={(id) =>
              patchDraft({
                ratePlanIds: draft.ratePlanIds.includes(id)
                  ? draft.ratePlanIds.filter((item) => item !== id)
                  : [...draft.ratePlanIds, id],
              })
            }
          />
        ) : null}
        {step === 4 ? (
          <div className="space-y-3">
            {stale ? <p className="text-xs text-destructive">{ACTIVATION_WIZARD_STALE_COPY}</p> : null}
            <ActivationValidation
              loading={previewMutation.isPending}
              error={error}
              preview={previewMatches ? preview : null}
              roomNames={roomNames}
              planNames={planNames}
            />
          </div>
        ) : null}
        {step === 5 || step === 6 ? (
          preview && previewMatches ? (
            <PackageActivationReview
              preview={preview}
              reason={draft.reason}
              currency={currency}
              roomNames={roomNames}
              planNames={planNames}
              onReasonChange={(reason) => setDraft((current) => ({ ...current, reason }))}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Validate this activation again before review.</p>
          )
        ) : null}
        {error && step !== 4 ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-[#E8E1D7] px-4 py-3">
        <button type="button" className={commercialOutlineButton()} onClick={step === 1 ? onClose : goBack}>
          {step === 1 ? "Cancel" : "Back"}
        </button>
        {step > 1 ? (
          <button type="button" className={commercialOutlineButton()} onClick={onClose}>
            Cancel
          </button>
        ) : null}
        {step === 4 ? (
          <>
            <button
              type="button"
              className={commercialOutlineButton()}
              disabled={previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              Revalidate
            </button>
            <button
              type="button"
              className={commercialGoldButton(!canNext || !canManage)}
              disabled={!canManage || !canNext}
              onClick={goNext}
            >
              Continue
            </button>
          </>
        ) : null}
        {step === 5 || step === 6 ? (
          <button
            type="button"
            className={commercialGoldButton(!canNext || !canManage || applyMutation.isPending)}
            disabled={!canManage || !canNext || applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
          >
            Activate Package
          </button>
        ) : null}
        {step < 4 ? (
          <button
            type="button"
            className={commercialGoldButton(!canNext || !canManage)}
            disabled={!canManage || !canNext}
            onClick={goNext}
          >
            Next
          </button>
        ) : null}
      </div>
    </div>
  );
}
