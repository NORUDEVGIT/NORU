import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera, MoreHorizontal, Pencil, StickyNote } from "lucide-react";
import { toast } from "sonner";

import {
  GuestRestrictionBadges,
  StatusBadge,
  VipBadge,
} from "@/packages/pms/components/guests/guest-bits";
import { useGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  OVERVIEW_LOYALTY_COPY,
  formatGuestAddress,
  guestInitials,
} from "@/packages/pms/lib/guest-profile-overview";
import { WAVE3_KPI_NOT_AVAILABLE } from "@/packages/pms/lib/guest-profile-wave3";
import { listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import {
  createGuestPhotoUpload,
  saveGuestPhoto,
  getGuestStayOverview,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";

export function GuestProfileHeader({
  restaurantId,
  guest,
  returnCard,
  profileType,
}: {
  restaurantId: string;
  guest: GuestProfile;
  returnCard: GuestProfileCardId;
  profileType: GuestProfileTypeId;
}) {
  const actions = useGuestProfileActions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const startPhoto = useServerFn(createGuestPhotoUpload);
  const registerPhoto = useServerFn(saveGuestPhoto);
  const fetchOverview = useServerFn(getGuestStayOverview);
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const photoRef = useRef<HTMLInputElement>(null);
  const location = formatGuestAddress(guest);
  const profileNo = guest.profileNumber ?? "—";

  const overviewQuery = useQuery({
    queryKey: ["guest-stay-overview", restaurantId, guest.id],
    queryFn: () => fetchOverview({ data: { restaurantId, guestId: guest.id } }),
    retry: false,
  });
  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, guest.id],
    queryFn: () => fetchLinks({ data: { restaurantId, guestId: guest.id } }),
    retry: false,
  });
  const company = (linksQuery.data ?? []).find(
    (link) => link.role === "employer" || link.role === "bill_to",
  );

  async function onPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use a JPG, PNG or WebP photo.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Photos must be 8 MB or smaller.");
      return;
    }
    const ticket = await startPhoto({
      data: {
        restaurantId,
        guestId: guest.id,
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
        size: file.size,
      },
    });
    if (!ticket.ok) {
      toast.error(ticket.message);
      return;
    }
    const { error } = await supabase.storage
      .from("property-images")
      .uploadToSignedUrl(ticket.path, ticket.token, file);
    if (error) {
      toast.error("Photo upload failed.");
      return;
    }
    await registerPhoto({ data: { restaurantId, guestId: guest.id, path: ticket.path } });
    toast.success("Guest photo saved.");
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guest.id] });
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          void navigate({
            to: GUEST_PROFILE_DIRECTORY_PATH,
            search: guestProfileSearch({ card: returnCard, type: profileType }),
          })
        }
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Guest Profiles
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative">
            {guest.photoUrl ? (
              <img
                src={guest.photoUrl}
                alt=""
                className="size-16 rounded-full object-cover"
                data-testid="guest-overview-photo"
              />
            ) : (
              <div
                className="flex size-16 items-center justify-center rounded-full bg-muted font-display text-lg"
                data-testid="guest-overview-photo"
              >
                {guestInitials(guest.fullName)}
              </div>
            )}
            <button
              type="button"
              className="absolute -bottom-1 -right-1 rounded-full border border-border bg-card p-1"
              aria-label="Upload guest photo"
              onClick={() => photoRef.current?.click()}
            >
              <Camera className="size-3.5" />
            </button>
            <input
              ref={photoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void onPhoto(event.target.files)}
            />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl">{guest.fullName}</h1>
            <p className="text-sm text-muted-foreground">
              {profileNo}
              {guest.profileType ? ` · ${guest.profileType.name}` : " · Individual"}
              {guest.createdAt ? ` · Member since ${guest.createdAt.slice(0, 10)}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {guest.vipStatus ? <VipBadge /> : null}
              <StatusBadge status={guest.guestStatus} />
              <GuestRestrictionBadges guest={guest} />
            </div>
            {guest.notes ? (
              <p className="text-sm italic text-muted-foreground">{guest.notes}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {[guest.phone, guest.email, location].filter(Boolean).join(" · ") ||
                "No contact details"}
            </p>
            {company ? (
              <p className="text-sm text-muted-foreground" data-testid="guest-header-company">
                {company.masterName}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex flex-wrap gap-2">
            {actions.canCreateReservation ? (
              <Button asChild>
                <Link to="/restaurant/bookings/new" search={{ guestId: guest.id }}>
                  New Reservation
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={actions.openEdit}>
              <Pencil className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label="More guest actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={actions.openNote} disabled={!actions.canManage}>
                  <StickyNote className="mr-2 size-4" />
                  Add Note
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={actions.openUpload} disabled={!actions.canManage}>
                  Upload Document
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={actions.printProfile}>Print Profile</DropdownMenuItem>
                {guest.mergedIntoGuestId ? null : (
                  <DropdownMenuItem onSelect={actions.openMerge} disabled={!actions.canManage}>
                    Merge Profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={actions.toggleStatus} disabled={!actions.canManage}>
                  {guest.guestStatus === "active" ? "Deactivate Profile" : "Reactivate Profile"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div
            className="min-w-[12rem] rounded-2xl border border-border bg-card px-4 py-3"
            data-testid="guest-overview-loyalty"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Loyalty
            </p>
            <p className="mt-1 text-sm">
              {overviewQuery.data
                ? `${overviewQuery.data.stayCount} stays · ${overviewQuery.data.nightCount} nights`
                : WAVE3_KPI_NOT_AVAILABLE}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{OVERVIEW_LOYALTY_COPY}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={actions.openLoyalty}>
              View Loyalty
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
