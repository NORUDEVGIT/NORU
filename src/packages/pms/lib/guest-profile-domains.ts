/**
 * NORU PMS — Guest Profile Domain Registry & Canonical URL Architecture
 * Phase 1 Foundation
 *
 * System code owns the supported operational domain registry.
 * Property Setup configuration controls active/inactive, policies, and options.
 */

export const SUPPORTED_GUEST_PROFILE_DOMAINS = [
  "individual",
  "company",
  "travel-agent",
  "group",
] as const;

export type SupportedGuestProfileDomain = (typeof SUPPORTED_GUEST_PROFILE_DOMAINS)[number];

export const GUEST_WORKSPACE_SECTIONS = [
  {
    id: "guests",
    domain: "individual" as SupportedGuestProfileDomain,
    title: "Guests",
    card4Code: "IND",
    createType: "individual" as const,
    accountType: null,
    description: "Individual guest identity and profile master records.",
  },
  {
    id: "companies",
    domain: "company" as SupportedGuestProfileDomain,
    title: "Companies",
    card4Code: "COM",
    createType: "company" as const,
    accountType: "company" as const,
    description: "Corporate account masters, billing terms and linked travelers.",
  },
  {
    id: "travel-agencies",
    domain: "travel-agent" as SupportedGuestProfileDomain,
    title: "Travel Agencies",
    card4Code: "TRA",
    createType: "travel-agent" as const,
    accountType: "travel_agent" as const,
    description: "Travel agency masters, IATA numbers and booking records.",
  },
  {
    id: "groups",
    domain: "group" as SupportedGuestProfileDomain,
    title: "Groups",
    card4Code: "GRP",
    createType: "group" as const,
    accountType: "group" as const,
    description: "Group account masters, rooming rosters and event itineraries.",
  },
] as const;

export type GuestWorkspaceSectionId = (typeof GUEST_WORKSPACE_SECTIONS)[number]["id"];

export interface GuestProfileDomainDefinition {
  domain: SupportedGuestProfileDomain;
  sectionId: GuestWorkspaceSectionId;
  title: string;
  card4Code: string;
  accountType: "company" | "travel_agent" | "group" | null;
  createType: "individual" | "company" | "travel-agent" | "group";
  description: string;
}

export const GUEST_PROFILE_DOMAIN_REGISTRY: Record<
  SupportedGuestProfileDomain,
  GuestProfileDomainDefinition
> = {
  individual: {
    domain: "individual",
    sectionId: "guests",
    title: "Guests",
    card4Code: "IND",
    accountType: null,
    createType: "individual",
    description: "Individual guest identity and profile master records.",
  },
  company: {
    domain: "company",
    sectionId: "companies",
    title: "Companies",
    card4Code: "COM",
    accountType: "company",
    createType: "company",
    description: "Corporate account masters, billing terms and linked travelers.",
  },
  "travel-agent": {
    domain: "travel-agent",
    sectionId: "travel-agencies",
    title: "Travel Agencies",
    card4Code: "TRA",
    accountType: "travel_agent",
    createType: "travel-agent",
    description: "Travel agency masters, IATA numbers and booking records.",
  },
  group: {
    domain: "group",
    sectionId: "groups",
    title: "Groups",
    card4Code: "GRP",
    accountType: "group",
    createType: "group",
    description: "Group account masters, rooming rosters and event itineraries.",
  },
};

/**
 * Maps any legacy type or section string to a canonical SupportedGuestProfileDomain.
 * Deferred or placeholder types degrade safely to supported domains:
 * - "tour-operator" -> "travel-agent"
 * - "contact" -> "individual"
 */
export function resolveGuestProfileDomain(input?: string | null): SupportedGuestProfileDomain {
  if (!input) return "individual";
  const normalized = input.trim().toLowerCase();
  if (
    normalized === "individual" ||
    normalized === "guests" ||
    normalized === "guest" ||
    normalized === "ind"
  ) {
    return "individual";
  }
  if (normalized === "company" || normalized === "companies" || normalized === "com") {
    return "company";
  }
  if (
    normalized === "travel-agent" ||
    normalized === "travel-agencies" ||
    normalized === "travel_agent" ||
    normalized === "tra" ||
    normalized === "tour-operator" ||
    normalized === "tou"
  ) {
    return "travel-agent";
  }
  if (normalized === "group" || normalized === "groups" || normalized === "grp") {
    return "group";
  }
  if (normalized === "contact" || normalized === "con") {
    return "individual";
  }
  return "individual";
}

export function sectionFromDomain(domain: SupportedGuestProfileDomain): GuestWorkspaceSectionId {
  return GUEST_PROFILE_DOMAIN_REGISTRY[domain].sectionId;
}

export function domainFromSection(section: GuestWorkspaceSectionId): SupportedGuestProfileDomain {
  const match = GUEST_WORKSPACE_SECTIONS.find((s) => s.id === section);
  return match?.domain ?? "individual";
}

export function domainFromCard4Code(code: string): SupportedGuestProfileDomain | null {
  const clean = code.trim().toUpperCase();
  if (clean === "IND") return "individual";
  if (clean === "COM") return "company";
  if (clean === "TRA" || clean === "TOU") return "travel-agent";
  if (clean === "GRP") return "group";
  return null;
}

export interface CanonicalGuestWorkspaceSearch {
  section?: GuestWorkspaceSectionId | undefined;
  tab?: string | undefined;
  card?: string | undefined;
  nav?: string | undefined;
  type?: string | undefined;
  create?: "individual" | "company" | "travel-agent" | "group" | undefined;
  preview?: string | undefined;
}

/**
 * Normalizes incoming search params from TanStack Router into canonical workspace state.
 * Fully supports legacy `type`, `card`, and `nav` parameters while prioritizing `section`.
 */
export function normalizeGuestWorkspaceSearch(
  search: Record<string, unknown>,
): CanonicalGuestWorkspaceSearch {
  const sectionParam =
    typeof search.section === "string" ? search.section.trim().toLowerCase() : undefined;
  const typeParam = typeof search.type === "string" ? search.type.trim().toLowerCase() : undefined;
  const createParam =
    typeof search.create === "string" ? search.create.trim().toLowerCase() : undefined;
  const cardParam = typeof search.card === "string" ? search.card.trim() : undefined;
  const navParam = typeof search.nav === "string" ? search.nav.trim() : undefined;
  const tabParam = typeof search.tab === "string" ? search.tab.trim() : undefined;
  const previewParam = typeof search.preview === "string" ? search.preview.trim() : undefined;

  let resolvedSection: GuestWorkspaceSectionId = "guests";
  if (sectionParam && GUEST_WORKSPACE_SECTIONS.some((s) => s.id === sectionParam)) {
    resolvedSection = sectionParam as GuestWorkspaceSectionId;
  } else if (typeParam) {
    const domain = resolveGuestProfileDomain(typeParam);
    resolvedSection = sectionFromDomain(domain);
  }

  let resolvedCreate: CanonicalGuestWorkspaceSearch["create"] = undefined;
  if (
    createParam === "individual" ||
    createParam === "company" ||
    createParam === "travel-agent" ||
    createParam === "group"
  ) {
    resolvedCreate = createParam;
  }

  return {
    section: resolvedSection,
    type: GUEST_PROFILE_DOMAIN_REGISTRY[domainFromSection(resolvedSection)].domain,
    card: cardParam,
    nav: navParam,
    tab: tabParam ?? navParam ?? cardParam,
    create: resolvedCreate,
    preview: previewParam,
  };
}
