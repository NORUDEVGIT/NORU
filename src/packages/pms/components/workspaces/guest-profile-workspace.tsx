import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown, Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { GuestGroupTemplatesDialog } from "@/packages/pms/components/guests/guest-group-templates-dialog";
import { GuestProfileChrome } from "@/packages/pms/components/guests/guest-profile-chrome";
import {
  GUEST_WORKSPACE_SECTIONS,
  domainFromSection,
  normalizeGuestWorkspaceSearch,
  sectionFromDomain,
  resolveGuestProfileDomain,
  type GuestWorkspaceSectionId,
} from "@/packages/pms/lib/guest-profile-domains";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { getGuestWorkspaceAccess } from "@/packages/pms/lib/guest-workspace-access.functions";
import {
  invalidateGuestOperationalQueries,
  invalidateGuestWorkspaceConfigQueries,
} from "@/packages/pms/lib/guest-workspace-invalidation";
import { GuestAccountDetail } from "@/packages/pms/components/guests/guest-account-detail";
import { GuestAccountDirectory } from "@/packages/pms/components/guests/guest-account-directory";
import { GuestActivityHubCard } from "@/packages/pms/components/guests/guest-activity-hub-card";
import { GuestDirectoryOpenButton } from "@/packages/pms/components/guests/guest-directory-open-button";
import { GuestIdentityCard } from "@/packages/pms/components/guests/guest-identity-card";
import { GuestDirectoryWorkspace } from "@/packages/pms/components/workspaces/guest-directory-workspace";
import { GuestLoyaltyCard } from "@/packages/pms/components/guests/guest-loyalty-card";
import { GuestOverviewCard } from "@/packages/pms/components/guests/guest-overview-card";
import { GuestProfileActionsProvider } from "@/packages/pms/components/guests/guest-profile-actions";
import { GuestProfileHeader } from "@/packages/pms/components/guests/guest-profile-header";
import { GuestPrivacyCard } from "@/packages/pms/components/guests/guest-privacy-card";
import { GuestRelationshipsCard } from "@/packages/pms/components/guests/guest-relationships-card";
import { GuestServiceHistoryCard } from "@/packages/pms/components/guests/guest-service-history-card";
import { GuestStayHistoryCard } from "@/packages/pms/components/guests/guest-stay-history-card";
import { GuestDetailWorkspace } from "@/packages/pms/components/workspaces/guest-detail-workspace";
import { GuestListingWorkspace } from "@/packages/pms/components/workspaces/guest-listing-workspace";
import { GuestCreateWorkspace } from "@/packages/pms/components/workspaces/guest-create-workspace";
import { GuestCreateModal } from "@/packages/pms/components/guests/guest-create-modal";
import { GuestGroupCreateWorkspace } from "@/packages/pms/components/workspaces/guest-group-create-workspace";
import { GuestGroupCreateModal } from "@/packages/pms/components/guests/guest-group-create-modal";
import { GuestCompanyCreateWorkspace } from "@/packages/pms/components/workspaces/guest-company-create-workspace";
import { GuestCompanyCreateModal } from "@/packages/pms/components/guests/guest-company-create-modal";
import { GuestTravelAgencyCreateModal } from "@/packages/pms/components/guests/guest-travel-agency-create-modal";
import { GuestTravelAgentCreateWorkspace } from "@/packages/pms/components/workspaces/guest-travel-agent-create-workspace";
import { GuestCompanyDetailWorkspace } from "@/packages/pms/components/workspaces/guest-company-detail-workspace";
import { GuestTravelAgentDetailWorkspace } from "@/packages/pms/components/workspaces/guest-travel-agent-detail-workspace";
import { GuestGroupDetailWorkspace } from "@/packages/pms/components/workspaces/guest-group-detail-workspace";
import { GuestIndividualDetailWorkspace } from "@/packages/pms/components/workspaces/guest-individual-detail-workspace";
import {
  resolveGuestDetailView,
  legacyParamsForDetailView,
} from "@/packages/pms/lib/guest-detail-view";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  GUEST_PROFILE_TYPES,
  GUEST_PROFILE_WORKSPACE_NAV,
  comingInWaveLabel,
  guestProfileCard,
  guestProfileSearch,
  guestProfileWorkspaceNav,
  initialGuestProfileCard,
  isGuestRequiredProfileCard,
  showEmptyDirectoryCta,
  workspaceNavForCard,
  type GuestListingPlaceholderType,
  type GuestProfileCardId,
  type GuestProfileTypeId,
  type CompanyDetailNavId,
  type GuestProfileWorkspaceNavId,
  type TravelAgentDetailNavId,
  type GroupDetailNavId,
  type GuestProfileCreateId,
  type GuestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import { OVERVIEW_FINANCIAL_COPY } from "@/packages/pms/lib/guest-profile-overview";
import {
  GUEST_IMPORT_UNAVAILABLE,
  guestListingSection,
  operationalProfileType,
} from "@/packages/pms/lib/guest-profile-listing";
import { profileTypeToAccountType } from "@/packages/pms/lib/guest-profile-wave4";
import { getGuest } from "@/packages/pms/lib/guests.functions";
import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

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
  guestId?: string | undefined;
  /** Guest-required card to reopen after Directory-back (Spec §5.15). */
  returnCard?: GuestProfileCardId | undefined;
  returnNav?:
    | GuestProfileWorkspaceNavId
    | CompanyDetailNavId
    | TravelAgentDetailNavId
    | GroupDetailNavId
    | undefined;
  profileType?: GuestProfileTypeId | GuestListingPlaceholderType | undefined;
  create?: GuestProfileCreateId | undefined;
  section?: GuestWorkspaceSectionId | undefined;
  directorySearch?: GuestProfileSearch | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [card, setCard] = useState<GuestProfileCardId>(
    initialGuestProfileCard(Boolean(guestId), returnCard),
  );
  const [navId, setNavId] = useState<GuestProfileWorkspaceNavId | null>(() => {
    if (!guestId) return null;
    if (returnNav && GUEST_PROFILE_WORKSPACE_NAV.some((item) => item.id === returnNav)) {
      return returnNav as GuestProfileWorkspaceNavId;
    }
    const start = initialGuestProfileCard(true, returnCard);
    return GUEST_PROFILE_WORKSPACE_NAV.some((item) => item.card === start)
      ? workspaceNavForCard(start)
      : null;
  });
  const [emptyReturnCard, setEmptyReturnCard] = useState<GuestProfileCardId | undefined>();
  const selected = guestProfileCard(card);
  const restaurantId = membership.restaurant.id;
  const operationalType = operationalProfileType(guestListingSection(profileType));
  const accountType = profileTypeToAccountType(operationalType);
  const isAccount = accountType !== null;

  const searchCanonical = normalizeGuestWorkspaceSearch({
    section,
    type: profileType,
    card: returnCard,
    nav: returnNav,
    create,
  });
  const activeSection: GuestWorkspaceSectionId = searchCanonical.section ?? "guests";

  const fetchConfig = useServerFn(getGuestWorkspaceConfig);
  const configQuery = useQuery({
    queryKey: ["guest-workspace-config", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    staleTime: 60_000,
  });

  const fetchAccess = useServerFn(getGuestWorkspaceAccess);
  const accessQuery = useQuery({
    queryKey: ["guest-workspace-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    staleTime: 60_000,
  });

  const fetchGuest = useServerFn(getGuest);
  const fetchAccount = useServerFn(getGuestAccount);
  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: guestId! } }),
    enabled: Boolean(guestId) && !isAccount,
    retry: false,
  });
  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, guestId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: guestId! } }),
    enabled:
      Boolean(guestId) &&
      isAccount &&
      (card === "loyalty" ||
        card === "relationships" ||
        card === "notes-comms" ||
        card === "admin-privacy"),
    retry: false,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId),
        invalidateGuestOperationalQueries(queryClient, restaurantId),
        configQuery.refetch(),
        accessQuery.refetch(),
        guestQuery.refetch(),
        accountQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  function selectSection(nextSection: GuestWorkspaceSectionId) {
    const domain = domainFromSection(nextSection);
    setCard("directory");
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({
        section: nextSection,
        type: domain === "individual" ? "individual" : domain,
      }),
    });
  }

  function selectType(next: GuestProfileTypeId) {
    const live = GUEST_PROFILE_TYPES.find((type) => type.id === next)?.live;
    if (!live) return;
    const sectionId = sectionFromDomain(resolveGuestProfileDomain(next));
    setCard("directory");
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({ type: next, section: sectionId }),
    });
  }

  function selectCard(next: GuestProfileCardId, nextNav?: GuestProfileWorkspaceNavId) {
    if (next === "directory" && guestId) {
      void navigate({
        to: GUEST_PROFILE_DIRECTORY_PATH,
        search: guestProfileSearch({ card, nav: navId ?? undefined, type: profileType }),
      });
      return;
    }
    const resolvedNav =
      nextNav ??
      (GUEST_PROFILE_WORKSPACE_NAV.some((item) => item.card === next)
        ? workspaceNavForCard(next)
        : undefined);
    setCard(next);
    setNavId(resolvedNav ?? null);
    if (guestId && isGuestRequiredProfileCard(next)) {
      void navigate({
        to: GUEST_PROFILE_DETAIL_PATH,
        params: { guestId },
        search: guestProfileSearch({
          card: next,
          nav: resolvedNav,
          type: profileType,
        }),
      });
    }
  }

  function selectNav(next: GuestProfileWorkspaceNavId) {
    const item = guestProfileWorkspaceNav(next);
    selectCard(item.card, next);
  }

  const detailSection = card === "preferences" ? "preferences" : "overview";
  const emptyDirectoryFrom = showEmptyDirectoryCta(Boolean(guestId), card) ? card : undefined;
  const partyName = isAccount
    ? (accountQuery.data?.name ?? "")
    : (guestQuery.data?.guest.fullName ?? "");

  function openDirectoryFromEmpty() {
    if (!emptyDirectoryFrom) return;
    setEmptyReturnCard(emptyDirectoryFrom);
    setCard("directory");
  }

  const typeSwitcher = (
    <div
      className="flex w-full gap-2 overflow-x-auto pb-1"
      data-testid="guest-profile-type-switcher"
      role="tablist"
      aria-label="Profile type"
    >
      {GUEST_PROFILE_TYPES.map((type) => {
        const active = type.id === profileType;
        return (
          <button
            key={type.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!type.live}
            data-testid={`guest-profile-type-${type.id}`}
            onClick={() => selectType(type.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
              type.live && active
                ? "border-primary bg-primary text-primary-foreground"
                : type.live
                  ? "border-border bg-card text-foreground hover:border-primary/50"
                  : "cursor-not-allowed border-dashed border-border text-muted-foreground",
            )}
            title={type.live ? `${type.title} profiles are LIVE` : `${type.title} is not LIVE`}
          >
            {type.title}
            {type.live ? null : (
              <span className="ml-2 text-[11px] uppercase tracking-wide">
                not LIVE · Wave {type.wave}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const sectionDef =
    GUEST_WORKSPACE_SECTIONS.find((s) => s.id === activeSection) ?? GUEST_WORKSPACE_SECTIONS[0];
  const typeConfig = configQuery.data?.types.find((t) => t.domain === sectionDef.domain);
  const isTypeInactive = typeConfig ? !typeConfig.active : false;
  const canCreate = accessQuery.data?.canCreate === true && !isTypeInactive;

  const canCreateDomain = (domain: string) => {
    if (accessQuery.data?.canCreate !== true) return false;
    const cfg = configQuery.data?.types.find((t) => t.domain === domain);
    return cfg ? cfg.active : true;
  };

  const canCreateIndividual = canCreateDomain("individual");
  const canCreateCompany = canCreateDomain("company");
  const canCreateAgency = canCreateDomain("travel-agent");
  const canCreateGroup = canCreateDomain("group");

  const [headerTemplateApplyOpen, setHeaderTemplateApplyOpen] = useState(false);
  const [headerTemplateManageOpen, setHeaderTemplateManageOpen] = useState(false);

  const activeCreateTitle =
    sectionDef.domain === "individual"
      ? "New Guest"
      : sectionDef.domain === "company"
        ? "New Company"
        : sectionDef.domain === "travel-agent"
          ? "New Travel Agency"
          : "New Group";

  const primaryAction =
    !guestId && !create ? (
      <div className="flex items-center gap-1.5" data-testid="guest-header-actions">
        <div className="inline-flex rounded-lg shadow-sm">
          <Button
            type="button"
            size="sm"
            disabled={!canCreate}
            onClick={() => {
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: guestProfileSearch({
                  section: activeSection,
                  type: sectionDef.domain,
                  create: sectionDef.createType,
                }),
              });
            }}
            className="h-8 gap-1.5 rounded-r-none bg-[#251605] px-3 text-xs font-semibold text-[#FBF9F5] hover:bg-[#3D2C1D] disabled:opacity-50"
            data-testid="guest-create-action-btn"
            title={
              isTypeInactive
                ? `${sectionDef.title} is inactive in Property Setup`
                : `Create ${activeCreateTitle}`
            }
          >
            <Plus className="size-3.5" />
            <span>{activeCreateTitle}</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-l-none border-l border-white/20 bg-[#251605] px-1.5 text-[#FBF9F5] hover:bg-[#3D2C1D] disabled:opacity-50"
                aria-label="Create profile options"
                data-testid="guest-create-dropdown-trigger"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 text-xs">
              <DropdownMenuItem
                disabled={!canCreateIndividual}
                onSelect={() =>
                  void navigate({
                    to: GUEST_PROFILE_DIRECTORY_PATH,
                    search: guestProfileSearch({
                      section: "guests",
                      type: "individual",
                      create: "individual",
                    }),
                  })
                }
              >
                New Guest
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canCreateCompany}
                onSelect={() =>
                  void navigate({
                    to: GUEST_PROFILE_DIRECTORY_PATH,
                    search: guestProfileSearch({
                      section: "companies",
                      type: "company",
                      create: "company",
                    }),
                  })
                }
              >
                New Company
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canCreateAgency}
                onSelect={() =>
                  void navigate({
                    to: GUEST_PROFILE_DIRECTORY_PATH,
                    search: guestProfileSearch({
                      section: "travel-agencies",
                      type: "travel-agent",
                      create: "travel-agent",
                    }),
                  })
                }
              >
                New Travel Agency
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canCreateGroup}
                onSelect={() =>
                  void navigate({
                    to: GUEST_PROFILE_DIRECTORY_PATH,
                    search: guestProfileSearch({
                      section: "groups",
                      type: "group",
                      create: "group",
                    }),
                  })
                }
              >
                New Group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {activeSection === "groups" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-[#D8D2C5] bg-white text-xs font-medium text-[#251605] hover:bg-[#FAF8F5]"
                data-testid="group-tools-menu"
              >
                <span>Group Tools</span>
                <ChevronDown className="ml-1 size-3 text-[#7A6B58]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 text-xs">
              <DropdownMenuItem
                disabled={!canCreateGroup}
                onSelect={() => setHeaderTemplateApplyOpen(true)}
              >
                Create from Template
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canCreateGroup}
                onSelect={() => setHeaderTemplateManageOpen(true)}
              >
                Manage Templates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-[#D8D2C5] bg-white text-xs font-medium text-[#251605] hover:bg-[#FAF8F5]"
                data-testid="guest-more-actions-menu"
              >
                <span>More</span>
                <ChevronDown className="ml-1 size-3 text-[#7A6B58]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 text-xs">
              <DropdownMenuItem
                disabled
                title={GUEST_IMPORT_UNAVAILABLE}
                data-testid="import-guests"
              >
                Import Guests
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    ) : null;

  const createBackBanner = (
    <div
      className="flex items-center justify-between rounded-lg border border-[#E8E4DC] bg-[#FAF8F5] px-4 py-2 text-xs"
      data-testid="guest-create-back-banner"
    >
      <button
        type="button"
        onClick={() => {
          void navigate({
            to: GUEST_PROFILE_DIRECTORY_PATH,
            search: guestProfileSearch({
              section: activeSection,
              type: sectionDef.domain,
            }),
          });
        }}
        className="flex items-center gap-1.5 font-semibold text-[#8C6D23] hover:text-[#251605]"
        data-testid="guest-create-back-btn"
      >
        <ArrowLeft className="size-3.5" />
        <span>Back to {sectionDef.title} Directory</span>
      </button>
      <span className="text-[#7A6B58]">
        Creating new {sectionDef.title.replace(/s$/, "")} profile
      </span>
    </div>
  );

  if (!guestId && create === "individual") {
    return (
      <GuestProfileChrome
        membership={membership}
        directorySearch={directorySearch}
        activeSection={activeSection}
        onSelectSection={selectSection}
        config={configQuery.data}
        access={accessQuery.data}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <div className="space-y-6" data-testid="guest-profile-shell">
          <GuestListingWorkspace
            membership={membership}
            listingType={profileType}
            returnCard={returnCard ?? emptyReturnCard}
            directorySearch={directorySearch}
            canCreate={canCreate}
            isTypeInactive={isTypeInactive}
          />
        </div>
        <GuestCreateModal
          restaurantId={membership.restaurant.id}
          open={true}
          onOpenChange={(next) => {
            if (!next) {
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: guestProfileSearch({
                  ...(directorySearch as Record<string, unknown> | undefined),
                  section: "guests",
                  type: "individual",
                  create: undefined,
                }),
              });
            }
          }}
          onCreated={(id) => {
            void navigate({
              to: GUEST_PROFILE_DETAIL_PATH,
              params: { guestId: id },
              search: guestProfileSearch({ type: "individual" }),
            });
          }}
          onCancel={() => {
            void navigate({
              to: GUEST_PROFILE_DIRECTORY_PATH,
              search: guestProfileSearch({
                ...(directorySearch as Record<string, unknown> | undefined),
                section: "guests",
                type: "individual",
                create: undefined,
              }),
            });
          }}
        />
      </GuestProfileChrome>
    );
  }

  if (!guestId && create === "group") {
    return (
      <GuestProfileChrome
        membership={membership}
        directorySearch={directorySearch}
        activeSection={activeSection}
        onSelectSection={selectSection}
        config={configQuery.data}
        access={accessQuery.data}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <div className="space-y-6" data-testid="guest-profile-shell">
          <GuestListingWorkspace
            membership={membership}
            listingType={profileType}
            returnCard={returnCard ?? emptyReturnCard}
            directorySearch={directorySearch}
            canCreate={canCreate}
            isTypeInactive={isTypeInactive}
          />
        </div>
        <GuestGroupCreateModal
          restaurantId={membership.restaurant.id}
          open={true}
          onOpenChange={(next) => {
            if (!next) {
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: guestProfileSearch({
                  ...(directorySearch as Record<string, unknown> | undefined),
                  section: "groups",
                  type: "group",
                  create: undefined,
                }),
              });
            }
          }}
          onCreated={(id) => {
            void navigate({
              to: GUEST_PROFILE_DETAIL_PATH,
              params: { guestId: id },
              search: guestProfileSearch({ type: "group", nav: "overview" }),
            });
          }}
          onCancel={() => {
            void navigate({
              to: GUEST_PROFILE_DIRECTORY_PATH,
              search: guestProfileSearch({
                ...(directorySearch as Record<string, unknown> | undefined),
                section: "groups",
                type: "group",
                create: undefined,
              }),
            });
          }}
        />
      </GuestProfileChrome>
    );
  }

  if (!guestId && create === "company") {
    return (
      <GuestProfileChrome
        membership={membership}
        directorySearch={directorySearch}
        activeSection={activeSection}
        onSelectSection={selectSection}
        config={configQuery.data}
        access={accessQuery.data}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <div className="space-y-6" data-testid="guest-profile-shell">
          <GuestListingWorkspace
            membership={membership}
            listingType={profileType}
            returnCard={returnCard ?? emptyReturnCard}
            directorySearch={directorySearch}
            canCreate={canCreate}
            isTypeInactive={isTypeInactive}
          />
        </div>
        <GuestCompanyCreateModal
          restaurantId={membership.restaurant.id}
          open={true}
          onOpenChange={(next) => {
            if (!next) {
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: guestProfileSearch({
                  ...(directorySearch as Record<string, unknown> | undefined),
                  section: "companies",
                  type: "company",
                  create: undefined,
                }),
              });
            }
          }}
          onCreated={(id) => {
            void navigate({
              to: GUEST_PROFILE_DETAIL_PATH,
              params: { guestId: id },
              search: guestProfileSearch({ type: "company" }),
            });
          }}
          onCancel={() => {
            void navigate({
              to: GUEST_PROFILE_DIRECTORY_PATH,
              search: guestProfileSearch({
                ...(directorySearch as Record<string, unknown> | undefined),
                section: "companies",
                type: "company",
                create: undefined,
              }),
            });
          }}
        />
        {/* Preserved workspace anchor */}
        <div className="hidden" aria-hidden="true">
          <GuestCompanyCreateWorkspace restaurantId={membership.restaurant.id} />
        </div>
      </GuestProfileChrome>
    );
  }

  if (!guestId && create === "travel-agent") {
    return (
      <GuestProfileChrome
        membership={membership}
        directorySearch={directorySearch}
        activeSection={activeSection}
        onSelectSection={selectSection}
        config={configQuery.data}
        access={accessQuery.data}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <div className="space-y-6" data-testid="guest-profile-shell">
          <GuestListingWorkspace
            membership={membership}
            listingType={profileType}
            returnCard={returnCard ?? emptyReturnCard}
            directorySearch={directorySearch}
            canCreate={canCreate}
            isTypeInactive={isTypeInactive}
          />
        </div>
        <GuestTravelAgencyCreateModal
          restaurantId={membership.restaurant.id}
          open={true}
          onOpenChange={(next) => {
            if (!next) {
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: guestProfileSearch({
                  ...(directorySearch as Record<string, unknown> | undefined),
                  section: "travel-agents",
                  type: "travel-agent",
                  create: undefined,
                }),
              });
            }
          }}
          onCreated={(id) => {
            void navigate({
              to: GUEST_PROFILE_DETAIL_PATH,
              params: { guestId: id },
              search: guestProfileSearch({ type: "travel-agent", nav: "overview" }),
            });
          }}
          onCancel={() => {
            void navigate({
              to: GUEST_PROFILE_DIRECTORY_PATH,
              search: guestProfileSearch({
                ...(directorySearch as Record<string, unknown> | undefined),
                section: "travel-agents",
                type: "travel-agent",
                create: undefined,
              }),
            });
          }}
        />
      </GuestProfileChrome>
    );
  }

  if (guestId && operationalType === "company") {
    return (
      <GuestProfileChrome
        membership={membership}
        directorySearch={directorySearch}
        activeSection="companies"
        onSelectSection={selectSection}
        config={configQuery.data}
        access={accessQuery.data}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <GuestCompanyDetailWorkspace membership={membership} companyId={guestId} nav={returnNav} />
      </GuestProfileChrome>
    );
  }

  if (guestId && operationalType === "travel-agent") {
    return (
      <GuestProfileChrome
        membership={membership}
        directorySearch={directorySearch}
        activeSection="travel-agencies"
        onSelectSection={selectSection}
        config={configQuery.data}
        access={accessQuery.data}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <GuestTravelAgentDetailWorkspace
          membership={membership}
          agencyId={guestId}
          nav={returnNav}
        />
      </GuestProfileChrome>
    );
  }

  if (guestId && operationalType === "group") {
    return (
      <GuestProfileChrome
        membership={membership}
        directorySearch={directorySearch}
        activeSection="groups"
        onSelectSection={selectSection}
        config={configQuery.data}
        access={accessQuery.data}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <GuestGroupDetailWorkspace membership={membership} groupId={guestId} nav={returnNav} />
      </GuestProfileChrome>
    );
  }

  if (guestId && !isAccount) {
    const currentDetailView = resolveGuestDetailView({
      ...(directorySearch as Record<string, unknown> | undefined),
      card,
      nav: navId,
    });

    const individualDetailContent = (
      <GuestIndividualDetailWorkspace
        membership={membership}
        guestId={guestId}
        activeView={currentDetailView}
        onViewChange={(nextView) => {
          const legacy = legacyParamsForDetailView(nextView);
          setCard(legacy.card);
          if (legacy.nav) setNavId(legacy.nav);
          void navigate({
            to: GUEST_PROFILE_DETAIL_PATH,
            params: { guestId },
            search: guestProfileSearch({
              ...(directorySearch as Record<string, unknown> | undefined),
              view: nextView,
              tab: nextView,
              card: legacy.card,
              nav: legacy.nav,
              type: profileType,
            }),
          });
        }}
        directorySearch={directorySearch}
        canCreate={canCreate}
      />
    );

    return (
      <GuestProfileChrome
        membership={membership}
        directorySearch={directorySearch}
        activeSection="guests"
        onSelectSection={selectSection}
        config={configQuery.data}
        access={accessQuery.data}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        {guestQuery.data ? (
          <GuestProfileActionsProvider
            restaurantId={restaurantId}
            guest={guestQuery.data.guest}
            membershipRole={membership.role}
            onOpenLoyalty={() => selectCard("loyalty")}
            onOpenNotesPage={() => selectNav("notes")}
            onOpenStaysPage={() => selectNav("bookings")}
            onOpenReservationsPage={() => selectNav("bookings")}
            onOpenIdentityPage={() => selectNav("identity")}
            onMerged={() => {
              void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH });
            }}
          >
            {individualDetailContent}
          </GuestProfileActionsProvider>
        ) : (
          individualDetailContent
        )}
      </GuestProfileChrome>
    );
  }

  if (!guestId && card === "directory") {
    return (
      <GuestProfileChrome
        membership={membership}
        directorySearch={directorySearch}
        activeSection={activeSection}
        onSelectSection={selectSection}
        config={configQuery.data}
        access={accessQuery.data}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        primaryAction={primaryAction}
      >
        <div className="space-y-6" data-testid="guest-profile-shell">
          <GuestListingWorkspace
            membership={membership}
            listingType={profileType}
            returnCard={returnCard ?? emptyReturnCard}
            directorySearch={directorySearch}
            canCreate={canCreate}
            isTypeInactive={isTypeInactive}
          />
        </div>
        <GuestGroupTemplatesDialog
          restaurantId={restaurantId}
          open={headerTemplateApplyOpen}
          onOpenChange={setHeaderTemplateApplyOpen}
          mode="apply"
        />
        <GuestGroupTemplatesDialog
          restaurantId={restaurantId}
          open={headerTemplateManageOpen}
          onOpenChange={setHeaderTemplateManageOpen}
          mode="manage"
        />
      </GuestProfileChrome>
    );
  }

  const shell = (
    <div className="space-y-6" data-testid="guest-profile-shell">
      {!isAccount && guestQuery.data ? (
        <>
          <GuestProfileHeader
            restaurantId={restaurantId}
            guest={guestQuery.data.guest}
            returnCard={card}
            profileType={operationalType}
          />
        </>
      ) : (
        <div>
          <h1 className="font-display text-2xl">Guest Profiles</h1>
          <p className="text-sm text-muted-foreground">Search, manage and open guest profiles.</p>
        </div>
      )}

      {guestId ? null : typeSwitcher}

      {guestId ? (
        <nav
          aria-label="Guest profile sections"
          className="flex w-full gap-1 overflow-x-auto border-b border-border pb-px"
          role="tablist"
          data-testid="guest-profile-section-nav"
        >
          {GUEST_PROFILE_WORKSPACE_NAV.map((item) => {
            const active = item.id === navId;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`guest-profile-card-${item.id}`}
                onClick={() => selectNav(item.id)}
                role="tab"
                aria-selected={active}
                className={cn(
                  "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.title}
              </button>
            );
          })}
        </nav>
      ) : null}

      {card === "directory" ? (
        isAccount ? (
          <GuestAccountDirectory
            membership={membership}
            accountType={accountType}
            returnCard={returnCard ?? emptyReturnCard}
          />
        ) : (
          <GuestDirectoryWorkspace
            membership={membership}
            compact
            returnCard={returnCard ?? emptyReturnCard}
            searchParams={directorySearch}
            canCreate={canCreate}
            isTypeInactive={isTypeInactive}
          />
        )
      ) : (
        <>
          {(card === "information" || card === "preferences") && guestId && !isAccount ? (
            <>
              {card === "information" ? (
                <p className="font-display text-lg">
                  {navId === "contact" ? "Contact" : "Personal"}
                </p>
              ) : null}
              <GuestDetailWorkspace
                membership={membership}
                guestId={guestId}
                backTo="guest-profile"
                section={detailSection}
                hideHeader
                onSectionChange={(next) => {
                  const nextCard = next === "preferences" ? "preferences" : "information";
                  const nextNav =
                    next === "preferences"
                      ? "preferences"
                      : navId === "contact"
                        ? "contact"
                        : "personal";
                  setCard(nextCard);
                  setNavId(nextNav);
                  void navigate({
                    to: GUEST_PROFILE_DETAIL_PATH,
                    params: { guestId },
                    search: guestProfileSearch({ card: nextCard, nav: nextNav, type: profileType }),
                  });
                }}
              />
            </>
          ) : card === "information" && guestId && isAccount ? (
            <GuestAccountDetail
              restaurantId={restaurantId}
              accountId={guestId}
              expectedType={accountType}
            />
          ) : card === "information" || card === "preferences" ? (
            <ComingCard
              title={selected.title}
              copy={
                isAccount && card === "preferences"
                  ? "Preferences are for individual guests. Open an Individual from Directory or Relationships."
                  : "Open a guest from Directory to view and edit this card. No guest is selected yet."
              }
              directoryFromCard={emptyDirectoryFrom}
              profileType={profileType}
              onOpenDirectory={openDirectoryFromEmpty}
            />
          ) : card === "identity" && guestId && !isAccount && guestQuery.data ? (
            <GuestIdentityCard restaurantId={restaurantId} guest={guestQuery.data.guest} />
          ) : card === "identity" && isAccount ? (
            <ComingCard
              title={selected.title}
              copy="Identity & Documents is for individual guests. Open an Individual from Directory."
            />
          ) : card === "identity" && !guestId ? (
            <ComingCard
              title={selected.title}
              copy="Open a guest from Directory to use this card. No guest is selected yet."
              directoryFromCard={emptyDirectoryFrom}
              profileType={profileType}
              onOpenDirectory={openDirectoryFromEmpty}
            />
          ) : card === "identity" && guestQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading guest…</p>
          ) : card === "identity" && guestQuery.isError ? (
            <ComingCard
              title={selected.title}
              copy="That guest could not be found for this property."
            />
          ) : (card === "dashboard" ||
              card === "stay-history" ||
              card === "services" ||
              card === "financial") &&
            isAccount ? (
            <ComingCard
              title={selected.title}
              copy="Dashboard, stays and financial summary are for individual guests. Linked members appear on Business and Loyalty."
            />
          ) : (card === "dashboard" ||
              card === "stay-history" ||
              card === "services" ||
              card === "financial") &&
            guestId &&
            guestQuery.data ? (
            card === "dashboard" ? (
              <GuestOverviewCard
                restaurantId={restaurantId}
                guest={guestQuery.data.guest}
                timezone={membership.restaurant.timezone}
                history={guestQuery.data.history}
              />
            ) : card === "services" ? (
              <GuestServiceHistoryCard
                restaurantId={restaurantId}
                guestId={guestId}
                guestName={guestQuery.data.guest.fullName}
                guestProfileNumber={guestQuery.data.guest.profileNumber}
                timezone={membership.restaurant.timezone}
                onOpenBookings={() => selectNav("bookings")}
              />
            ) : card === "financial" ? (
              <ComingCard title="Financial" copy={OVERVIEW_FINANCIAL_COPY} />
            ) : (
              <GuestStayHistoryCard
                restaurantId={restaurantId}
                guestId={guestId}
                guestName={guestQuery.data.guest.fullName}
                guestProfileNumber={guestQuery.data.guest.profileNumber}
                timezone={membership.restaurant.timezone}
                onOpenFinancial={() => selectNav("financial")}
              />
            )
          ) : card === "dashboard" ||
            card === "stay-history" ||
            card === "services" ||
            card === "financial" ? (
            <ComingCard
              title={selected.title}
              copy={
                guestId
                  ? guestQuery.isLoading
                    ? "Loading guest…"
                    : "That guest could not be found for this property."
                  : "Open a guest from Directory to view this card. No guest is selected yet."
              }
              directoryFromCard={emptyDirectoryFrom}
              profileType={profileType}
              onOpenDirectory={openDirectoryFromEmpty}
            />
          ) : card === "loyalty" && guestId && !isAccount && guestQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading guest…</p>
          ) : card === "relationships" && guestId && !isAccount && guestQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading guest…</p>
          ) : card === "loyalty" && guestId && (isAccount || guestQuery.data) ? (
            <GuestLoyaltyCard
              restaurantId={restaurantId}
              guestId={isAccount ? undefined : guestId}
              accountId={isAccount ? guestId : undefined}
              partyName={partyName || (isAccount ? "Account" : "Guest")}
            />
          ) : card === "relationships" && guestId && (isAccount || guestQuery.data) ? (
            <GuestRelationshipsCard
              restaurantId={restaurantId}
              guestId={isAccount ? undefined : guestId}
              accountId={isAccount ? guestId : undefined}
              accountType={accountType ?? undefined}
            />
          ) : (card === "notes-comms" || card === "admin-privacy") &&
            guestId &&
            !isAccount &&
            guestQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading guest…</p>
          ) : (card === "notes-comms" || card === "admin-privacy") &&
            guestId &&
            isAccount &&
            accountQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading account…</p>
          ) : card === "notes-comms" && guestId && (isAccount || guestQuery.data) ? (
            <div>
              <p className="mb-3 font-display text-lg">
                {navId === "history" ? "History" : "Notes"}
              </p>
              <GuestActivityHubCard
                restaurantId={restaurantId}
                guestId={isAccount ? undefined : guestId}
                accountId={isAccount ? guestId : undefined}
                partyName={partyName || (isAccount ? "Account" : "Guest")}
              />
            </div>
          ) : card === "admin-privacy" && guestId && (isAccount || guestQuery.data) ? (
            <GuestPrivacyCard
              restaurantId={restaurantId}
              guestId={isAccount ? undefined : guestId}
              accountId={isAccount ? guestId : undefined}
              partyName={partyName || (isAccount ? "Account" : "Guest")}
            />
          ) : card === "loyalty" ||
            card === "relationships" ||
            card === "notes-comms" ||
            card === "admin-privacy" ? (
            <ComingCard
              title={selected.title}
              copy={
                guestId
                  ? "That profile could not be found for this property."
                  : "Open a guest or account from Directory to use this card."
              }
              directoryFromCard={emptyDirectoryFrom}
              profileType={profileType}
              onOpenDirectory={openDirectoryFromEmpty}
            />
          ) : (
            <ComingCard
              title={selected.title}
              copy={selected.copy ?? comingInWaveLabel(selected.wave)}
              directoryFromCard={emptyDirectoryFrom}
              profileType={profileType}
              onOpenDirectory={openDirectoryFromEmpty}
            />
          )}
        </>
      )}
    </div>
  );

  const chromeWrappedShell = (
    <>
      <GuestProfileChrome
        membership={membership}
        directorySearch={directorySearch}
        activeSection={activeSection}
        onSelectSection={selectSection}
        config={configQuery.data}
        access={accessQuery.data}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        primaryAction={primaryAction}
      >
        {shell}
      </GuestProfileChrome>
      <GuestGroupTemplatesDialog
        restaurantId={restaurantId}
        open={headerTemplateApplyOpen}
        onOpenChange={setHeaderTemplateApplyOpen}
        mode="apply"
      />
      <GuestGroupTemplatesDialog
        restaurantId={restaurantId}
        open={headerTemplateManageOpen}
        onOpenChange={setHeaderTemplateManageOpen}
        mode="manage"
      />
    </>
  );

  if (!isAccount && guestQuery.data) {
    return (
      <GuestProfileActionsProvider
        restaurantId={restaurantId}
        guest={guestQuery.data.guest}
        membershipRole={membership.role}
        onOpenLoyalty={() => selectCard("loyalty")}
        onOpenNotesPage={() => selectNav("notes")}
        onOpenStaysPage={() => selectNav("bookings")}
        onOpenReservationsPage={() => selectNav("bookings")}
        onOpenIdentityPage={() => selectNav("identity")}
        onMerged={() => {
          void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH });
        }}
      >
        {chromeWrappedShell}
      </GuestProfileActionsProvider>
    );
  }

  return chromeWrappedShell;
}

function ComingCard({
  title,
  copy,
  directoryFromCard,
  profileType,
  onOpenDirectory,
}: {
  title: string;
  copy: string;
  directoryFromCard?: GuestProfileCardId | undefined;
  profileType?: GuestProfileTypeId | GuestListingPlaceholderType | undefined;
  onOpenDirectory?: (() => void) | undefined;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed border-border bg-card p-6"
      data-testid="guest-profile-coming"
    >
      <p className="font-display text-lg">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
      {directoryFromCard ? (
        <GuestDirectoryOpenButton
          fromCard={directoryFromCard}
          profileType={profileType}
          onOpen={onOpenDirectory}
        />
      ) : null}
    </div>
  );
}
