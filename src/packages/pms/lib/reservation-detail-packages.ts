import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
import type { PackageCard3Row, PackageComponentCard3Row } from "@/packages/pms/lib/meals-card3.server";
import type { EligiblePackageListItem } from "@/packages/pms/lib/revenue/commercial-package";

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

export type AvailablePackageCard = {
  id: string;
  name: string;
  code: string;
  description: string;
  category: string;
  chargeType: string;
  price: number | null;
  components: string[];
  eligible: boolean;
};

export function emptyPackageFilters(): PackageFilters {
  return { category: "", chargeType: "", price: "", search: "" };
}

export function chargeTypeLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "per_stay") return "Per Stay";
  if (raw === "per_night" || raw.includes("night")) return "Per Room Per Night";
  if (raw.includes("person")) return "Per Person";
  return raw.replace(/_/g, " ");
}

export function packageAppliesToStay(
  pkg: PackageCard3Row,
  roomTypeId: string,
  ratePlanId: string | null,
): boolean {
  if (!pkg.active) return false;
  if (pkg.roomTypeIds.length > 0 && !pkg.roomTypeIds.includes(roomTypeId)) return false;
  if (pkg.ratePlanIds.length > 0 && ratePlanId && !pkg.ratePlanIds.includes(ratePlanId)) return false;
  return true;
}

export function appliedPackagesTotal(rows: Array<{ appliedAmount: number }>): number {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row.appliedAmount) ? row.appliedAmount : 0), 0);
}

export function buildAvailablePackageCards(input: {
  catalogue: PackageCard3Row[];
  components: PackageComponentCard3Row[];
  eligible: EligiblePackageListItem[];
  roomTypeId: string;
  ratePlanId: string | null;
}): AvailablePackageCard[] {
  const eligibleByPackage = new Map(input.eligible.map((row) => [row.packageId, row]));
  const componentsByPackage = new Map<string, string[]>();
  for (const component of input.components) {
    const label = component.sourceLabel.trim();
    if (!label) continue;
    const list = componentsByPackage.get(component.packageId) ?? [];
    list.push(label);
    componentsByPackage.set(component.packageId, list);
  }
  return input.catalogue
    .filter((pkg) => packageAppliesToStay(pkg, input.roomTypeId, input.ratePlanId))
    .map((pkg) => {
      const eligible = eligibleByPackage.get(pkg.id);
      const price = eligible
        ? eligible.configuredPrice
        : Number.isFinite(pkg.packagePrice)
          ? pkg.packagePrice
          : null;
      return {
        id: pkg.id,
        name: pkg.name,
        code: pkg.code,
        description: pkg.description,
        category: pkg.typeLabel || pkg.type,
        chargeType: chargeTypeLabel(eligible?.chargeBasis) || DETAIL_DASH,
        price,
        components: componentsByPackage.get(pkg.id) ?? [],
        eligible: Boolean(eligible),
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
    if (
      search &&
      !`${card.name} ${card.code} ${card.description}`.toLowerCase().includes(search)
    ) {
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
