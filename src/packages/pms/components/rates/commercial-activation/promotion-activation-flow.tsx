import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  ACTIVATION_STEPS,
  ACTIVATION_WIZARD_STALE_COPY,
  canApplyReviewedPreview,
  emptyPromotionDraft,
  isStaleActivationError,
  previewStillMatchesPromotion,
  promotionApplyPayload,
  promotionDatesCanAdvance,
  promotionDraftFingerprint,
  promotionDraftIsDirty,
  promotionPreviewPayload,
  promotionSelectCanAdvance,
  type CommercialActivationStep,
  type PromotionActivationDraft,
} from "@/packages/pms/lib/revenue/commercial-activation-workflow";
import {
  applyPromotionActivation,
  previewPromotionActivation,
} from "@/packages/pms/lib/revenue/commercial-promotion-activation.functions";
import {
  promotionActivationPreviewCanApply,
  type PromotionActivationPreview,
} from "@/packages/pms/lib/revenue/commercial-promotion-activation";
import type { PromotionWorkspaceMaster } from "@/packages/pms/lib/revenue/commercial-overview";
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";
import { revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { commercialGoldButton, commercialOutlineButton, isCommercialStaleMessage } from "../commercial/commercial-ui";
import { CommercialActivationStepper } from "./commercial-activation-stepper";
import { PromotionSelectStep } from "./activation-select-step";
import { PromotionDatesStep } from "./activation-dates-step";
import { ActivationScopeStep } from "./activation-scope-step";
import { ActivationValidation } from "./activation-validation";
import { PromotionActivationReview } from "./activation-review";

export function PromotionActivationFlow({
  restaurantId,
  canManage,
  currency,
  masters,
  roomTypes,
  ratePlans,
  initialPromotionId,
  onClose,
  onActivated,
  onDirtyChange,
}: {
  restaurantId: string;
  canManage: boolean;
  currency: string;
  masters: PromotionWorkspaceMaster[];
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  initialPromotionId?: string | null;
  onClose: () => void;
  onActivated?: (activationId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const previewFn = useServerFn(previewPromotionActivation);
  const applyFn = useServerFn(applyPromotionActivation);
  const [step, setStep] = useState<CommercialActivationStep>(initialPromotionId ? 2 : 1);
  const [draft, setDraft] = useState<PromotionActivationDraft>(() => emptyPromotionDraft(initialPromotionId));
  const [preview, setPreview] = useState<PromotionActivationPreview | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const master = masters.find((row) => row.id === draft.promotionId) ?? null;
  const roomNames = useMemo(() => new Map(roomTypes.map((row) => [row.id, row.name])), [roomTypes]);
  const planNames = useMemo(() => new Map(ratePlans.map((row) => [row.id, row.code])), [ratePlans]);
  const previewMatches = previewStillMatchesPromotion(previewFingerprint, draft);

  useEffect(() => {
    onDirtyChange(promotionDraftIsDirty(draft, initialPromotionId));
  }, [draft, initialPromotionId, onDirtyChange]);

  useEffect(() => {
    if (!initialPromotionId) return;
    const selected = masters.find((row) => row.id === initialPromotionId);
    if (selected && !promotionSelectCanAdvance(selected)) setStep(1);
  }, [initialPromotionId, masters]);

  function patchDraft(patch: Partial<PromotionActivationDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setPreview(null);
    setPreviewFingerprint(null);
    setStale(false);
    setError(null);
    if (step >= 5) setStep(4);
  }

  const previewMutation = useMutation({
    mutationFn: () => previewFn({ data: promotionPreviewPayload(restaurantId, draft) }),
    onSuccess: (result) => {
      setPreview(result);
      setPreviewFingerprint(promotionDraftFingerprint(draft));
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
      const payload = promotionApplyPayload(restaurantId, preview, draft.reason);
      if (!payload) throw new Error("Validate this activation again before activating.");
      return applyFn({ data: payload });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["commercial-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["commercial-promotions"] });
      void queryClient.invalidateQueries({ queryKey: ["promotion-activation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["promotion-performance"] });
      void queryClient.invalidateQueries({ queryKey: ["commercial-activation-history"] });
      void queryClient.invalidateQueries({ queryKey: ["commercial-change-history"] });
      toast.success("Promotion activated");
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
      if (preview && promotionActivationPreviewCanApply(preview)) setStep(5);
      return;
    }
    if (step < 6) setStep((current) => (current + 1) as CommercialActivationStep);
  }

  function goBack() {
    if (step > 1) setStep((current) => (current - 1) as CommercialActivationStep);
  }

  const canNext =
    (step === 1 && promotionSelectCanAdvance(master)) ||
    (step === 2 && promotionSelectCanAdvance(master) && promotionDatesCanAdvance(draft)) ||
    step === 3 ||
    (step === 4 && previewMatches && preview != null && promotionActivationPreviewCanApply(preview)) ||
    (step === 5 &&
      canApplyReviewedPreview(previewFingerprint, promotionDraftFingerprint(draft), Boolean(preview && promotionActivationPreviewCanApply(preview))));

  const currentLabel = ACTIVATION_STEPS.find((item) => item.id === step)?.label ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="border-b border-[#E8E1D7] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Step {step} of 6 · {currentLabel}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">Activate Promotion</h3>
        <div className="mt-2">
          <CommercialActivationStepper step={step} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!canManage ? (
          <p className="mb-3 text-xs text-[#6B4A0A]">You do not have permission to manage activations.</p>
        ) : null}
        {step === 1 ? (
          <PromotionSelectStep
            masters={masters}
            selectedId={draft.promotionId}
            currency={currency}
            onSelect={(id) => patchDraft({ promotionId: id })}
          />
        ) : null}
        {step === 2 ? (
          <PromotionDatesStep
            draft={draft}
            masterValidity={master}
            onChange={patchDraft}
          />
        ) : null}
        {step === 3 ? (
          <ActivationScopeStep
            roomTypes={roomTypes}
            ratePlans={ratePlans}
            roomTypeIds={draft.roomTypeIds}
            ratePlanIds={draft.ratePlanIds}
            eligibleRoomTypeIds={master?.roomTypeIds}
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
            {stale ? (
              <p className="text-xs text-destructive">{ACTIVATION_WIZARD_STALE_COPY}</p>
            ) : null}
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
            <PromotionActivationReview
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
            Activate Promotion
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
