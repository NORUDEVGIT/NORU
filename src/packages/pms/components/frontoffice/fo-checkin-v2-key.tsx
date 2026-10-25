/**
 * Check-In key issuance for the live v2 review step.
 * Recording and waiver use the existing unit-scoped commands.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";

import { useAuth } from "@/core/state/auth-store";
import { getMyRestaurants } from "@/core/lib/restaurant.functions";
import {
  KEY_ACCESS_LABELS,
  KEY_ACCESS_TYPES,
  isKeyRecorded,
  type KeyAccessType,
} from "@/packages/pms/lib/fo-check-in";
import { recordCheckInKey, waiveCheckInKey } from "@/packages/pms/lib/fo-check-in.functions";
import type { CheckInUnitRead } from "@/packages/pms/lib/fo-check-in-unit.functions";
import {
  agreementStaffReference,
  formatAgreementTimestamp,
} from "@/packages/pms/lib/fo-checkin-v2-agreement-model";
import { canAuthorizeCheckInDepositWaiver } from "@/packages/pms/lib/fo-checkin-v2-payment-model";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

function keyActionFailureCopy(error: unknown, action: "record" | "waive"): string {
  const fallback =
    action === "record" ? "The key could not be recorded." : "The key waiver could not be saved.";
  const message = error instanceof Error ? error.message : fallback;
  if (
    /permission|don't have access|do not have access|not authorized|forbidden|access denied/i.test(
      message,
    )
  ) {
    return action === "waive"
      ? "An owner or manager must authorize this waiver."
      : "You don't have permission to record this key.";
  }
  if (/which room/i.test(message)) return "Choose which room this key applies to.";
  if (message.includes("\n") || /at \S+\.(ts|js)/.test(message)) return fallback;
  return message;
}

export function FoCheckInV2Key({
  restaurantId,
  reservationId,
  reservationRoomId,
  unit,
  onRefresh,
}: {
  restaurantId: string;
  reservationId: string;
  reservationRoomId: string | null;
  unit: CheckInUnitRead;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fetchRestaurants = useServerFn(getMyRestaurants);
  const recordKey = useServerFn(recordCheckInKey);
  const waiveKey = useServerFn(waiveCheckInKey);
  const [accessType, setAccessType] = useState<KeyAccessType>("physical_key");
  const [identifier, setIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const membershipQuery = useQuery({
    queryKey: ["my-restaurants", user?.id],
    queryFn: () => fetchRestaurants(),
    enabled: Boolean(user?.id),
    retry: false,
  });
  const role = membershipQuery.data?.find((row) => row.restaurantId === restaurantId)?.role ?? null;
  const canWaive = canAuthorizeCheckInDepositWaiver(role);
  const progress = unit.progress;
  const recorded = isKeyRecorded({
    accessType: progress.keyAccessType,
    identifier: progress.keyIdentifier,
  });
  const waived = progress.keyWaived;
  const settled = unit.status === "checked_in" || Boolean(progress.completedAt);
  const accessLabel =
    progress.keyAccessType && progress.keyAccessType in KEY_ACCESS_LABELS
      ? KEY_ACCESS_LABELS[progress.keyAccessType as KeyAccessType]
      : (progress.keyAccessType ?? "—");

  async function refreshReadiness() {
    await queryClient.invalidateQueries({
      queryKey: ["fo-ci-v2-readiness", restaurantId, reservationId, reservationRoomId],
    });
    onRefresh();
  }

  const recordMut = useMutation({
    mutationFn: () =>
      recordKey({
        data: {
          restaurantId,
          reservationId,
          ...(reservationRoomId ? { reservationRoomId } : {}),
          accessType,
          identifier: identifier.trim(),
        },
      }),
    onSuccess: async () => {
      setIdentifier("");
      setFormError(null);
      await refreshReadiness();
    },
    onError: (error) => setFormError(keyActionFailureCopy(error, "record")),
  });

  const waiveMut = useMutation({
    mutationFn: () =>
      waiveKey({
        data: {
          restaurantId,
          reservationId,
          ...(reservationRoomId ? { reservationRoomId } : {}),
          reason: reason.trim(),
        },
      }),
    onSuccess: async () => {
      setReason("");
      setFormError(null);
      await refreshReadiness();
    },
    onError: (error) => setFormError(keyActionFailureCopy(error, "waive")),
  });

  return (
    <section
      className="rounded-xl border border-[#E8DFD0] bg-white p-4"
      data-testid="fo-ci-v2-key"
    >
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-[#8B6914]" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-[#251605]">Key</h3>
      </div>
      <p className="mt-1 text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-key-state">
        {waived ? "Waived" : recorded ? "Recorded" : "Required"}
      </p>

      {recorded ? (
        <dl className="mt-3 space-y-1 text-sm text-[#251605]" data-testid="fo-ci-v2-key-recorded">
          <div className="flex justify-between gap-3">
            <dt className="text-[#6B5E4E]">Access type</dt>
            <dd>{accessLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#6B5E4E]">Identifier</dt>
            <dd>{progress.keyIdentifier}</dd>
          </div>
          {progress.keyIssuedAt ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B5E4E]">Recorded</dt>
              <dd>{formatAgreementTimestamp(progress.keyIssuedAt)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {waived ? (
        <div className="mt-3 text-sm text-[#251605]" data-testid="fo-ci-v2-key-waived">
          <p>{progress.keyWaiverReason?.trim() || "No reason recorded"}</p>
          <p className="mt-1 text-xs text-[#6B5E4E]">
            Authorized by {agreementStaffReference(progress.keyWaivedBy)}
            {progress.keyWaivedAt ? ` · ${formatAgreementTimestamp(progress.keyWaivedAt)}` : ""}
          </p>
        </div>
      ) : null}

      {!settled && !recorded && !waived ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-[#6B5E4E]">Key / Access Type</p>
            <div className="mt-1 flex flex-wrap gap-2" data-testid="fo-ci-v2-key-access-type">
              {KEY_ACCESS_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    accessType === type
                      ? "border-[#C89933] bg-[#C89933]/15 text-[#251605]"
                      : "border-[#DDD4C5] text-[#6B5E4E]",
                  )}
                  onClick={() => setAccessType(type)}
                >
                  {KEY_ACCESS_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-xs font-medium text-[#6B5E4E]" htmlFor="fo-ci-v2-key-identifier">
            Key Identifier
            <Input
              id="fo-ci-v2-key-identifier"
              className="mt-1 h-9"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              data-testid="fo-ci-v2-key-identifier"
            />
          </label>
          <Button
            type="button"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
            disabled={!identifier.trim() || recordMut.isPending}
            onClick={() => recordMut.mutate()}
            data-testid="fo-ci-v2-record-key"
          >
            {recordMut.isPending ? "Recording…" : "Record Key"}
          </Button>

          <div className="border-t border-[#E8DFD0] pt-3">
            <p className="text-sm font-semibold text-[#251605]">Key waiver</p>
            <p className="mt-1 text-xs text-[#6B5E4E]">
              A waiver clears only this room&apos;s key requirement.
            </p>
            {membershipQuery.isLoading ? (
              <p className="mt-2 text-sm text-[#6B5E4E]">Checking who can authorize this waiver…</p>
            ) : canWaive ? (
              <div className="mt-3 space-y-2">
                <label
                  className="block text-xs font-medium text-[#6B5E4E]"
                  htmlFor="fo-ci-v2-key-waiver-reason"
                >
                  Reason
                </label>
                <Textarea
                  id="fo-ci-v2-key-waiver-reason"
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  data-testid="fo-ci-v2-key-waiver-reason"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!reason.trim() || waiveMut.isPending}
                  onClick={() => waiveMut.mutate()}
                  data-testid="fo-ci-v2-waive-key"
                >
                  {waiveMut.isPending ? "Saving…" : "Authorize Key Waiver"}
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[#6B5E4E]" data-testid="fo-ci-v2-key-waiver-denied">
                An owner or manager must authorize a key waiver for this room.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {formError ? (
        <p className="mt-3 text-sm text-red-800" role="alert" data-testid="fo-ci-v2-key-error">
          {formError}
        </p>
      ) : null}
    </section>
  );
}
