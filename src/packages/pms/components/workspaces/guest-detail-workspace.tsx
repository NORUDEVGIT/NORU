import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Crown,
  FileText,
  MapPin,
  Merge,
  Pencil,
  Plus,
  Printer,
  ShieldAlert,
  SlidersHorizontal,
  StickyNote,
  UserX,
  Users,
} from "lucide-react";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestRestrictionWarn, StatusBadge, VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { GuestMergeDialog } from "@/packages/pms/components/guests/guest-merge-dialog";
import { GuestFormIdentityUpload } from "@/packages/pms/components/guests/guest-form-identity-upload";
import { GuestIndividualLinks } from "@/packages/pms/components/guests/guest-individual-links";
import { GuestConsentPanel } from "@/packages/pms/components/guests/guest-consent-panel";
import { MaskedIdNumber } from "@/packages/pms/components/guests/guest-id-mask";
import { ID_DOCUMENT_LABELS } from "@/packages/pms/lib/fo-check-in";
import { GUEST_PROFILE_DIRECTORY_PATH } from "@/packages/pms/lib/guest-profile-wave1";
import {
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_TIME_LABELS,
} from "@/packages/pms/lib/guest-profile-overview";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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
  INDIVIDUAL_LIFT_REASON_REQUIRED,
  RESTRICTION_SEVERITY_LABELS,
  guestRestrictionActive,
} from "@/packages/pms/lib/guest-profile-individual";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { cn } from "@/shared/lib/utils";

/** Kept so existing imports keep compiling; the page shows the overview only. */
export type GuestDetailSection = "overview" | "preferences";

/** Card surface shared by the cards (compact version). */
const CARD =
  "rounded-2xl border border-[#e9dfd0] bg-white shadow-[0_3px_10px_rgba(74,44,26,0.08)]";

export function GuestDetailWorkspace({
  membership,
  guestId,
  backTo = "guest-profile",
  hideHeader = false,
}: {
  membership: RestaurantMembership;
  guestId: string;
  backTo?: "guests" | "reservations" | "guest-profile";
  /** Accepted for older callers; the page has no tabs. */
  section?: GuestDetailSection;
  onSectionChange?: (section: GuestDetailSection) => void;
  hideHeader?: boolean;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const goBack = () => {
    if (backTo === "reservations") void navigate({ to: "/restaurant/pms/reservations" });
    else if (backTo === "guest-profile") void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH });
    else void navigate({ to: "/restaurant/guests" });
  };
  const queryClient = useQueryClient();

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
    invalidateGuestWorkspaceQueries(queryClient, restaurantId);
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
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
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Front Office</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access guest profiles for this property.
        </p>
      </div>
    );
  }
  if (guestQuery.isError || !guestQuery.data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          That guest could not be found for this property.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => goBack()}>
          {backTo === "guest-profile" ? "Directory" : "Back to guests"}
        </Button>
      </div>
    );
  }

  const { guest } = guestQuery.data;
  const profileNumber = (guest as unknown as { profileNumber?: string | null }).profileNumber;
  // Optional until the guest query returns it; no upcoming stays are listed without it.
  const upcomingCount = (guest as unknown as { upcomingCount?: number | null }).upcomingCount ?? 0;
  const restricted = guestRestrictionActive(guest);
  // Contact preferences saved on the create form (step 3). Read defensively.
  const prefs = guest as unknown as {
    preferredContactMethod?: keyof typeof PREFERRED_CONTACT_METHOD_LABELS | null;
    preferredContactTime?: keyof typeof PREFERRED_CONTACT_TIME_LABELS | null;
  };
  const street = [guest.addressLine1, guest.addressLine2].filter(Boolean).join(", ");
  const cityCountry = [guest.city, guest.country].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      {hideHeader || backTo === "guest-profile" ? null : (
        <button
          type="button"
          onClick={() => goBack()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {backTo === "reservations" ? "Reservations" : "Guests"}
        </button>
      )}

      {/* Title row: guest name, then Edit and More */}
      {hideHeader ? null : (
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="truncate font-brand text-2xl font-bold tracking-tight">{guest.fullName}</h1>
          <div className="flex items-center gap-2 print:hidden">
            <Button
              className="bg-[#c9a24a] font-bold text-[#2b1a10] hover:bg-[#b8923f]"
              data-testid="guest-detail-edit"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="mr-2 size-4" /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="guest-detail-more">
                  More <ChevronDown className="ml-1 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[210px]">
                <DropdownMenuItem onSelect={() => setNoteOpen(true)}>
                  <StickyNote className="mr-2 size-4 text-[#8a641a]" /> Add Note
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    document
                      .getElementById("guest-identity-card")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                >
                  <FileText className="mr-2 size-4" /> Upload Document
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => window.print()}>
                  <Printer className="mr-2 size-4" /> Print Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={vipMutation.isPending}
                  onSelect={() => vipMutation.mutate(!guest.vipStatus)}
                >
                  <Crown className="mr-2 size-4" /> {guest.vipStatus ? "Remove VIP" : "Mark as VIP"}
                </DropdownMenuItem>
                {restricted ? (
                  <DropdownMenuItem
                    data-testid="individual-restriction-lift"
                    onSelect={() => setLiftOpen(true)}
                  >
                    <ShieldAlert className="mr-2 size-4" /> Lift restriction…
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                {guest.mergedIntoGuestId ? null : (
                  <DropdownMenuItem
                    onSelect={() => {
                      setMergeRetiredId(undefined);
                      setMergeOpen(true);
                    }}
                  >
                    <Merge className="mr-2 size-4" /> Merge Profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className={guest.guestStatus === "active" ? "text-destructive focus:text-destructive" : undefined}
                  disabled={statusMutation.isPending}
                  onSelect={() =>
                    statusMutation.mutate(guest.guestStatus === "active" ? "inactive" : "active")
                  }
                >
                  <UserX className="mr-2 size-4" />
                  {guest.guestStatus === "active" ? "Deactivate Profile" : "Reactivate Profile"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
      )}

      <div className="space-y-3" data-testid="guest-detail-overview">
        <GuestRestrictionWarn guest={guest} />

        {restricted ? (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">
                Restriction
                {guest.restrictionSeverity
                  ? ` · ${RESTRICTION_SEVERITY_LABELS[guest.restrictionSeverity]}`
                  : ""}
              </p>
              <p className="text-muted-foreground">
                {guest.restrictionReason ?? "No reason recorded."}
                {guest.restrictionUntil ? ` Until ${guest.restrictionUntil}.` : ""}
              </p>
            </div>
          </div>
        ) : null}

        {/* Three cards, same layout as the company page */}
        <div className="grid gap-3 lg:grid-cols-3">
          <InfoCard icon={Users} title="Guest">
            <Row label="Profile No." value={profileNumber} />
            <Row label="Full name" value={guest.fullName} />
            <Row label="Guest type" value="Individual Guest" />
            <Row label="Nationality" value={guest.nationality} />
            <Row label="Gender" value={guest.gender ? GUEST_GENDER_LABELS[guest.gender] : null} />
            <Row label="Date of birth" value={guest.dateOfBirth} />
            <Row label="Status" value={<StatusBadge status={guest.guestStatus} />} />
            <Row label="VIP" value={guest.vipStatus ? <VipBadge /> : "Standard"} />
            <Row
              label="ID type"
              value={guest.idDocumentType ? ID_DOCUMENT_LABELS[guest.idDocumentType] : null}
            />
            <Row label="ID number" value={guest.idDocumentNumber ? <MaskedIdNumber value={guest.idDocumentNumber} /> : null} />
          </InfoCard>

          <InfoCard icon={MapPin} title="Contact & Address">
            <Row label="Mobile phone" value={guest.phone} />
            <Row label="Alternate phone" value={guest.phoneAlt} />
            <Row label="Email" value={guest.email} />
            <Row label="Alternate email" value={guest.emailAlt} />
            <Row label="Address" value={street} />
            <Row label="City / Country" value={cityCountry} />
          </InfoCard>

          <InfoCard icon={CalendarDays} title="Upcoming Reservation">
            <div className="flex min-h-[110px] flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <p>
                {upcomingCount > 0
                  ? `${upcomingCount} upcoming reservation${upcomingCount === 1 ? "" : "s"}.`
                  : "No upcoming reservations."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => void navigate({ to: "/restaurant/bookings/new" })}
              >
                <Plus className="mr-1.5 size-3.5" /> New reservation
              </Button>
            </div>
          </InfoCard>
        </div>

        {/* Cards filled in on the create form: steps 2 to 5 */}
        <div className="grid gap-3 lg:grid-cols-2">
          <InfoCard icon={FileText} title="Identity Documents" id="guest-identity-card">
            <Row
              label="ID type"
              value={guest.idDocumentType ? ID_DOCUMENT_LABELS[guest.idDocumentType] : null}
            />
            <Row
              label="ID number"
              value={guest.idDocumentNumber ? <MaskedIdNumber value={guest.idDocumentNumber} /> : null}
            />
            <Row label="ID expiry" value={guest.idDocumentExpiry} />
            <div className="py-2" data-testid="individual-information-identity-upload">
              <GuestFormIdentityUpload restaurantId={restaurantId} guestId={guestId} />
            </div>
          </InfoCard>

          <InfoCard icon={SlidersHorizontal} title="Preferences">
            <Row label="Language" value={guest.language} />
            <Row
              label="Preferred contact method"
              value={prefs.preferredContactMethod ? PREFERRED_CONTACT_METHOD_LABELS[prefs.preferredContactMethod] : null}
            />
            <Row
              label="Preferred contact time"
              value={prefs.preferredContactTime ? PREFERRED_CONTACT_TIME_LABELS[prefs.preferredContactTime] : null}
            />
          </InfoCard>

          <InfoCard icon={Briefcase} title="Business & Membership">
            <Row label="Source of business" value={guest.sourceOfBusiness} />
            <Row label="Loyalty membership" value="Not available yet" />
            <div className="py-2">
              <GuestIndividualLinks restaurantId={restaurantId} guestId={guestId} />
            </div>
          </InfoCard>

          <InfoCard icon={ClipboardList} title="Additional Information">
            <Row label="Position" value={guest.position} />
            <Row label="Department" value={guest.department} />
            <Row label="Notes" value={guest.notes} />
            <div className="border-b border-[#efe7da] py-2 text-xs">
              <p className="mb-1.5 text-muted-foreground">Emergency contacts</p>
              {guest.emergencyContacts.length === 0 ? (
                <p className="text-muted-foreground/60">None added yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {guest.emergencyContacts.map((contact) => (
                    <li key={contact.id}>
                      <p className="font-semibold">{contact.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {[contact.relationship, contact.phone, contact.email]
                          .filter(Boolean)
                          .join(" · ") || "No extra details"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="py-2">
              <GuestConsentPanel
                restaurantId={restaurantId}
                guestId={guestId}
                consent={guest.consent}
                onSaved={refresh}
              />
            </div>
          </InfoCard>
        </div>
      </div>

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

/** A compact card with a small gold icon and a title, then its rows. */
function InfoCard({
  icon: Icon,
  title,
  id,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn(CARD, "overflow-hidden")}>
      <div className="flex items-center gap-2 border-b border-[#e9dfd0] bg-[#fbfbfb] px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-full bg-[#f5ead0] text-[#c9a24a]">
          <Icon className="size-3.5" />
        </span>
        <h2 className="text-[13px] font-bold">{title}</h2>
      </div>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}

/** Label on the left, value on the right; empty values show a dash. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#efe7da] py-1.5 text-xs last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate text-right", empty ? "text-muted-foreground/60" : "font-semibold")}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}