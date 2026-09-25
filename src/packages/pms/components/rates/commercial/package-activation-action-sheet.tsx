import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import {
  PACKAGE_CHARGE_BASIS_LABEL,
  PACKAGE_DEACTIVATE_COPY,
  PACKAGE_STALE_COPY,
} from "@/packages/pms/lib/revenue/commercial-packages-ui";
import {
  applyPackageActivation,
  getPackageActivationDetail,
  previewPackageActivation,
} from "@/packages/pms/lib/revenue/commercial-package-activation.functions";
import type { PackageActivationPreview } from "@/packages/pms/lib/revenue/commercial-package-activation";
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";
import { revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";
import { commercialGoldButton, commercialOutlineButton, isCommercialStaleMessage } from "./commercial-ui";

export type PackageActivationAction = "edit" | "deactivate" | "reactivate";

function fieldLabel(field: string) {
  if (field === "validity") return "Stay window";
  if (field === "roomTypes") return "Room types";
  if (field === "ratePlans") return "Rate plans";
  if (field === "reason") return "Reason";
  if (field === "active") return "Active";
  return field;
}

function formatStateValue(field: string, state: Record<string, unknown> | null) {
  if (!state) return "—";
  if (field === "validity") return `${state.validFrom ?? "—"} – ${state.validTo ?? "—"}`;
  if (field === "roomTypes") {
    const ids = Array.isArray(state.roomTypeIds) ? state.roomTypeIds : [];
    return ids.length === 0 ? "Inherit master" : `${ids.length} selected`;
  }
  if (field === "ratePlans") {
    const ids = Array.isArray(state.ratePlanIds) ? state.ratePlanIds : [];
    return ids.length === 0 ? "Inherit master" : `${ids.length} selected`;
  }
  if (field === "active") return state.active ? "Active" : "Inactive";
  return String(state[field] ?? "—");
}

export function PackageActivationActionSheet({
  restaurantId,
  activationId,
  action,
  canManage,
  currency,
  roomTypes,
  ratePlans,
  onClose,
}: {
  restaurantId: string;
  activationId: string;
  action: PackageActivationAction;
  canManage: boolean;
  currency: string;
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getPackageActivationDetail);
  const previewFn = useServerFn(previewPackageActivation);
  const applyFn = useServerFn(applyPackageActivation);
  const detailQuery = useQuery({
    queryKey: ["package-activation-detail", restaurantId, activationId],
    queryFn: () => fetchDetail({ data: { restaurantId, activationId } }),
    retry: false,
  });
  const activation = detailQuery.data?.activation;
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [roomTypeIds, setRoomTypeIds] = useState<string[]>([]);
  const [ratePlanIds, setRatePlanIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<PackageActivationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activation) return;
    setValidFrom(activation.validFrom);
    setValidTo(activation.validTo);
    setRoomTypeIds([...activation.scope.roomTypeIds]);
    setRatePlanIds([...activation.scope.ratePlanIds]);
    setReason("");
    setPreview(null);
    setError(null);
  }, [activation]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["commercial-overview"] });
    void queryClient.invalidateQueries({ queryKey: ["commercial-packages"] });
    void queryClient.invalidateQueries({ queryKey: ["package-activation-detail"] });
    void queryClient.invalidateQueries({ queryKey: ["package-performance"] });
    void queryClient.invalidateQueries({ queryKey: ["commercial-activation-history"] });
  }

  function payload() {
    const operation = action === "deactivate" ? "DEACTIVATE" : "EDIT";
    return {
      restaurantId,
      operation: operation as "EDIT" | "DEACTIVATE",
      activationId,
      validFrom,
      validTo,
      roomTypeIds,
      ratePlanIds,
      reason: reason.trim() || null,
      expectedVersion: detailQuery.data?.expectedVersion,
    };
  }

  const previewMutation = useMutation({
    mutationFn: () => previewFn({ data: payload() }),
    onSuccess: (result) => {
      setPreview(result);
      setError(result.errors.includes("COMMERCIAL_ACTIVATION_STALE") ? PACKAGE_STALE_COPY : null);
    },
    onError: (err) => {
      const message = revenueUiError(err, "Preview failed.");
      setError(isCommercialStaleMessage(message) ? PACKAGE_STALE_COPY : message);
      setPreview(null);
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => applyFn({ data: payload() }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => {
      const message = revenueUiError(err, "Apply failed.");
      setError(isCommercialStaleMessage(message) ? PACKAGE_STALE_COPY : message);
      setPreview(null);
      void detailQuery.refetch();
    },
  });

  const title =
    action === "edit" ? "Edit Activation" : action === "deactivate" ? "Deactivate" : "Reactivate";
  const money = (value: number) => formatHistoryMoney(value, currency);

  function toggleId(list: string[], id: string, setList: (next: string[]) => void) {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
    setPreview(null);
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-[92vw] max-w-md p-0">
        <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
          <div className="border-b border-[#E8E1D7] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Package activation
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">{title}</h3>
            <p className="text-xs text-muted-foreground">{activation?.packageCode ?? "Loading…"}</p>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {!canManage ? (
              <p className="text-xs text-[#6B4A0A]">You do not have permission to manage activations.</p>
            ) : null}
            {action === "deactivate" ? (
              <p className="text-xs leading-5 text-muted-foreground">{PACKAGE_DEACTIVATE_COPY}</p>
            ) : null}
            {action === "reactivate" ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Reactivate revalidates dates, scope, and master state. It does not flip the active flag locally.
              </p>
            ) : null}
            {activation ? (
              <div className="space-y-1 rounded-xl border border-[#E8E1D7] bg-white p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Configured price
                </p>
                <p className="text-xs text-[#251605]">{money(activation.packagePrice)}</p>
                <p className="text-[10px] text-muted-foreground">Charge basis: {PACKAGE_CHARGE_BASIS_LABEL}</p>
                <p className="text-[10px] text-muted-foreground">
                  {activation.components.length} components. Snapshot stays unchanged on edit.
                </p>
              </div>
            ) : null}
            {action === "edit" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Stay from">
                    <Input type="date" value={validFrom} onChange={(event) => { setValidFrom(event.target.value); setPreview(null); }} />
                  </Field>
                  <Field label="Stay to">
                    <Input type="date" value={validTo} onChange={(event) => { setValidTo(event.target.value); setPreview(null); }} />
                  </Field>
                </div>
                <fieldset>
                  <legend className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Room types
                  </legend>
                  <p className="mb-1 text-[10px] text-muted-foreground">Empty inherits the master scope.</p>
                  <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border border-[#E8E1D7] bg-white p-2">
                    {roomTypes.map((room) => (
                      <label key={room.id} className="flex items-center gap-2 text-[11px] text-[#251605]">
                        <input
                          type="checkbox"
                          checked={roomTypeIds.includes(room.id)}
                          onChange={() => toggleId(roomTypeIds, room.id, setRoomTypeIds)}
                        />
                        {room.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Rate plans
                  </legend>
                  <p className="mb-1 text-[10px] text-muted-foreground">Empty inherits the master scope.</p>
                  <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border border-[#E8E1D7] bg-white p-2">
                    {ratePlans.map((plan) => (
                      <label key={plan.id} className="flex items-center gap-2 text-[11px] text-[#251605]">
                        <input
                          type="checkbox"
                          checked={ratePlanIds.includes(plan.id)}
                          onChange={() => toggleId(ratePlanIds, plan.id, setRatePlanIds)}
                        />
                        {plan.code}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : null}
            <Field label="Reason (optional)">
              <Input value={reason} onChange={(event) => { setReason(event.target.value); setPreview(null); }} />
            </Field>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {preview ? (
              <div className="space-y-2 rounded-xl border border-[#E8E1D7] bg-white p-3">
                <h4 className="text-xs font-semibold text-[#251605]">Review changes</h4>
                {preview.changedFields.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No field changes besides operational state.</p>
                ) : (
                  <ul className="space-y-1">
                    {preview.changedFields.map((field) => (
                      <li key={field} className="text-[11px] text-[#251605]">
                        <span className="font-medium">{fieldLabel(field)}</span>:{" "}
                        {formatStateValue(field, preview.before as Record<string, unknown> | null)} →{" "}
                        {formatStateValue(field, preview.after as Record<string, unknown> | null)}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Scope: rooms {preview.roomTypeScope.all ? "all / inherit" : `${preview.roomTypeScope.effective.length} selected`},
                  {" "}plans {preview.ratePlanScope.all ? "all / inherit" : `${preview.ratePlanScope.effective.length} selected`}.
                </p>
                {preview.errors.length > 0 ? (
                  <p className="text-[11px] text-destructive">{preview.errors.join(", ")}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex gap-2 border-t border-[#E8E1D7] px-4 py-3">
            <button type="button" className={commercialOutlineButton()} onClick={onClose}>
              Cancel
            </button>
            {!preview ? (
              <button
                type="button"
                className={commercialGoldButton(!canManage || detailQuery.isLoading)}
                disabled={!canManage || detailQuery.isLoading || previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
              >
                Review
              </button>
            ) : (
              <button
                type="button"
                className={commercialGoldButton(preview.errors.length > 0)}
                disabled={!canManage || preview.errors.length > 0 || applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
              >
                Confirm
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </label>
  );
}
