import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { GuestListingWorkspace } from "./guest-listing-workspace";
import { GuestCompanyDetailWorkspace } from "./guest-company-detail-workspace";
import { GuestGroupDetailWorkspace } from "./guest-group-detail-workspace";
import { GuestTravelAgentDetailWorkspace } from "./guest-travel-agent-detail-workspace";
import { GuestDetailWorkspace } from "./guest-detail-workspace";
import { GuestCreateModal } from "@/packages/pms/components/guests/guest-create-modal";
import { GuestCompanyCreateModal } from "@/packages/pms/components/guests/guest-company-create-modal";
import { GuestTravelAgencyCreateModal } from "@/packages/pms/components/guests/guest-travel-agency-create-modal";
import { GuestGroupCreateModal } from "@/packages/pms/components/guests/guest-group-create-modal";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";
import { GuestDetailMissing } from "@/packages/pms/components/guests/guest-detail-nav";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

// Same side gap as the listing page.
const DETAIL_CONTAINER =
  "mx-auto w-full max-w-[1600px] px-4 pt-6 pb-8 sm:px-6 sm:pt-8 lg:px-10";

// The detail server functions validate the id as a UUID; check it here so a bad
// link shows what it contained instead of a raw validation error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CreateKind = "individual" | "company" | "travel-agent" | "group";

function isCreateKind(value: unknown): value is CreateKind {
  return (
    value === "individual" ||
    value === "company" ||
    value === "travel-agent" ||
    value === "group"
  );
}

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

  // Directory page, or a create modal when ?create=... is set.
  if (!guestId) {
    const restaurantId = membership.restaurant.id;

    if (isCreateKind(create)) {
      // After a successful create, open the new profile. Dropping ?create=
      // from the URL also unmounts the modal.
      const openCreated = (id: string) =>
        void navigate({
          to: GUEST_PROFILE_DETAIL_PATH,
          params: { guestId: id },
          search: guestProfileSearch({ type: create as GuestProfileTypeId }),
        });

      // Each modal calls onOpenChange(false) and then onCancel when dismissed,
      // and the individual modal also calls onOpenChange(false) right before
      // onCreated on success. Navigation is therefore driven only by onCancel
      // (dismiss) and onCreated (success), so the two never race.
      const modalProps = {
        restaurantId,
        open: true,
        onOpenChange: () => undefined,
        onCancel: goToDirectory,
        onCreated: openCreated,
      };

      return (
        <>
          {/* Listing stays visible behind the modal */}
          <GuestListingWorkspace
            membership={membership}
            listingType={profileType as any}
            returnCard={returnCard}
            directorySearch={directorySearch}
          />
          {create === "individual" ? (
            <GuestCreateModal {...modalProps} mode="create" />
          ) : null}
          {create === "company" ? <GuestCompanyCreateModal {...modalProps} /> : null}
          {create === "travel-agent" ? (
            <GuestTravelAgencyCreateModal {...modalProps} mode="create" />
          ) : null}
          {create === "group" ? <GuestGroupCreateModal {...modalProps} mode="create" /> : null}
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