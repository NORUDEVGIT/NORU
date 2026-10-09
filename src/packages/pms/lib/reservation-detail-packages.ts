import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
import {
  parsePackageChargeBasis,
  PACKAGE_CHARGE_BASIS_LABELS,
  type PackageCard3Row,
  type PackageChargeBasis,
  type PackageComponentCard3Row,
} from "@/packages/pms/lib/meals-card3.server";
import type { EligiblePackageListItem } from "@/packages/pms/lib/revenue/commercial-package";
import {
  PACKAGE_INCLUSION_TYPE_LABELS,
  parsePackageInclusionType,
  type PackageInclusionType,
} from "@/packages/pms/lib/rate-plan-package-inclusion";

export type AppliedPackageView = {
  id: string;
  packageId: string;
  packageName: string;
  packageCode: string;
  chargeBasis: string;
  quantity: number;
  unitAmount: number;
  appliedAmount: number;
  components: Array<{ componentType?: string }>;
};

export const PACKAGE_NOTES_MAX = 500;

export const PACKAGE_BIND_GAP_COPY =
  "Packages cannot be attached or removed from this workspace. Applied packages come from stored reservation pricing only.";

export const PACKAGE_NOTES_GAP_COPY =
  "Package notes are not stored on the reservation. Stay notes remain on Notes & Traces.";

export type PackageFilters = {
  category: string;
  chargeType: string;
  price: string;
  search: string;
};

export type PackageEligibilityStatus = "activation_eligible" | "catalogue_only" | "unevaluated";

export type AvailablePackageCard = {
  id: string;
  name: string;
  code: string;
  description: string;
  category: string;
  chargeType: string;
  chargeBasis: PackageChargeBasis;
  chargeBasisHonesty: string | null;
  price: number | null;
  coverUrl: string | null;
  components: string[];
  inclusionLabel: string | null;
  applicabilityRoom: string;
  applicabilityRate: string;
  eligibilityStatus: PackageEligibilityStatus;
  eligible: boolean;
  /** Operational activation id. Null when the card is catalogue-only. */
  activationId: string | null;
};

export const PACKAGE_CHARGE_BASIS_OPERATIONAL_HONESTY =
  "Automatic operational charging currently uses Per stay only.";

export function emptyPackageFilters(): PackageFilters {
  return { category: "", chargeType: "", price: "", search: "" };
}

export function chargeTypeLabel(value: string | null | undefined): string {
  const basis = parsePackageChargeBasis(value);
  return PACKAGE_CHARGE_BASIS_LABELS[basis];
}

export function chargeBasisHonestyCopy(configuredBasis: PackageChargeBasis): string | null {
  if (configuredBasis === "per_stay") return null;
  return `Configured basis: ${PACKAGE_CHARGE_BASIS_LABELS[configuredBasis]}. ${PACKAGE_CHARGE_BASIS_OPERATIONAL_HONESTY}`;
}

export function packageApplicabilitySummary(pkg: PackageCard3Row): {
  room: string;
  rate: string;
} {
  return {
    room:
      pkg.roomTypeIds.length === 0 ? "All room types" : `${pkg.roomTypeIds.length} room type(s)`,
    rate:
      pkg.ratePlanIds.length === 0 ? "All rate plans" : `${pkg.ratePlanIds.length} rate plan(s)`,
  };
}

export function packageInclusionForRatePlan(
  pkg: PackageCard3Row,
  ratePlanId: string | null,
): PackageInclusionType | null {
  if (!ratePlanId) return null;
  const link = pkg.ratePlanLinks.find((row) => row.ratePlanId === ratePlanId);
  if (!link) return null;
  return parsePackageInclusionType(link.inclusionType);
}

export function packageInclusionLabel(
  pkg: PackageCard3Row,
  ratePlanId: string | null,
): string | null {
  const inclusion = packageInclusionForRatePlan(pkg, ratePlanId);
  return inclusion ? PACKAGE_INCLUSION_TYPE_LABELS[inclusion] : null;
}

export function componentLabelsForPackage(
  components: PackageComponentCard3Row[],
  packageId: string,
): string[] {
  const labels: string[] = [];
  for (const component of components) {
    if (component.packageId !== packageId) continue;
    const label = component.kindLabel.trim() || component.sourceLabel.trim();
    if (!label) continue;
    labels.push(label);
  }
  return labels;
}

export function cataloguePackageById(
  catalogue: PackageCard3Row[],
  packageId: string,
): PackageCard3Row | null {
  return catalogue.find((row) => row.id === packageId) ?? null;
}

export function packageAppliesToStay(
  pkg: PackageCard3Row,
  roomTypeId: string,
  ratePlanId: string | null,
): boolean {
  if (!pkg.active) return false;
  if (pkg.roomTypeIds.length > 0 && !pkg.roomTypeIds.includes(roomTypeId)) return false;
  if (ratePlanId && pkg.ratePlanIds.length > 0 && !pkg.ratePlanIds.includes(ratePlanId)) {
    return false;
  }
  return true;
}

export function canBindCreatePackage(card: AvailablePackageCard): boolean {
  return (
    card.eligibilityStatus === "activation_eligible" &&
    card.chargeBasis === "per_stay" &&
    Boolean(card.activationId) &&
    card.price != null &&
    card.price > 0
  );
}

/** Operator copy for a catalogue card the create form must not attach. */
export function createPackageUnselectableReason(card: AvailablePackageCard): string | null {
  if (canBindCreatePackage(card)) return null;
  if (card.eligibilityStatus === "catalogue_only") return "Catalogue only";
  if (card.eligibilityStatus !== "activation_eligible") return "Not available for this reservation";
  return "Not currently attachable";
}

export function selectedCreatePackageRows(
  cards: AvailablePackageCard[],
  activationIds: readonly string[],
): AvailablePackageCard[] {
  const selected = new Set(activationIds);
  return cards.filter(
    (card) =>
      card.activationId != null && selected.has(card.activationId) && canBindCreatePackage(card),
  );
}

export function appliedPackagesTotal(rows: Array<{ appliedAmount: number }>): number {
  return rows.reduce(
    (sum, row) => sum + (Number.isFinite(row.appliedAmount) ? row.appliedAmount : 0),
    0,
  );
}

export function buildAvailablePackageCards(input: {
  catalogue: PackageCard3Row[];
  components: PackageComponentCard3Row[];
  eligible: EligiblePackageListItem[];
  roomTypeId: string;
  ratePlanId: string | null;
}): AvailablePackageCard[] {
  const eligibleByPackage = new Map(input.eligible.map((row) => [row.packageId, row]));
  const ratePlanReady = Boolean(input.ratePlanId?.trim());
  return input.catalogue
    .filter((pkg) => packageAppliesToStay(pkg, input.roomTypeId, input.ratePlanId))
    .map((pkg) => {
      const eligible = eligibleByPackage.get(pkg.id);
      const configuredBasis = parsePackageChargeBasis(eligible?.chargeBasis ?? pkg.chargeBasis);
      const price = eligible
        ? eligible.configuredPrice
        : Number.isFinite(pkg.packagePrice)
          ? pkg.packagePrice
          : null;
      const applicability = packageApplicabilitySummary(pkg);
      const eligibilityStatus: PackageEligibilityStatus = !ratePlanReady
        ? "unevaluated"
        : eligible
          ? "activation_eligible"
          : "catalogue_only";
      return {
        id: pkg.id,
        name: pkg.name,
        code: pkg.code,
        description: pkg.description,
        category: pkg.typeLabel || pkg.type,
        chargeType: chargeTypeLabel(configuredBasis),
        chargeBasis: configuredBasis,
        chargeBasisHonesty: chargeBasisHonestyCopy(configuredBasis),
        price,
        coverUrl: pkg.coverUrl,
        components: componentLabelsForPackage(input.components, pkg.id),
        inclusionLabel: packageInclusionLabel(pkg, input.ratePlanId),
        applicabilityRoom: applicability.room,
        applicabilityRate: applicability.rate,
        eligibilityStatus,
        eligible: Boolean(eligible),
        activationId: eligible?.activationId ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterAvailablePackages(
  cards: AvailablePackageCard[],
  filters: PackageFilters,
): AvailablePackageCard[] {
  const search = filters.search.trim().toLowerCase();
  return cards.filter((card) => {
    if (filters.category && card.category !== filters.category) return false;
    if (filters.chargeType && card.chargeType !== filters.chargeType) return false;
    if (filters.price && String(card.price ?? DETAIL_DASH) !== filters.price) return false;
    if (search && !`${card.name} ${card.code} ${card.description}`.toLowerCase().includes(search)) {
      return false;
    }
    return true;
  });
}

export function uniquePackageFilterOptions(cards: AvailablePackageCard[]): {
  categories: string[];
  chargeTypes: string[];
  prices: string[];
} {
  const categories = new Set<string>();
  const chargeTypes = new Set<string>();
  const prices = new Set<string>();
  for (const card of cards) {
    if (card.category) categories.add(card.category);
    if (card.chargeType && card.chargeType !== DETAIL_DASH) chargeTypes.add(card.chargeType);
    prices.add(card.price == null ? DETAIL_DASH : String(card.price));
  }
  const collator = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return {
    categories: [...categories].sort(collator),
    chargeTypes: [...chargeTypes].sort(collator),
    prices: [...prices].sort(collator),
  };
}

export function appliedStayDates(arrival: string, departure: string): string {
  if (!arrival || !departure) return DETAIL_DASH;
  return `${arrival} – ${departure}`;
}

export function appliedPackageDescription(
  row: AppliedPackageView,
  catalogue: PackageCard3Row[],
): string {
  const match = catalogue.find((pkg) => pkg.id === row.packageId);
  const description = match?.description?.trim();
  if (description) return description;
  const fromComponents = row.components
    .map((item) => String(item.componentType ?? "").trim())
    .filter(Boolean);
  return fromComponents.join(" · ");
}
