import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Power, StickyNote } from "lucide-react";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestIndividualLinks } from "@/packages/pms/components/guests/guest-individual-links";
import {
  GuestRestrictionBadges,
  GuestRestrictionWarn,
  StatusBadge,
  VipBadge,
} from "@/packages/pms/components/guests/guest-bits";
import { GuestConsentPanel } from "@/packages/pms/components/guests/guest-consent-panel";
import { GuestMergeDialog } from "@/packages/pms/components/guests/guest-merge-dialog";
import { GuestPreferencesCard } from "@/packages/pms/components/guests/guest-preferences-card";
import { MaskedIdNumber } from "@/packages/pms/components/guests/guest-id-mask";
import { ID_DOCUMENT_LABELS } from "@/packages/pms/lib/fo-check-in";
import { GUEST_PROFILE_DIRECTORY_PATH } from "@/packages/pms/lib/guest-profile-wave1";
import { WAVE3_PROFILE_HISTORY_COPY } from "@/packages/pms/lib/guest-profile-wave3";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  addGuestNote,
  getGuest,
  getGuestsAccess,
  liftGuestRestriction,
  setGuestStatus,
  setGuestVip,
} from "@/packages/pms/lib/guests.functions";
import {
  GUEST_GENDER_LABELS,
  GUEST_TITLE_LABELS,
  INDIVIDUAL_LIFT_REASON_REQUIRED,
  RESTRICTION_SEVERITY_LABELS,
  guestRestrictionActive,
} from "@/packages/pms/lib/guest-profile-individual";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

const EVENT_LABEL: Record<string, string> = {
  created: "Guest created",
  profile_updated: "Profile updated",
  vip_changed: "VIP status changed",
  status_changed: "Guest status changed",
  preference_updated: "Preferences updated",
  note_added: "Note added",
  document_uploaded: "Document uploaded",
  document_verified: "Document staff-verified",
  document_rejected: "Document rejected",
  merged_from: "Merged from another guest",
  merged_into: "Merged into another guest",
  consent_updated: "Consent updated",
  relationship_linked: "Relationship linked",
  relationship_unlinked: "Relationship unlinked",
  comms_logged: "Communication recorded",
  comms_sent: "Email sent",
  exported: "Profile exported",
  anonymised: "Profile anonymised",
  unmerged: "Unmerged",
  unmerge_blocked: "Unmerge not available",
  restriction_set: "Restriction set",
  restriction_cleared: "Restriction cleared",
  restriction_lifted: "Restriction lifted",
};

export type GuestDetailSection = "overview" | "preferences";

export function GuestDetailWorkspace({
  membership,
  guestId,
  backTo = "guest-profile",
  section = "overview",
  onSectionChange,
}: {
  membership: RestaurantMembership;
  guestId: string;
  backTo?: "guests" | "reservations" | "guest-profile";
  /** Overview vs Preferences — kept in sync with the shell card selection. */
  section?: GuestDetailSection;
  onSectionChange?: (section: GuestDetailSection) => void;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const goBack = () => {
    if (backTo === "reservations") void navigate({ to: "/restaurant/pms/reservations" });
    else if (backTo === "guest-profile") void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH });
    else void navigate({ to: "/restaurant/guests" });
  };
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchGuest = useServerFn(getGuest);
  const toggleVip = useServerFn(setGuestVip);
  const changeStatus = useServerFn(setGuestStatus);
  const addNote = useServerFn(addGuestNote);
  const liftRestriction = useServerFn(liftGuestRestriction);

  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeRetiredId, setMergeRetiredId] = useState<string | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [liftOpen, setLiftOpen] = useState(false);
  const [liftReason, setLiftReason] = useState("");

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId } }),
    enabled: canManage,
    retry: false,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
    void queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] });
  }

  const vipMutation = useMutation({
    mutationFn: (vip: boolean) => toggleVip({ data: { restaurantId, guestId, vip } }),
    onSuccess: () => {
      toast.success("VIP status updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      changeStatus({ data: { restaurantId, guestId, status } }),
    onSuccess: () => {
      toast.success("Guest status updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteMutation = useMutation({
    mutationFn: () => addNote({ data: { restaurantId, guestId, note } }),
    onSuccess: () => {
      toast.success("Note added to history.");
      setNote("");
      setNoteOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const liftMutation = useMutation({
    mutationFn: () => {
      if (liftReason.trim() === "") throw new Error(INDIVIDUAL_LIFT_REASON_REQUIRED);
      return liftRestriction({ data: { restaurantId, guestId, reason: liftReason } });
    },
    onSuccess: () => {
      toast.success("Restriction lifted.");
      setLiftReason("");
      setLiftOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (accessQuery.isLoading || guestQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading guest…</p>;
  }
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Front Office</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access guest profiles for this property.
        </p>
      </div>
    );
  }
  if (guestQuery.isError || !guestQuery.data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          That guest could not be found for this property.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => goBack()}>
          {backTo === "guest-profile" ? "Directory" : "Back to guests"}
        </Button>
      </div>
    );
  }

  const { guest, history } = guestQuery.data;

  return (
    <div className="space-y-6">
      {backTo === "guest-profile" ? null : (
        <button
          type="button"
          onClick={() => goBack()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {backTo === "reservations" ? "Reservations" : "Guests"}
        </button>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="font-display text-2xl">{guest.fullName}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {guest.vipStatus ? <VipBadge /> : null}
            <StatusBadge status={guest.guestStatus} />
            <GuestRestrictionBadges guest={guest} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button variant="outline" onClick={() => setNoteOpen(true)}>
            <StickyNote className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Add note</span>
          </Button>
          {guest.mergedIntoGuestId ? null : (
            <Button
              variant="outline"
              onClick={() => {
                setMergeRetiredId(undefined);
                setMergeOpen(true);
              }}
            >
              Merge guests
            </Button>
          )}
          <Button
            variant="outline"
            disabled={statusMutation.isPending}
            onClick={() =>
              statusMutation.mutate(guest.guestStatus === "active" ? "inactive" : "active")
            }
          >
            <Power className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {guest.guestStatus === "active" ? "Deactivate" : "Reactivate"}
            </span>
          </Button>
        </div>
      </div>

      <Tabs
        value={historyOpen ? "history" : section}
        onValueChange={(next) => {
          if (next === "history") {
            setHistoryOpen(true);
            return;
          }
          setHistoryOpen(false);
          onSectionChange?.(next === "preferences" ? "preferences" : "overview");
        }}
      >
        <TabsList>
          <TabsTrigger value="overview" data-testid="guest-detail-tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="preferences" data-testid="guest-detail-tab-preferences">
            Preferences
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="guest-detail-tab-history">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <GuestRestrictionWarn guest={guest} />
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Basic">
              <Row label="Title" value={guest.title ? GUEST_TITLE_LABELS[guest.title] : null} />
              <Row label="Preferred name" value={guest.preferredName} />
              <Row label="Middle name" value={guest.middleName} />
              <Row label="Gender" value={guest.gender ? GUEST_GENDER_LABELS[guest.gender] : null} />
              <Row label="Language" value={guest.language} />
              <Row label="Nationality" value={guest.nationality} />
              <Row label="Date of birth" value={guest.dateOfBirth} />
            </Panel>
            <Panel title="Contact">
              <Row label="Phone" value={guest.phone} />
              <Row label="Alternate phone" value={guest.phoneAlt} />
              <Row label="Email" value={guest.email} />
              <Row label="Alternate email" value={guest.emailAlt} />
            </Panel>
            <Panel title="Address">
              <Row label="Address line 1" value={guest.addressLine1} />
              <Row label="Address line 2" value={guest.addressLine2} />
              <Row label="City" value={guest.city} />
              <Row label="Region" value={guest.region} />
              <Row label="Country" value={guest.country} />
              <Row label="Postal code" value={guest.postalCode} />
            </Panel>
            <div className="md:col-span-2">
              <Panel title="Identity">
                <Row
                  label="ID type"
                  value={guest.idDocumentType ? ID_DOCUMENT_LABELS[guest.idDocumentType] : null}
                />
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">ID number</span>
                  <MaskedIdNumber value={guest.idDocumentNumber} />
                </div>
                <Row label="ID expiry" value={guest.idDocumentExpiry} />
                <GuestRestrictionBadges guest={guest} />
                <p className="text-xs text-muted-foreground">
                  Ordinary views show the last four digits only. Staff verify on Identity &
                  Documents is not government verification.
                </p>
              </Panel>
            </div>
            <Panel title="Employment">
              <Row label="Position" value={guest.position} />
              <Row label="Department" value={guest.department} />
            </Panel>
            <Panel title="Emergency">
              {guest.emergencyContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No emergency contacts yet.</p>
              ) : (
                guest.emergencyContacts.map((contact) => (
                  <div key={contact.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[contact.relationship, contact.phone, contact.email].filter(Boolean).join(" · ") ||
                        "No extra details"}
                    </p>
                  </div>
                ))
              )}
            </Panel>
          </div>
          {guestRestrictionActive(guest) ? (
            <Panel title="Restrictions">
              <Row
                label="Severity"
                value={
                  guest.restrictionSeverity
                    ? RESTRICTION_SEVERITY_LABELS[guest.restrictionSeverity]
                    : null
                }
              />
              <Row label="Reason" value={guest.restrictionReason} />
              <Row label="Set by" value={guest.restrictionSetByName} />
              <Row label="Set at" value={guest.restrictionSetAt} />
              <Row label="Until" value={guest.restrictionUntil} />
              <Button
                variant="outline"
                data-testid="individual-restriction-lift"
                onClick={() => setLiftOpen(true)}
              >
                Lift restriction…
              </Button>
            </Panel>
          ) : null}
          <Panel title="Notes">
            <p className="text-sm text-muted-foreground">{guest.notes ?? "No notes yet."}</p>
            {guest.sourceOfBusiness ? (
              <Row label="Source of business" value={guest.sourceOfBusiness} />
            ) : null}
          </Panel>
          <GuestIndividualLinks restaurantId={restaurantId} guestId={guestId} />
          <GuestConsentPanel
            restaurantId={restaurantId}
            guestId={guestId}
            consent={guest.consent}
            onSaved={refresh}
          />
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4">
            <div>
              <p className="font-medium">VIP guest</p>
              <p className="text-sm text-muted-foreground">Flag this guest for priority service.</p>
            </div>
            <Switch
              checked={guest.vipStatus}
              disabled={vipMutation.isPending}
              onCheckedChange={(v) => vipMutation.mutate(v)}
            />
          </div>
        </TabsContent>

        <TabsContent
          value="preferences"
          className="mt-4"
          data-testid="guest-detail-preferences-panel"
        >
          <GuestPreferencesCard
            restaurantId={restaurantId}
            guestId={guestId}
            preferences={guestQuery.data.preferences}
            onSaved={refresh}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4" data-testid="guest-detail-history-panel">
          <p className="mb-3 text-sm text-muted-foreground" data-testid="guest-profile-history-copy">
            {WAVE3_PROFILE_HISTORY_COPY}
          </p>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{EVENT_LABEL[h.eventType] ?? h.eventType}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(h.createdAt)}</p>
                  </div>
                  {h.actorName ? (
                    <p className="mt-1 text-xs text-muted-foreground">by {h.actorName}</p>
                  ) : null}
                  {h.notes ? <p className="mt-2 text-sm">{h.notes}</p> : null}
                  {h.newValues ? (
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {Object.keys(h.newValues).map((key) => (
                        <li key={key}>
                          <span className="font-medium">{key.replace(/_/g, " ")}</span>:{" "}
                          {formatValue(h.previousValues?.[key])} → {formatValue(h.newValues?.[key])}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>

      <GuestFormDialog
        restaurantId={restaurantId}
        open={editOpen}
        onOpenChange={setEditOpen}
        guest={guest}
        onSaved={() => refresh()}
        onMergeRequested={(duplicateId) => {
          setMergeRetiredId(duplicateId);
          setMergeOpen(true);
        }}
      />

      <GuestMergeDialog
        restaurantId={restaurantId}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        initialSurvivorId={guest.id}
        initialRetiredId={mergeRetiredId}
        onMerged={() => {
          refresh();
          void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH });
        }}
      />

      <Dialog open={liftOpen} onOpenChange={setLiftOpen}>
        <DialogContent data-testid="individual-restriction-lift-dialog">
          <DialogHeader>
            <DialogTitle>Lift restriction</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{INDIVIDUAL_LIFT_REASON_REQUIRED}</p>
          <Textarea
            rows={3}
            data-testid="individual-restriction-lift-reason"
            value={liftReason}
            onChange={(e) => setLiftReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiftOpen(false)}>
              Cancel
            </Button>
            <Button
              data-testid="individual-restriction-lift-confirm"
              onClick={() => liftMutation.mutate()}
              disabled={liftMutation.isPending || liftReason.trim() === ""}
            >
              Confirm lift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
          </DialogHeader>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => noteMutation.mutate()}
              disabled={noteMutation.isPending || note.trim() === ""}
            >
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="font-display text-lg">{title}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );
}
