/**
 * Rate & Revenue workspace information architecture (Phase 1 Prompt 3–5).
 *
 * Navigation, URL compatibility, context-field declarations, and view capabilities.
 * Does not implement UI-01–UI-40 internals.
 */

import type { RevenueAccess, RevenueCapability } from "./revenue/revenue-access";
import type { RevenueContextField } from "./revenue/revenue-context";

export type RevenueWorkspaceView =
  | "control-center"
  | "rate-plans-reference"
  | "rate-calendar"
  | "bulk-rate-change"
  | "rate-history"
  | "restrictions"
  | "apply-restriction"
  | "restriction-history"
  | "demand-forecast"
  | "pickup-pace"
  | "forecast-detail"
  | "demand-calendar"
  | "forecast-history"
  | "commercial"
  | "promotions"
  | "packages"
  | "commercial-history"
  | "market-intelligence"
  | "approvals"
  | "revenue-performance"
  | "audit-control"
  | "export";

export type RevenuePrimarySection =
  | "revenue-control"
  | "rates"
  | "restrictions"
  | "demand-forecast"
  | "commercial"
  | "more";

export interface RevenueViewDefinition {
  id: RevenueWorkspaceView;
  label: string;
  section: RevenuePrimarySection;
  description: string;
  implemented: boolean;
  plannedCapability?: string;
  sources?: readonly string[];
  contextFields: readonly RevenueContextField[];
  requiredCapability?: RevenueCapability;
}

export const REVENUE_VIEW_REQUIRED_CAPABILITY: Record<RevenueWorkspaceView, RevenueCapability> = {
  "control-center": "canView",
  "rate-plans-reference": "canViewRates",
  "rate-calendar": "canViewRates",
  "bulk-rate-change": "canViewRates",
  "rate-history": "canViewRates",
  restrictions: "canViewRestrictions",
  "apply-restriction": "canViewRestrictions",
  "restriction-history": "canViewRestrictions",
  "demand-forecast": "canViewForecast",
  "pickup-pace": "canViewForecast",
  "forecast-detail": "canViewForecast",
  "demand-calendar": "canViewForecast",
  "forecast-history": "canViewForecast",
  commercial: "canViewCommercial",
  promotions: "canViewCommercial",
  packages: "canViewCommercial",
  "commercial-history": "canViewCommercial",
  "market-intelligence": "canViewCommercial",
  approvals: "canViewApprovals",
  "revenue-performance": "canViewAnalytics",
  "audit-control": "canViewAudit",
  export: "canExport",
};

export const REVENUE_DEFAULT_VIEW: RevenueWorkspaceView = "control-center";

export const LEGACY_REVENUE_TAB_MAP: Record<string, RevenueWorkspaceView> = {
  overview: "control-center",
  plans: "rate-plans-reference",
  calendar: "rate-calendar",
  restrictions: "restrictions",
};

export const REVENUE_VIEW_DEFINITIONS: RevenueViewDefinition[] = [
  {
    id: "control-center",
    label: "Control Center",
    section: "revenue-control",
    description: "Operational occupancy, ADR and RevPAR from reservation pricing snapshots.",
    implemented: true,
    contextFields: ["dateRange", "roomType", "ratePlan", "segment", "source", "channel"],
  },
  {
    id: "rate-plans-reference",
    label: "Rate Plans",
    section: "rates",
    description: "Read-only reference of rate plans configured in Property Setup.",
    implemented: true,
    contextFields: ["roomType"],
  },
  {
    id: "rate-calendar",
    label: "Rate Calendar",
    section: "rates",
    description: "Read and set date-specific nightly rate overrides.",
    implemented: true,
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "bulk-rate-change",
    label: "Bulk Rate Change",
    section: "rates",
    description: "Apply dated rate changes across multiple plans or room types.",
    implemented: true,
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "rate-history",
    label: "Rate History",
    section: "rates",
    description: "Review historical daily rate changes.",
    implemented: true,
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "restrictions",
    label: "Restrictions",
    section: "restrictions",
    description: "Date-level min/max stay, CTA, CTD and stop sell on hotel_rate_restrictions.",
    implemented: true,
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "apply-restriction",
    label: "Apply Restriction",
    section: "restrictions",
    description: "Apply a dated restriction across a selected stay window.",
    implemented: true,
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "restriction-history",
    label: "Restriction History",
    section: "restrictions",
    description: "Review historical restriction changes.",
    implemented: true,
    sources: ["hotel_rate_restriction_change_events"],
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "demand-forecast",
    label: "Demand & Forecast",
    section: "demand-forecast",
    description: "Live on-the-books occupancy, booked revenue and restriction context.",
    implemented: true,
    sources: ["Reservations", "Rooms & Inventory", "Property Setup"],
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "pickup-pace",
    label: "Pickup & Pace",
    section: "demand-forecast",
    description: "Change in on-the-books nights between two daily OTB snapshots.",
    implemented: true,
    sources: ["Reservations", "Rooms & Inventory"],
    contextFields: ["dateRange", "roomType"],
  },
  {
    id: "forecast-detail",
    label: "Forecast Detail",
    section: "demand-forecast",
    description: "Inspect forecast composition for a selected date or segment.",
    implemented: false,
    plannedCapability: "Detail inspection of a forecast date, not a second forecast engine.",
    sources: ["Reservations", "Rooms & Inventory"],
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "demand-calendar",
    label: "Demand Calendar",
    section: "demand-forecast",
    description: "Live occupancy and inventory by stay date and room type.",
    implemented: true,
    sources: ["Reservations", "Rooms & Inventory"],
    contextFields: ["dateRange", "roomType"],
  },
  {
    id: "forecast-history",
    label: "Forecast History",
    section: "demand-forecast",
    description: "Review historical forecast snapshots.",
    implemented: false,
    plannedCapability: "Stored forecast snapshots for later comparison.",
    sources: ["Reservations"],
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "commercial",
    label: "Commercial Overview",
    section: "commercial",
    description: "Monitor active promotions, packages, commercial scope, and post-launch performance.",
    implemented: true,
    sources: ["Property Setup", "Reservations"],
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "promotions",
    label: "Promotions",
    section: "commercial",
    description: "Operational activation of promotion masters from Property Setup.",
    implemented: true,
    sources: ["Property Setup", "Reservations"],
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "packages",
    label: "Packages",
    section: "commercial",
    description: "Operational package availability and performance.",
    implemented: true,
    sources: ["Property Setup", "Reservations"],
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "commercial-history",
    label: "Commercial History",
    section: "commercial",
    description: "Review operational commercial activation changes.",
    implemented: false,
    plannedCapability: "Full commercial change history table once UI-21 ships.",
    sources: ["hotel_commercial_change_events"],
    contextFields: ["dateRange"],
  },
  {
    id: "market-intelligence",
    label: "Market Intelligence",
    section: "commercial",
    description: "Competitor and market-position decision support.",
    implemented: false,
    plannedCapability: "Market rate comparison once an approved data source exists.",
    sources: ["Distribution", "Property Setup"],
    contextFields: ["dateRange", "roomType", "ratePlan", "channel"],
  },
  {
    id: "approvals",
    label: "Approvals",
    section: "commercial",
    description: "Review and approve commercial rate or restriction changes.",
    implemented: false,
    plannedCapability: "Approval queue for material revenue actions.",
    sources: ["Rate Calendar", "Restrictions"],
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "revenue-performance",
    label: "Revenue Performance",
    section: "more",
    description: "Analytics beyond the Control Center snapshot KPIs.",
    implemented: false,
    plannedCapability: "Deeper revenue analytics without changing Control Center formulas.",
    sources: ["Reservations", "Reports"],
    contextFields: ["dateRange", "roomType", "ratePlan", "segment", "source", "channel"],
  },
  {
    id: "audit-control",
    label: "Audit & Control",
    section: "more",
    description: "Operational audit of revenue actions.",
    implemented: false,
    plannedCapability: "Audit trail for rate, restriction and commercial actions.",
    sources: ["Rate Calendar", "Restrictions"],
    contextFields: ["dateRange", "roomType", "ratePlan"],
  },
  {
    id: "export",
    label: "Export",
    section: "more",
    description: "Export operational revenue views.",
    implemented: false,
    plannedCapability: "Controlled export of implemented revenue views.",
    sources: ["Control Center", "Reports"],
    contextFields: ["dateRange"],
  },
];

export const REVENUE_PRIMARY_SECTIONS: Array<{
  id: RevenuePrimarySection;
  label: string;
}> = [
  { id: "revenue-control", label: "Revenue Control" },
  { id: "rates", label: "Rates" },
  { id: "restrictions", label: "Restrictions" },
  { id: "demand-forecast", label: "Demand & Forecast" },
  { id: "commercial", label: "Commercial" },
  { id: "more", label: "More" },
];

export const REVENUE_SECTION_DEFAULTS: Record<RevenuePrimarySection, RevenueWorkspaceView> = {
  "revenue-control": "control-center",
  rates: "rate-plans-reference",
  restrictions: "restrictions",
  "demand-forecast": "demand-forecast",
  commercial: "commercial",
  more: "revenue-performance",
};

/** Future UI-01–UI-40 map onto these views. Drawers and confirmations are not primary nav. */
export const REVENUE_UI_SCREEN_MAP: Array<{
  ui: string;
  view: RevenueWorkspaceView | null;
  note?: string;
}> = [
  { ui: "UI-01", view: "control-center" },
  { ui: "UI-02", view: "rate-calendar" },
  { ui: "UI-03", view: null, note: "future rate detail drawer, not primary nav" },
  { ui: "UI-04", view: "bulk-rate-change" },
  { ui: "UI-05", view: null, note: "review/confirmation inside bulk-rate-change, not primary nav" },
  { ui: "UI-06", view: "rate-history" },
  { ui: "UI-07", view: "restrictions" },
  { ui: "UI-08", view: null, note: "future restriction detail drawer" },
  { ui: "UI-09", view: "apply-restriction" },
  { ui: "UI-10", view: null, note: "review/confirmation inside apply-restriction, not primary nav" },
  { ui: "UI-11", view: "restriction-history" },
  { ui: "UI-12", view: "demand-forecast" },
  { ui: "UI-13", view: "pickup-pace" },
  { ui: "UI-14", view: "forecast-detail" },
  { ui: "UI-15", view: "demand-calendar" },
  { ui: "UI-16", view: "forecast-history" },
  { ui: "UI-17", view: "commercial" },
  { ui: "UI-18", view: "promotions" },
  { ui: "UI-19", view: "packages" },
  { ui: "UI-20", view: null, note: "activation wizard, not primary nav" },
  { ui: "UI-21", view: "commercial-history", note: "foundation until UI-21" },
  { ui: "UI-22", view: "market-intelligence" },
  { ui: "UI-23", view: null, note: "future comparison subview/detail" },
  { ui: "UI-24", view: null, note: "future market-position subview" },
  { ui: "UI-25", view: null, note: "future market-history subview" },
  { ui: "UI-26", view: "approvals" },
  { ui: "UI-27", view: null, note: "approval detail/review flow" },
  { ui: "UI-28", view: null, note: "approval detail/review flow" },
  { ui: "UI-29", view: null, note: "approval detail/review flow" },
  { ui: "UI-30", view: "approvals", note: "approval history within approvals" },
  { ui: "UI-31", view: "revenue-performance" },
  { ui: "UI-32", view: null, note: "analytics subview/detail" },
  { ui: "UI-33", view: null, note: "analytics subview/detail" },
  { ui: "UI-34", view: null, note: "analytics subview/detail" },
  { ui: "UI-35", view: null, note: "analytics subview/detail" },
  { ui: "UI-36", view: "audit-control" },
  { ui: "UI-37", view: null, note: "audit subview" },
  { ui: "UI-38", view: null, note: "audit subview" },
  { ui: "UI-39", view: null, note: "audit subview" },
  { ui: "UI-40", view: "export" },
];

const VALID_VIEWS = new Set<RevenueWorkspaceView>(REVENUE_VIEW_DEFINITIONS.map((view) => view.id));

export function isRevenueWorkspaceView(value: string): value is RevenueWorkspaceView {
  return VALID_VIEWS.has(value as RevenueWorkspaceView);
}

export function normalizeRevenueView(input?: string): RevenueWorkspaceView {
  if (!input) return REVENUE_DEFAULT_VIEW;
  if (isRevenueWorkspaceView(input)) return input;
  return LEGACY_REVENUE_TAB_MAP[input] ?? REVENUE_DEFAULT_VIEW;
}

export function revenueViewDefinition(view: RevenueWorkspaceView): RevenueViewDefinition {
  const definition =
    REVENUE_VIEW_DEFINITIONS.find((row) => row.id === view) ?? REVENUE_VIEW_DEFINITIONS[0]!;
  return {
    ...definition,
    requiredCapability: REVENUE_VIEW_REQUIRED_CAPABILITY[definition.id],
  };
}

export function requiredCapabilityForView(view: RevenueWorkspaceView): RevenueCapability {
  return REVENUE_VIEW_REQUIRED_CAPABILITY[view];
}

export function canAccessRevenueView(access: RevenueAccess, view: RevenueWorkspaceView): boolean {
  if (!access.canView) return false;
  return access[requiredCapabilityForView(view)];
}

export function firstAccessibleRevenueView(access: RevenueAccess): RevenueWorkspaceView | null {
  return REVENUE_VIEW_DEFINITIONS.find((definition) => canAccessRevenueView(access, definition.id))?.id ?? null;
}

export function sectionForRevenueView(view: RevenueWorkspaceView): RevenuePrimarySection {
  return revenueViewDefinition(view).section;
}

export function viewsForRevenueSection(
  section: RevenuePrimarySection,
  access?: RevenueAccess,
): RevenueWorkspaceView[] {
  return REVENUE_VIEW_DEFINITIONS.filter((definition) => {
    if (definition.section !== section) return false;
    if (!access) return true;
    return canAccessRevenueView(access, definition.id);
  }).map((definition) => definition.id);
}

export function visibleRevenueSections(access: RevenueAccess): RevenuePrimarySection[] {
  return REVENUE_PRIMARY_SECTIONS.filter(
    (section) => viewsForRevenueSection(section.id, access).length > 0,
  ).map((section) => section.id);
}

export function implementedRevenueViews(): RevenueWorkspaceView[] {
  return REVENUE_VIEW_DEFINITIONS.filter((definition) => definition.implemented).map(
    (definition) => definition.id,
  );
}

export function foundationRevenueViews(): RevenueWorkspaceView[] {
  return REVENUE_VIEW_DEFINITIONS.filter((definition) => !definition.implemented).map(
    (definition) => definition.id,
  );
}

export function contextFieldsForView(view: RevenueWorkspaceView): readonly RevenueContextField[] {
  return revenueViewDefinition(view).contextFields;
}
