import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { GuestListingWorkspace } from "./guest-listing-workspace";
import { GuestCompanyDetailWorkspace } from "./guest-company-detail-workspace";
import { GuestGroupDetailWorkspace } from "./guest-group-detail-workspace";
import { GuestTravelAgentDetailWorkspace } from "./guest-travel-agent-detail-workspace";
import { GuestDetailWorkspace } from "./guest-detail-workspace";
import { GuestCreateWorkspace } from "./guest-create-workspace";
import { GuestCompanyCreateWorkspace } from "./guest-company-create-workspace";
import { GuestGroupCreateWorkspace } from "./guest-group-create-workspace";
import { GuestTravelAgentCreateWorkspace } from "./guest-travel-agent-create-workspace";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";
import { GuestDetailMissing } from "@/packages/pms/components/guests/guest-detail-nav";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

// Same side gap as the listing page.
const DETAIL_CONTAINER =
  "mx-auto w-full max-w-[1600px] px-4 pt-6 pb-8 sm:px-6 sm:pt-8 lg:px-10";

// The detail server functions validate the id as a UUID; check it here so a bad
// link shows what it contained instead of a raw validation error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dark brown texture tile (102x25) repeated behind the form header.
const CREATE_HEADER_TEXTURE =
  "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGYAAAAZCAYAAADDq1t2AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABaSURBVGhD7dEhAQAhAMDA5xMgyUD/fuBJcGInZzf2mucL539DDI1BNQbVGFRjUI1BNQbVGFRjUI1BNQbVGFRjUI1BNQbVGFRjUI1BNQbVGFRjUI1BNQbVGNQFoX0BgwxHIlkAAAAASUVORK5CYII=)";

// Header look shared by the create pop-ups: dark brown textured background, white text.
// The form header (breadcrumb, title, step pills) is painted from here, so the
// create files stay untouched. The texture is passed in as --create-header-texture.
const CREATE_HEADER_STYLES = [
  "[&_header]:border-b-0 [&_header]:bg-[#2a1810] [&_header]:bg-[image:var(--create-header-texture)] [&_header]:bg-repeat [&_header]:text-white",
  "[&_header_h1]:text-white [&_header_h2]:text-white",
  // Header shows only the title: hide the breadcrumb and the description line.
  "[&_header_p]:hidden [&_header_nav]:hidden",
  // Header action buttons (e.g. "Check for Duplicates") are gold. Step pills and select boxes are left alone.
  "[&_header_button:not(ol_button):not([role=combobox])]:border-[#c9a24a] [&_header_button:not(ol_button):not([role=combobox])]:bg-[#c9a24a] [&_header_button:not(ol_button):not([role=combobox])]:text-[#2b1a10] [&_header_button:not(ol_button):not([role=combobox])]:hover:bg-[#b8923f]",
  "[&_header_.text-muted-foreground]:text-[#f5ead0]",
  "[&_header_a]:text-[#f5ead0]",
  "[&_header_.text-foreground]:text-white",
  "[&_header_.bg-primary]:bg-[#c9a24a] [&_header_.text-primary-foreground]:text-[#2b1a10] [&_header_.border-primary]:border-[#c9a24a]",
  "[&_header_.border-border]:border-white/30",
  "[&_header_.text-destructive]:text-[#ffb4a8] [&_header_.border-destructive]:border-[#ffb4a8]",
].join(" ");

// Pop-up create form (individual, company, travel agency, group).
const CREATE_DIALOG_CONTENT = [
  "w-[95vw] max-w-[1100px] gap-0 overflow-hidden rounded-2xl border-0 p-0 sm:max-w-[1100px]",
  "[&>button]:z-10 [&>button]:text-white",
  CREATE_HEADER_STYLES,
].join(" ");

/**
 * Props are the ones passed by the routes:
 *  - /restaurant/pms/guests/            (directory)
 *  - /restaurant/pms/guests/$guestId    (detail)
 */
export function GuestProfileWorkspace({
  membership,
  guestId,
  returnCard,
  returnNav,
  profileType = "individual",
  create,
  section,
  directorySearch,
}: {
  membership: RestaurantMembership;
  guestId?: string;
  returnCard?: any;
  returnNav?: unknown;
  profileType?: string;
  create?: unknown;
  section?: unknown;
  directorySearch?: unknown;
}) {
  const navigate = useNavigate();
  const nav = typeof returnNav === "string" ? returnNav : undefined;
  const goToDirectory = () =>
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({ type: profileType as GuestProfileTypeId }),
    });

  // Directory page, or a create workspace when ?create=... is set.
  if (!guestId) {
    const restaurantId = membership.restaurant.id;

    // New individual guest, company, travel agency or group: pop-up form over the listing.
    if (
      create === "individual" ||
      create === "company" ||
      create === "travel-agent" ||
      create === "group"
    ) {
      return (
        <>
          {/* Listing stays visible behind the pop-up */}
          <GuestListingWorkspace
            membership={membership}
            listingType={profileType as any}
            returnCard={returnCard}
            directorySearch={directorySearch}
          />
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) goToDirectory();
            }}
          >
            <DialogContent
              data-testid="guest-create-dialog"
              className={CREATE_DIALOG_CONTENT}
              style={{ "--create-header-texture": CREATE_HEADER_TEXTURE } as React.CSSProperties}
            >
              <DialogTitle className="sr-only">
                {create === "company"
                  ? "Register New Company"
                  : create === "travel-agent"
                    ? "Register New Travel Agency"
                    : create === "group"
                      ? "Register New Group"
                      : "Create New Guest"}
              </DialogTitle>
              <div className="max-h-[90vh] overflow-y-auto">
                {create === "company" ? (
                  <GuestCompanyCreateWorkspace restaurantId={restaurantId} />
                ) : create === "travel-agent" ? (
                  <GuestTravelAgentCreateWorkspace restaurantId={restaurantId} />
                ) : create === "group" ? (
                  <GuestGroupCreateWorkspace restaurantId={restaurantId} />
                ) : (
                  <GuestCreateWorkspace restaurantId={restaurantId} />
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    return (
      <GuestListingWorkspace
        membership={membership}
        listingType={profileType as any}
        returnCard={returnCard}
        directorySearch={directorySearch}
      />
    );
  }

  if (!UUID_RE.test(guestId)) {
    return (
      <div className={DETAIL_CONTAINER}>
        <GuestDetailMissing
          testId="guest-detail-invalid-id"
          title="This link has an invalid profile ID"
          message={`The address contains "${guestId}" (type: ${profileType}), which is not a valid ID. Open the profile again from the list.`}
          backLabel="Back to Guest Profiles"
          onBack={goToDirectory}
        />
      </div>
    );
  }

  // Detail page: each profile type has its own workspace.
  let detail: React.ReactNode;
  if (profileType === "company") {
    detail = (
      <GuestCompanyDetailWorkspace membership={membership} companyId={guestId} nav={nav} />
    );
  } else if (profileType === "travel-agent" || profileType === "travel_agent") {
    detail = (
      <GuestTravelAgentDetailWorkspace membership={membership} agencyId={guestId} nav={nav} />
    );
  } else if (profileType === "group") {
    detail = <GuestGroupDetailWorkspace membership={membership} groupId={guestId} nav={nav} />;
  } else {
    detail = (
      <GuestDetailWorkspace
        key={guestId}
        membership={membership}
        guestId={guestId}
        backTo="guest-profile"
      />
    );
  }

  return (
    <div className={DETAIL_CONTAINER}>
      <button
        type="button"
        onClick={goToDirectory}
        data-testid="guest-detail-back"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Guest Profiles
      </button>
      {detail}
    </div>
  );
}