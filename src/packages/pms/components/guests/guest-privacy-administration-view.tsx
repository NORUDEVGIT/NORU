import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, RefreshCw, ShieldCheck } from "lucide-react";

import { GuestConsentPanel } from "@/packages/pms/components/guests/guest-consent-panel";
import { Button } from "@/shared/components/ui/button";
import { WAVE5_MIGRATION_UNAVAILABLE, WAVE5_PRIVACY_COPY } from "@/packages/pms/lib/guest-profile-wave5";
import { getGuest, type GuestProfile } from "@/packages/pms/lib/guests.functions";
import {
  listGuestAccountPrivacyAudit,
  listGuestPrivacyAudit,
} from "@/packages/pms/lib/guest-privacy.functions";
import { useOptionalGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";

function formatAuditDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function GuestPrivacyAdministrationView({
  restaurantId,
  guestId,
  guest,
  accountId,
  partyName,
}: {
  restaurantId: string;
  guestId?: string | undefined;
  guest?: GuestProfile | undefined;
  accountId?: string | undefined;
  partyName: string;
}) {
  const queryClient = useQueryClient();
  const profileActions = useOptionalGuestProfileActions();
  const canEdit = profileActions?.canEdit ?? false;
  const fetchGuest = useServerFn(getGuest);
  const fetchAudit = useServerFn(listGuestPrivacyAudit);
  const fetchAccountAudit = useServerFn(listGuestAccountPrivacyAudit);

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: guestId! } }),
    enabled: Boolean(guestId && !guest),
    retry: false,
  });

  const auditQuery = useQuery({
    queryKey: ["guest-privacy-audit", restaurantId, guestId, accountId],
    queryFn: () =>
      guestId
        ? fetchAudit({ data: { restaurantId, guestId } })
        : fetchAccountAudit({ data: { restaurantId, accountId: accountId! } }),
    enabled: Boolean(guestId || accountId),
    retry: false,
  });

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["guest-privacy-audit", restaurantId, guestId, accountId],
    });
    void queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] });
    if (guestId) void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
  }

  const currentGuest = guest ?? guestQuery.data?.guest;
  const currentConsent = currentGuest?.consent;

  if (Boolean(guestId || accountId) && auditQuery.isLoading) {
    return (
      <div className="space-y-4" data-testid="guest-privacy-loading">
        <div className="h-14 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
        <div className="h-64 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
      </div>
    );
  }

  if (auditQuery.isError) {
    const message = auditQuery.error instanceof Error ? auditQuery.error.message : "Privacy could not be loaded.";
    return (
      <div
        className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-center text-xs text-[#756A5B]"
        data-testid="guest-privacy"
      >
        <h2 className="font-display text-base font-semibold text-[#251605]">Admin & Privacy</h2>
        <p className="mt-1 font-medium text-[#251605]">{partyName}</p>
        <p className="mt-2 text-[#756A5B]">
          {message.includes("0054") ? WAVE5_MIGRATION_UNAVAILABLE : message}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
          onClick={() => void auditQuery.refetch()}
        >
          <RefreshCw className="mr-1.5 size-3.5" /> Try Again
        </Button>
      </div>
    );
  }

  const auditEvents = Array.isArray(auditQuery.data) ? auditQuery.data : [];

  return (
    <div className="space-y-4" data-testid="guest-privacy">
      {/* Top Header */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
        <h2 className="font-display text-base font-semibold text-[#251605]">
          Privacy & Administration
        </h2>
        <p className="text-[11px] text-[#756A5B] mt-0.5">{WAVE5_PRIVACY_COPY}</p>
      </div>

      {/* SECTION 1: Consent Administration */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
        <div className="border-b border-[#DDD4C5] pb-2 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#251605]">
              Section 1 — Consent Preferences
            </h3>
            <p className="text-[11px] text-[#756A5B]">
              Recorded guest consents for communication channels and marketing contact.
            </p>
          </div>
          <ShieldCheck className="size-4 text-[#8A641A]" />
        </div>

        {guestId && currentConsent ? (
          <GuestConsentPanel
            restaurantId={restaurantId}
            guestId={guestId}
            consent={currentConsent}
            canEdit={canEdit}
            onSaved={() => refresh()}
          />
        ) : (
          <p className="text-xs text-[#756A5B]">
            {guestId
              ? "Consent preferences are being retrieved…"
              : "Consent preferences apply to individual guest profiles."}
          </p>
        )}
      </section>

      {/* Consent & privacy audit */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
        <div className="border-b border-[#DDD4C5] pb-2 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#251605]">
              Section 2 — Consent & Privacy Audit Trail
            </h3>
            <p className="text-[11px] text-[#756A5B]">
              Chronological log of consent and profile privacy events.
            </p>
          </div>
          <History className="size-4 text-[#8A641A]" />
        </div>

        {auditEvents.length === 0 ? (
          <p className="text-xs text-[#756A5B] py-2">No privacy audit records found.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#DDD4C5]">
            <table className="w-full text-left text-xs" data-testid="guest-privacy-audit-table">
              <thead className="bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] border-b border-[#DDD4C5]">
                <tr>
                  <th className="px-3 py-2">Date / Time</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD4C5]">
                {auditEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-[#F7F4EE]/50">
                    <td className="px-3 py-2 text-[#756A5B] whitespace-nowrap">
                      {formatAuditDateTime(evt.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-medium text-[#251605]">{evt.eventType}</td>
                    <td className="px-3 py-2 text-[#756A5B]">{evt.actorName || "System / Staff"}</td>
                    <td className="px-3 py-2 text-[#251605] max-w-[280px] truncate">
                      {evt.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
