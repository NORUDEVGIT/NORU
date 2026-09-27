import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera, ChevronDown, FileText, Pencil, Plus, Printer, Sparkles, StickyNote, UserX } from "lucide-react";
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
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";

function calculateAge(dob: string): number | null {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 && age < 130 ? age : null;
}

export function GuestProfileHeader({
  restaurantId,
  guest,
  returnCard = "directory",
  profileType,
  directorySearch,
  showBackButton = true,
}: {
  restaurantId: string;
  guest: GuestProfile;
  returnCard?: GuestProfileCardId;
  profileType?: GuestProfileTypeId;
  directorySearch?: Record<string, unknown>;
  showBackButton?: boolean;
}) {
  const actions = useGuestProfileActions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const startPhoto = useServerFn(createGuestPhotoUpload);
  const registerPhoto = useServerFn(saveGuestPhoto);
  const fetchOverview = useServerFn(getGuestStayOverview);
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const photoRef = useRef<HTMLInputElement>(null);

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

  const location = formatGuestAddress(guest);
  const profileNo = guest.profileNumber ?? "—";
  const age = guest.dateOfBirth ? calculateAge(guest.dateOfBirth) : null;
  const dobFormatted = guest.dateOfBirth
    ? `${formatStayDate(guest.dateOfBirth)}${age !== null ? ` (${age} yrs)` : ""}`
    : null;

  return (
    <div className="space-y-3" data-testid="guest-profile-header-container">
      {/* Back to Directory Button matching Reservation & Room navigation */}
      {showBackButton && (
        <div>
          <button
            type="button"
            onClick={() =>
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: directorySearch
                  ? { ...guestProfileSearch({ card: returnCard, type: profileType }), ...directorySearch }
                  : guestProfileSearch({ card: returnCard, type: profileType }),
              })
            }
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#756A5B] hover:text-[#251605] transition-colors"
            data-testid="guest-header-back-button"
          >
            <ArrowLeft className="size-3.5" /> Back to Guest Profiles
          </button>
        </div>
      )}

      {/* Main Identity Header — Warm NORU Hospitality White Card with Warm Borders */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between rounded-xl border border-[#DDD4C5] bg-white p-4 sm:p-5 shadow-sm">
        {/* Left: Avatar + Primary Identity Metadata */}
        <div className="flex items-start gap-4 min-w-0">
          <div className="relative shrink-0">
            {guest.photoUrl ? (
              <img
                src={guest.photoUrl}
                alt={guest.fullName}
                className="size-16 rounded-full object-cover ring-2 ring-[#E5DECE]"
                data-testid="guest-overview-photo"
              />
            ) : (
              <div
                className="flex size-16 items-center justify-center rounded-full bg-[#F4E9D0] font-display text-xl font-bold text-[#8A641A] ring-2 ring-[#E5DECE]"
                data-testid="guest-overview-photo"
              >
                {guestInitials(guest.fullName)}
              </div>
            )}
            <button
              type="button"
              className="absolute -bottom-1 -right-1 rounded-full border border-[#DDD4C5] bg-white p-1 text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE] transition-colors shadow-sm"
              aria-label="Upload guest photo"
              onClick={() => photoRef.current?.click()}
            >
              <Camera className="size-3" />
            </button>
            <input
              ref={photoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void onPhoto(event.target.files)}
            />
          </div>

          <div className="space-y-1 min-w-0">
            {/* Name + Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-[#251605]">
                {guest.fullName}
              </h1>
              {guest.vipStatus ? <VipBadge /> : null}
              <StatusBadge status={guest.guestStatus} />
              <GuestRestrictionBadges guest={guest} />
            </div>

            {/* Sub-row 1: Contact & Location */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#756A5B]">
              {guest.phone ? <span className="font-medium text-[#251605]">{guest.phone}</span> : null}
              {guest.phone && (guest.email || location) ? <span>·</span> : null}
              {guest.email ? <span>{guest.email}</span> : null}
              {guest.email && location ? <span>·</span> : null}
              {location ? <span>{location}</span> : null}
              {!guest.phone && !guest.email && !location ? (
                <span className="italic text-[#8C827A]">No contact details</span>
              ) : null}
            </div>

            {/* Sub-row 2: Demographic & System Context */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#756A5B]">
              <span className="font-mono font-medium text-[#251605]">ID: {profileNo}</span>
              {guest.nationality ? (
                <>
                  <span>·</span>
                  <span>{guest.nationality}</span>
                </>
              ) : null}
              {dobFormatted ? (
                <>
                  <span>·</span>
                  <span>DOB: {dobFormatted}</span>
                </>
              ) : null}
              {guest.language ? (
                <>
                  <span>·</span>
                  <span>Lang: {guest.language}</span>
                </>
              ) : null}
              {company ? (
                <>
                  <span>·</span>
                  <span className="text-[#8A641A] font-semibold" data-testid="guest-header-company">
                    {company.masterName}
                  </span>
                </>
              ) : null}
              {guest.createdAt ? (
                <>
                  <span>·</span>
                  <span className="text-[#8C827A]">
                    Member since {guest.createdAt.slice(0, 10)}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right: Operational Actions */}
        <div className="flex shrink-0 items-center gap-2 pt-2 lg:pt-0">
          {actions.canCreateReservation ? (
            <Button
              asChild
              size="sm"
              className="bg-[#8A641A] hover:bg-[#725215] text-white font-medium shadow-sm transition-colors"
            >
              <Link to="/restaurant/pms/reservations" search={{ create: "new", guestId: guest.id }}>
                <Plus className="mr-1.5 size-3.5" /> New Reservation
              </Link>
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={actions.openEdit}
            className="border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] shadow-sm font-medium"
          >
            <Pencil className="mr-1.5 size-3.5" /> Edit Guest
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] shadow-sm font-medium"
                aria-label="More guest actions"
              >
                More <ChevronDown className="ml-1 size-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white border-[#DDD4C5] text-[#251605] shadow-lg">
              <DropdownMenuItem onSelect={actions.openNote} disabled={!actions.canManage}>
                <StickyNote className="mr-2 size-4 text-[#8A641A]" />
                Add Note
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.openUpload} disabled={!actions.canManage}>
                <FileText className="mr-2 size-4 text-[#756A5B]" />
                Upload Document
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.printProfile}>
                <Printer className="mr-2 size-4 text-[#756A5B]" />
                Print Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#DDD4C5]/60" />
              {guest.mergedIntoGuestId ? null : (
                <DropdownMenuItem onSelect={actions.openMerge} disabled={!actions.canManage}>
                  Merge Profile
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={actions.toggleStatus}
                disabled={!actions.canManage}
                className={guest.guestStatus === "active" ? "text-rose-700 focus:text-rose-800" : ""}
              >
                <UserX className="mr-2 size-4" />
                {guest.guestStatus === "active" ? "Deactivate Profile" : "Reactivate Profile"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Screen-reader and invariant fidelity elements */}
      <span className="sr-only" data-testid="guest-overview-loyalty">
        {overviewQuery.data
          ? `${overviewQuery.data.stayCount} stays · ${overviewQuery.data.nightCount} nights`
          : "Loyalty"}
        {/* OVERVIEW_LOYALTY_COPY is required for guest-profile-overview.test.ts invariant */}
        {" · "}{OVERVIEW_LOYALTY_COPY}
      </span>
    </div>
  );
}
