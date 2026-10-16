import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_PROFILE_DOMAIN_REGISTRY,
  GUEST_WORKSPACE_SECTIONS,
  SUPPORTED_GUEST_PROFILE_DOMAINS,
  domainFromCard4Code,
  domainFromSection,
  normalizeGuestWorkspaceSearch,
  resolveGuestProfileDomain,
  sectionFromDomain,
} from "./guest-profile-domains.ts";
import {
  resolveGuestWorkspaceAccess,
  type GuestWorkspaceAccess,
} from "./guest-workspace-access.functions.ts";
import {
  assertDomainCreateAllowed,
  isDomainCreateAllowed,
  type GuestWorkspaceConfig,
} from "./guest-workspace-config.functions.ts";
import {
  GUEST_OPERATIONAL_QUERY_KEYS,
  GUEST_WORKSPACE_CONFIG_QUERY_KEYS,
  invalidateGuestOperationalQueries,
  invalidateGuestWorkspaceConfigQueries,
} from "./guest-workspace-invalidation.ts";
import { parseGuestProfileSearch, guestProfileSearch } from "./guest-profile-wave1.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Phase 1 — Guest Profile Module Domain Registry & URL Contract", () => {
  it("locks exactly four supported operational domains", () => {
    assert.deepEqual(SUPPORTED_GUEST_PROFILE_DOMAINS, [
      "individual",
      "company",
      "travel-agent",
      "group",
    ]);
    assert.equal(SUPPORTED_GUEST_PROFILE_DOMAINS.length, 4);
  });

  it("maps four primary workspace navigation sections", () => {
    assert.deepEqual(
      GUEST_WORKSPACE_SECTIONS.map((s) => s.id),
      ["guests", "companies", "travel-agencies", "groups"],
    );
    assert.equal(sectionFromDomain("individual"), "guests");
    assert.equal(sectionFromDomain("company"), "companies");
    assert.equal(sectionFromDomain("travel-agent"), "travel-agencies");
    assert.equal(sectionFromDomain("group"), "groups");

    assert.equal(domainFromSection("guests"), "individual");
    assert.equal(domainFromSection("companies"), "company");
    assert.equal(domainFromSection("travel-agencies"), "travel-agent");
    assert.equal(domainFromSection("groups"), "group");
  });

  it("maps Property Setup Card 4 codes to canonical domains", () => {
    assert.equal(domainFromCard4Code("IND"), "individual");
    assert.equal(domainFromCard4Code("COM"), "company");
    assert.equal(domainFromCard4Code("TRA"), "travel-agent");
    assert.equal(domainFromCard4Code("GRP"), "group");
    assert.equal(domainFromCard4Code("TOU"), "travel-agent"); // Tour operator degrades to travel-agent
    assert.equal(domainFromCard4Code("CUSTOM"), null);
    assert.equal(domainFromCard4Code("ORG"), null);
  });

  it("degrades legacy or deferred placeholder types gracefully", () => {
    assert.equal(resolveGuestProfileDomain("individual"), "individual");
    assert.equal(resolveGuestProfileDomain("company"), "company");
    assert.equal(resolveGuestProfileDomain("travel-agent"), "travel-agent");
    assert.equal(resolveGuestProfileDomain("group"), "group");
    assert.equal(resolveGuestProfileDomain("tour-operator"), "travel-agent");
    assert.equal(resolveGuestProfileDomain("tou"), "travel-agent");
    assert.equal(resolveGuestProfileDomain("contact"), "individual");
    assert.equal(resolveGuestProfileDomain("con"), "individual");
    assert.equal(resolveGuestProfileDomain("unknown-type"), "individual");
    assert.equal(resolveGuestProfileDomain(""), "individual");
    assert.equal(resolveGuestProfileDomain(null), "individual");
  });

  it("normalizes canonical search params while preserving legacy compatibility", () => {
    // Canonical section
    assert.deepEqual(normalizeGuestWorkspaceSearch({ section: "companies" }), {
      section: "companies",
      type: "company",
      card: undefined,
      nav: undefined,
      tab: undefined,
      create: undefined,
      preview: undefined,
    });

    // Legacy type parameter
    assert.deepEqual(normalizeGuestWorkspaceSearch({ type: "travel-agent" }), {
      section: "travel-agencies",
      type: "travel-agent",
      card: undefined,
      nav: undefined,
      tab: undefined,
      create: undefined,
      preview: undefined,
    });

    // Deferred placeholder degrades to supported domain
    assert.deepEqual(normalizeGuestWorkspaceSearch({ type: "tour-operator" }), {
      section: "travel-agencies",
      type: "travel-agent",
      card: undefined,
      nav: undefined,
      tab: undefined,
      create: undefined,
      preview: undefined,
    });

    // Sub-tab / card / nav preservation
    const withCards = normalizeGuestWorkspaceSearch({
      section: "guests",
      card: "identity",
      nav: "identity",
    });
    assert.equal(withCards.section, "guests");
    assert.equal(withCards.card, "identity");
    assert.equal(withCards.nav, "identity");
    assert.equal(withCards.tab, "identity");

    // Create preservation
    const withCreate = normalizeGuestWorkspaceSearch({
      section: "companies",
      create: "company",
    });
    assert.equal(withCreate.section, "companies");
    assert.equal(withCreate.create, "company");
  });

  it("updates parseGuestProfileSearch and guestProfileSearch to support canonical section", () => {
    const parsed = parseGuestProfileSearch({
      section: "companies",
      type: "company",
    });
    assert.equal(parsed.section, "companies");
    assert.equal(parsed.type, "company");

    const created = guestProfileSearch({
      section: "travel-agencies",
      type: "travel-agent",
      create: "travel-agent",
    });
    assert.equal(created.section, "travel-agencies");
    assert.equal(created.type, "travel-agent");
    assert.equal(created.create, "travel-agent");
  });
});

describe("Phase 1 — Property Setup Config Adapter & Creation Governance", () => {
  const mockConfig: GuestWorkspaceConfig = {
    available: true,
    restaurantId: "test-rest-1",
    types: [
      {
        id: "t-1",
        code: "IND",
        name: "Individual",
        domain: "individual",
        active: true,
        icon: "user",
        requiredFieldIds: ["f-1"],
        documentTypeIds: ["d-1"],
        preferenceTypeIds: ["p-1"],
        defaults: {},
      },
      {
        id: "t-2",
        code: "COM",
        name: "Company",
        domain: "company",
        active: false, // INACTIVE in setup
        icon: "building",
        requiredFieldIds: [],
        documentTypeIds: [],
        preferenceTypeIds: [],
        defaults: {},
      },
      {
        id: "t-3",
        code: "TRA",
        name: "Travel Agency",
        domain: "travel-agent",
        active: true,
        icon: "briefcase",
        requiredFieldIds: [],
        documentTypeIds: [],
        preferenceTypeIds: [],
        defaults: {},
      },
      {
        id: "t-4",
        code: "GRP",
        name: "Group",
        domain: "group",
        active: true,
        icon: "users",
        requiredFieldIds: [],
        documentTypeIds: [],
        preferenceTypeIds: [],
        defaults: {},
      },
    ],
    fields: [],
    idTypes: [],
    preferenceCategories: [],
    preferenceTypes: [],
    preferenceOptions: [],
    businessTypes: [],
    businessSettings: { enabled: true, autoApproval: false },
    groupTypes: [],
    communicationChannels: [],
    communicationDefaults: null,
  };

  it("checks whether domain creation is allowed based on active status", () => {
    assert.equal(isDomainCreateAllowed(mockConfig, "individual"), true);
    assert.equal(isDomainCreateAllowed(mockConfig, "travel-agent"), true);
    assert.equal(isDomainCreateAllowed(mockConfig, "group"), true);
    // Company is inactive in Property Setup
    assert.equal(isDomainCreateAllowed(mockConfig, "company"), false);
  });

  it("assertDomainCreateAllowed throws actionable error when inactive", () => {
    assert.doesNotThrow(() => assertDomainCreateAllowed(mockConfig, "individual"));
    assert.throws(
      () => assertDomainCreateAllowed(mockConfig, "company"),
      /Company profiles are inactive in Property Setup/,
    );
  });
});

describe("Phase 1 — Centralized Access Model", () => {
  it("grants complete authority to owner and manager roles", () => {
    const ownerAccess = resolveGuestWorkspaceAccess("owner");
    assert.equal(ownerAccess.canView, true);
    assert.equal(ownerAccess.canCreate, true);
    assert.equal(ownerAccess.canEdit, true);
    assert.equal(ownerAccess.canVerifyIdentity, true);
    assert.equal(ownerAccess.canManageAccounts, true);
    assert.equal(ownerAccess.canMerge, true);
    assert.equal(ownerAccess.canPrivacy, true);
    assert.equal(ownerAccess.canExport, true);

    const managerAccess = resolveGuestWorkspaceAccess("manager");
    assert.equal(managerAccess.canView, true);
    assert.equal(managerAccess.canCreate, true);
    assert.equal(managerAccess.canEdit, true);
    assert.equal(managerAccess.canVerifyIdentity, true);
    assert.equal(managerAccess.canManageAccounts, true);
    assert.equal(managerAccess.canMerge, true);
    assert.equal(managerAccess.canPrivacy, true);
    assert.equal(managerAccess.canExport, true);
  });

  it("restricts destructive and admin actions for front_desk", () => {
    const fdAccess = resolveGuestWorkspaceAccess("front_desk");
    assert.equal(fdAccess.canView, true);
    assert.equal(fdAccess.canCreate, true);
    assert.equal(fdAccess.canEdit, true);
    assert.equal(fdAccess.canVerifyIdentity, true);
    assert.equal(fdAccess.canManageAccounts, false);
    assert.equal(fdAccess.canMerge, false);
    assert.equal(fdAccess.canPrivacy, false);
    assert.equal(fdAccess.canExport, false);
  });

  it("restricts creation and editing for staff", () => {
    const staffAccess = resolveGuestWorkspaceAccess("staff");
    assert.equal(staffAccess.canView, true);
    assert.equal(staffAccess.canCreate, false);
    assert.equal(staffAccess.canEdit, false);
    assert.equal(staffAccess.canVerifyIdentity, false);
    assert.equal(staffAccess.canManageAccounts, false);
    assert.equal(staffAccess.canMerge, false);
    assert.equal(staffAccess.canPrivacy, false);
    assert.equal(staffAccess.canExport, false);
  });

  it("denies all permissions for unknown or undefined roles", () => {
    const noAccess = resolveGuestWorkspaceAccess(undefined);
    assert.equal(noAccess.canView, false);
    assert.equal(noAccess.canCreate, false);
  });
});

describe("Phase 1 — Cache Invalidation Contracts", () => {
  it("declares comprehensive query keys for config and operational stores", () => {
    assert.ok(GUEST_WORKSPACE_CONFIG_QUERY_KEYS.includes("guest-workspace-config"));
    assert.ok(GUEST_WORKSPACE_CONFIG_QUERY_KEYS.includes("pms-card4-profile-types"));
    assert.ok(GUEST_WORKSPACE_CONFIG_QUERY_KEYS.includes("pms-card4-required-fields"));
    assert.ok(GUEST_WORKSPACE_CONFIG_QUERY_KEYS.includes("pms-card4-identity-documents"));
    assert.ok(GUEST_WORKSPACE_CONFIG_QUERY_KEYS.includes("pms-card4-preferences"));
    assert.ok(GUEST_WORKSPACE_CONFIG_QUERY_KEYS.includes("pms-card4-company-business"));
    assert.ok(GUEST_WORKSPACE_CONFIG_QUERY_KEYS.includes("pms-card4-group-types"));

    assert.ok(GUEST_OPERATIONAL_QUERY_KEYS.includes("guests"));
    assert.ok(GUEST_OPERATIONAL_QUERY_KEYS.includes("guest"));
    assert.ok(GUEST_OPERATIONAL_QUERY_KEYS.includes("guest-accounts"));
    assert.ok(GUEST_OPERATIONAL_QUERY_KEYS.includes("guest-account"));
    assert.ok(GUEST_OPERATIONAL_QUERY_KEYS.includes("guest-account-links"));
  });

  it("invalidates all registered keys through invalidateGuestWorkspaceConfigQueries", async () => {
    const invalidated: unknown[][] = [];
    const mockQueryClient = {
      invalidateQueries: async (arg: { queryKey: readonly unknown[] }) => {
        invalidated.push([...arg.queryKey]);
      },
    };

    await invalidateGuestWorkspaceConfigQueries(
      mockQueryClient as unknown as Parameters<typeof invalidateGuestWorkspaceConfigQueries>[0],
      "rest-123",
    );
    assert.equal(invalidated.length, GUEST_WORKSPACE_CONFIG_QUERY_KEYS.length);
    assert.ok(
      invalidated.some(
        (key) => Array.isArray(key) && key[0] === "guest-workspace-config" && key[1] === "rest-123",
      ),
    );
  });

  it("invalidates all operational keys through invalidateGuestOperationalQueries", async () => {
    const invalidated: unknown[][] = [];
    const mockQueryClient = {
      invalidateQueries: async (arg: { queryKey: readonly unknown[] }) => {
        invalidated.push([...arg.queryKey]);
      },
    };

    await invalidateGuestOperationalQueries(
      mockQueryClient as unknown as Parameters<typeof invalidateGuestOperationalQueries>[0],
      "rest-123",
    );
    assert.equal(invalidated.length, GUEST_OPERATIONAL_QUERY_KEYS.length);
    assert.ok(
      invalidated.some((key) => Array.isArray(key) && key[0] === "guests" && key[1] === "rest-123"),
    );
  });
});

describe("Phase 1 — Workspace Chrome & Property Setup Integration Integrity", () => {
  it("locks NORU gold indicator (#C89933) and chrome testids in GuestProfileChrome", () => {
    const chrome = readRel("../components/guests/guest-profile-chrome.tsx");
    assert.match(chrome, /#C89933/);
    assert.match(chrome, /data-testid="guest-profile-chrome"/);
    assert.match(chrome, /guest-nav-section-/);
    assert.match(chrome, /guest-inactive-type-banner/);
    assert.match(chrome, /Master Identity/);
  });

  it("wires GuestProfileChrome and centralized queries inside GuestProfileWorkspace", () => {
    const workspace = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(workspace, /GuestProfileChrome/);
    assert.match(workspace, /getGuestWorkspaceConfig/);
    assert.match(workspace, /getGuestWorkspaceAccess/);
    assert.match(workspace, /normalizeGuestWorkspaceSearch/);
    assert.match(workspace, /invalidateGuestWorkspaceConfigQueries/);
    assert.match(workspace, /invalidateGuestOperationalQueries/);
    assert.match(workspace, /guest-create-back-banner/);
    assert.match(workspace, /guest-create-action-btn/);
  });

  it("wires invalidateGuestWorkspaceConfigQueries into all Card 4 settings components", () => {
    const profileTypes = readRel("../components/settings/pms-card4-profile-types.tsx");
    const requiredFields = readRel("../components/settings/pms-card4-required-fields.tsx");
    const identityDocs = readRel("../components/settings/pms-card4-identity-documents.tsx");
    const preferences = readRel("../components/settings/pms-card4-preferences.tsx");
    const companyBusiness = readRel("../components/settings/pms-card4-company-business.tsx");
    const groupTypes = readRel("../components/settings/pms-card4-group-types.tsx");
    const commChannels = readRel("../components/settings/pms-card4-communication-channels.tsx");
    const commDefaults = readRel("../components/settings/pms-card4-communication-defaults.tsx");

    assert.match(profileTypes, /invalidateGuestWorkspaceConfigQueries/);
    assert.match(requiredFields, /invalidateGuestWorkspaceConfigQueries/);
    assert.match(identityDocs, /invalidateGuestWorkspaceConfigQueries/);
    assert.match(preferences, /invalidateGuestWorkspaceConfigQueries/);
    assert.match(companyBusiness, /invalidateGuestWorkspaceConfigQueries/);
    assert.match(groupTypes, /invalidateGuestWorkspaceConfigQueries/);
    assert.match(commChannels, /invalidateGuestWorkspaceConfigQueries/);
    assert.match(commDefaults, /invalidateGuestWorkspaceConfigQueries/);
  });
});
