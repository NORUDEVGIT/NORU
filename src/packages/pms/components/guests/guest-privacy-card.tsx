import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
  WAVE5_PRIVACY_ROLES_COPY,
  WAVE5_UNMERGE_COPY,
} from "@/packages/pms/lib/guest-profile-wave5";
import { getGuest, getGuestsAccess } from "@/packages/pms/lib/guests.functions";
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
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

function downloadJson(filename: string, jsonText: string) {
  const blob = new Blob([jsonText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function GuestPrivacyCard({
  restaurantId,
  guestId,
  accountId,
  partyName,
}: {
  restaurantId: string;
  guestId?: string | undefined;
  accountId?: string | undefined;
  partyName: string;
}) {
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();
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
    enabled: Boolean(guestId) && (accessQuery.data?.canManage ?? false),
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
    void queryClient.invalidateQueries({ queryKey: ["guest-privacy-audit", restaurantId, guestId, accountId] });
    void queryClient.invalidateQueries({ queryKey: ["guest-unmerge", restaurantId, guestId] });
    void queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["guest-accounts", restaurantId] });
    if (guestId) void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
    if (accountId) void queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId, accountId] });
  }

  const exportMutation = useMutation({
    mutationFn: () =>
      guestId
        ? exportGuest({ data: { restaurantId, guestId } })
        : exportAccount({ data: { restaurantId, accountId: accountId! } }),
    onSuccess: (result) => {
      downloadJson(result.filename, result.jsonText);
      toast.success("Export downloaded.");
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
      toast.success("Live PII has been removed from Directory.");
      setAnonymiseOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unmergeMutation = useMutation({
    mutationFn: (retiredId: string) =>
      unmerge({ data: { restaurantId, survivorId: guestId!, retiredId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success("Merge reversed.");
      else toast.message(result.reason ?? "Unmerge exception recorded.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (accessQuery.isLoading || auditQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading privacy…</p>;
  }
  if (auditQuery.isError) {
    const message = auditQuery.error instanceof Error ? auditQuery.error.message : "Privacy could not be loaded.";
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6" data-testid="guest-privacy">
        <h2 className="font-display text-xl">Admin & Privacy</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {message.includes("0054") ? WAVE5_MIGRATION_UNAVAILABLE : message}
        </p>
      </div>
    );
  }

  const anonymised = Boolean(guestId ? guestQuery.data?.guest.anonymisedAt : false);
  const audit = auditQuery.data ?? [];
  const candidates = unmergeQuery.data ?? [];

  return (
    <div className="space-y-4" data-testid="guest-privacy">
      <div>
        <h2 className="font-display text-xl">{partyName}</h2>
        <p className="mt-1 text-sm font-medium">Admin & Privacy</p>
        <p className="mt-1 text-sm text-muted-foreground">{WAVE5_PRIVACY_COPY}</p>
        <p className="mt-1 text-sm text-muted-foreground">{WAVE5_PRIVACY_ROLES_COPY}</p>
      </div>

      {guestId && guestQuery.data ? (
        <GuestConsentPanel
          restaurantId={restaurantId}
          guestId={guestId}
          consent={guestQuery.data.guest.consent}
          onSaved={refresh}
        />
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-display text-lg">Export held data</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Downloads a JSON file of the profile this property holds. The file is not stored on the server.
        </p>
        {canPrivacy ? (
          <Button
            className="mt-4"
            data-testid="guest-privacy-export"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            Export JSON
          </Button>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{WAVE5_PRIVACY_ROLES_COPY}</p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-display text-lg">Anonymise</p>
        <p className="mt-1 text-sm text-muted-foreground">{WAVE5_ANONYMISE_COPY}</p>
        {anonymised ? (
          <p className="mt-2 text-sm text-muted-foreground">This profile is already anonymised.</p>
        ) : canPrivacy ? (
          <Button
            className="mt-4"
            variant="outline"
            data-testid="guest-privacy-anonymise"
            onClick={() => setAnonymiseOpen(true)}
          >
            Anonymise profile
          </Button>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{WAVE5_PRIVACY_ROLES_COPY}</p>
        )}
      </div>

      {guestId ? (
        <div className="rounded-2xl border border-border bg-card p-5" data-testid="guest-privacy-unmerge">
          <p className="font-display text-lg">Unmerge</p>
          <p className="mt-1 text-sm text-muted-foreground">{WAVE5_UNMERGE_COPY}</p>
          {candidates.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No Wave 2 merge is recorded on this profile.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {candidates.map((row) => (
                <li key={row.retiredId} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-medium">{row.retiredName}</p>
                  {row.assessment.status === "blocked" ? (
                    <p className="mt-1 text-sm text-muted-foreground">{row.assessment.reason}</p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">This merge has a reversible ledger.</p>
                  )}
                  {canPrivacy ? (
                    <Button
                      className="mt-2"
                      variant="outline"
                      data-testid="guest-privacy-unmerge-action"
                      disabled={unmergeMutation.isPending}
                      onClick={() => unmergeMutation.mutate(row.retiredId)}
                    >
                      {row.assessment.status === "reversible"
                        ? "Unmerge"
                        : "Record why unmerge is not available"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-5" data-testid="guest-privacy-audit">
        <p className="font-display text-lg">Privacy audit</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Export, anonymise, unmerge and unmerge-exception events for this profile.
        </p>
        {audit.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No privacy actions recorded yet.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {audit.map((row) => (
              <li key={row.id} className="text-sm">
                <span className="font-medium">{row.eventType.replaceAll("_", " ")}</span>
                {row.notes ? ` — ${row.notes}` : ""}
                <span className="block text-xs text-muted-foreground">
                  {dateTime(row.createdAt)}
                  {row.actorName ? ` · ${row.actorName}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <AlertDialog open={anonymiseOpen} onOpenChange={setAnonymiseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anonymise this profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Live name, contact and identity fields are permanently removed from Directory. Stays and
              folios stay linked. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="guest-privacy-anonymise-confirm"
              onClick={() => anonymiseMutation.mutate()}
            >
              Anonymise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
