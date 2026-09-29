import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Download,
  FileLock2,
  GitMerge,
  History,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserX,
} from "lucide-react";

import { GuestConsentPanel } from "@/packages/pms/components/guests/guest-consent-panel";
import { Button } from "@/shared/components/ui/button";
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
import {
  WAVE5_ANONYMISE_COPY,
  WAVE5_MIGRATION_UNAVAILABLE,
  WAVE5_PRIVACY_COPY,
  WAVE5_UNMERGE_COPY,
} from "@/packages/pms/lib/guest-profile-wave5";
import { getGuest, getGuestsAccess, type GuestProfile } from "@/packages/pms/lib/guests.functions";
import {
  anonymiseGuest,
  anonymiseGuestAccount,
  exportGuestAccount,
  exportGuestProfile,
  listGuestAccountPrivacyAudit,
  listGuestPrivacyAudit,
  listGuestUnmergeCandidates,
  unmergeGuests,
} from "@/packages/pms/lib/guest-privacy.functions";
import { Badge } from "@/shared/components/ui/badge";

function downloadJson(filename: string, jsonText: string) {
  const blob = new Blob([jsonText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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
  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchGuest = useServerFn(getGuest);
  const fetchAudit = useServerFn(listGuestPrivacyAudit);
  const fetchAccountAudit = useServerFn(listGuestAccountPrivacyAudit);
  const fetchUnmerge = useServerFn(listGuestUnmergeCandidates);
  const exportGuest = useServerFn(exportGuestProfile);
  const exportAccount = useServerFn(exportGuestAccount);
  const anonymiseOne = useServerFn(anonymiseGuest);
  const anonymiseAccount = useServerFn(anonymiseGuestAccount);
  const unmerge = useServerFn(unmergeGuests);

  const [anonymiseOpen, setAnonymiseOpen] = useState(false);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canPrivacy = accessQuery.data?.canPrivacy ?? false;

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: guestId! } }),
    enabled: Boolean(guestId && !guest) && (accessQuery.data?.canManage ?? false),
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

  const unmergeQuery = useQuery({
    queryKey: ["guest-unmerge", restaurantId, guestId],
    queryFn: () => fetchUnmerge({ data: { restaurantId, guestId: guestId! } }),
    enabled: Boolean(guestId),
    retry: false,
  });

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["guest-privacy-audit", restaurantId, guestId, accountId],
    });
    void queryClient.invalidateQueries({ queryKey: ["guest-unmerge", restaurantId, guestId] });
    void queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] });
    if (guestId) void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
  }

  const exportMutation = useMutation({
    mutationFn: () =>
      guestId
        ? exportGuest({ data: { restaurantId, guestId } })
        : exportAccount({ data: { restaurantId, accountId: accountId! } }),
    onSuccess: (result) => {
      downloadJson(result.filename, result.jsonText);
      toast.success("Held data export downloaded.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const anonymiseMutation = useMutation({
    mutationFn: () =>
      guestId
        ? anonymiseOne({ data: { restaurantId, guestId } })
        : anonymiseAccount({ data: { restaurantId, accountId: accountId! } }),
    onSuccess: () => {
      toast.success("Profile anonymised. Live PII removed from Directory.");
      setAnonymiseOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unmergeMutation = useMutation({
    mutationFn: (retiredId: string) =>
      unmerge({ data: { restaurantId, survivorId: guestId!, retiredId } }),
    onSuccess: () => {
      toast.success("Guest unmerged.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const currentGuest = guest ?? guestQuery.data?.guest;
  const currentConsent = currentGuest?.consent;

  if (accessQuery.isLoading || (Boolean(guestId || accountId) && auditQuery.isLoading)) {
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
  const unmergeCandidates = Array.isArray(unmergeQuery.data) ? unmergeQuery.data : [];
  const isAnonymised =
    currentGuest?.anonymisedAt != null ||
    auditEvents.some((e) => e.eventType === "anonymised");

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

      {/* SECTION 2: Data Rights Panel */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
        <div className="border-b border-[#DDD4C5] pb-2 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#251605]">
              Section 2 — Data Rights & Portability
            </h3>
            <p className="text-[11px] text-[#756A5B]">
              Execute data subject access requests (GDPR/privacy exports) or irreversible anonymisation.
            </p>
          </div>
          <FileLock2 className="size-4 text-[#8A641A]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Export Box */}
          <div className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="font-semibold text-xs text-[#251605]">Export Held Data</span>
              <p className="text-[11px] text-[#756A5B]">
                Generate and download a complete JSON export of all held personal data, preferences, and booking references.
              </p>
            </div>
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!canPrivacy || exportMutation.isPending}
                onClick={() => exportMutation.mutate()}
                className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
              >
                <Download className="mr-1.5 size-3.5" />
                {exportMutation.isPending ? "Exporting…" : "Export Held Data"}
              </Button>
            </div>
          </div>

          {/* Danger Zone: Anonymise Box */}
          <div className="rounded-lg border border-red-200 bg-red-50/40 p-3 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-red-800 font-semibold text-xs">
                <AlertTriangle className="size-3.5 text-red-600" />
                <span>Anonymise Profile (Irreversible)</span>
              </div>
              <p className="text-[11px] text-red-700/80">
                {WAVE5_ANONYMISE_COPY}
              </p>
            </div>
            <div className="mt-3">
              {isAnonymised ? (
                <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800 text-[10px]">
                  Profile Already Anonymised
                </Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canPrivacy || anonymiseMutation.isPending}
                  onClick={() => setAnonymiseOpen(true)}
                  className="h-8 text-xs border-red-300 bg-white text-red-700 hover:bg-red-50 hover:text-red-800 font-medium"
                >
                  <UserX className="mr-1.5 size-3.5" />
                  Anonymise Profile…
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Merge Admin Panel (Individual Guest only) */}
      {guestId ? (
        <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
          <div className="border-b border-[#DDD4C5] pb-2 flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#251605]">
                Section 3 — Profile Merges & Unmerge Administration
              </h3>
              <p className="text-[11px] text-[#756A5B]">
                Review historical profile merges into this guest and revert reversible merges.
              </p>
            </div>
            <GitMerge className="size-4 text-[#8A641A]" />
          </div>

          {unmergeCandidates.length === 0 ? (
            <div className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3 text-xs text-[#756A5B]">
              <p>{WAVE5_UNMERGE_COPY}</p>
              <p className="mt-1 text-[11px] text-[#756A5B]">
                No historical merged duplicate profiles found for this guest.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#DDD4C5]">
              <table className="w-full text-left text-xs" data-testid="guest-unmerge-table">
                <thead className="bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] border-b border-[#DDD4C5]">
                  <tr>
                    <th className="px-3 py-2">Retired Guest Name</th>
                    <th className="px-3 py-2">Retired ID</th>
                    <th className="px-3 py-2">Status / Reason</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDD4C5]">
                  {unmergeCandidates.map((c) => (
                    <tr key={c.retiredId}>
                      <td className="px-3 py-2 font-medium text-[#251605]">{c.retiredName}</td>
                      <td className="px-3 py-2 font-mono text-[#756A5B] text-[11px]">{c.retiredId}</td>
                      <td className="px-3 py-2 text-[#756A5B]">
                        {c.assessment.status === "reversible" ? "Reversible ledger" : c.assessment.reason}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canPrivacy || unmergeMutation.isPending || c.assessment.status !== "reversible"}
                          onClick={() => unmergeMutation.mutate(c.retiredId)}
                          className="h-7 text-xs border-[#DDD4C5]"
                        >
                          Unmerge
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* SECTION 4: Dense Privacy Audit Table */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
        <div className="border-b border-[#DDD4C5] pb-2 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#251605]">
              Section 4 — Privacy & Consent Audit Trail
            </h3>
            <p className="text-[11px] text-[#756A5B]">
              Chronological log of consent modifications, data exports, merges, and privacy events.
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

      {/* Confirmation Dialog for Irreversible Anonymise */}
      <AlertDialog open={anonymiseOpen} onOpenChange={setAnonymiseOpen}>
        <AlertDialogContent className="border-[#DDD4C5] bg-white text-[#251605]">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <ShieldAlert className="size-5" />
              <AlertDialogTitle className="font-display text-base font-semibold text-red-800">
                Confirm Profile Anonymisation
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs text-[#756A5B] space-y-2">
              <p>
                Are you sure you want to anonymise {partyName}? This action is{" "}
                <strong className="text-red-700">permanent and irreversible</strong>.
              </p>
              <p>
                All personal identifying information (name, phone, email, document numbers) will be cleared from live active directories. Past financial and tax reservation records will be pseudonymised.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => anonymiseMutation.mutate()}
              className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              Confirm & Anonymise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
