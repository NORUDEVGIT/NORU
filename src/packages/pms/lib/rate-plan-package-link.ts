/**
 * Rate Plan ↔ Package link reconciliation via existing pms_package_rate_plans.
 * Updates are expressed as Package Master saves (omit serviceTypeIds to leave inclusion JSON).
 */

import type { PackageCard3Row } from "@/packages/pms/lib/meals-card3.server";
import type { PackageInclusionType } from "@/packages/pms/lib/rate-plan-package-inclusion";

export type RatePlanPackageSavePayload = {
  id: string;
  code: string;
  name: string;
  type: PackageCard3Row["type"];
  description: string | null;
  packagePrice: number;
  chargeBasis: PackageCard3Row["chargeBasis"];
  active: boolean;
  roomTypeIds: string[];
  ratePlanIds: string[];
  ratePlanLinks: { ratePlanId: string; inclusionType: PackageInclusionType }[];
};

function packageIdentity(pkg: PackageCard3Row): Omit<
  RatePlanPackageSavePayload,
  "ratePlanIds" | "ratePlanLinks"
> {
  return {
    id: pkg.id,
    code: pkg.code,
    name: pkg.name,
    type: pkg.type,
    description: pkg.description?.trim() ? pkg.description : null,
    packagePrice: pkg.packagePrice,
    chargeBasis: pkg.chargeBasis,
    active: pkg.active,
    roomTypeIds: [...pkg.roomTypeIds],
  };
}

/**
 * Build 0–2 Package Master updates that reconcile this Rate Plan's package link.
 * Preserves unrelated rate-plan links on each package.
 */
export function buildRatePlanPackageLinkUpdates(input: {
  ratePlanId: string;
  previousPackageId: string | null;
  nextPackageId: string | null;
  inclusionType: PackageInclusionType;
  packages: ReadonlyArray<PackageCard3Row>;
}): RatePlanPackageSavePayload[] {
  const { ratePlanId, previousPackageId, nextPackageId, inclusionType, packages } = input;
  const updates: RatePlanPackageSavePayload[] = [];

  const prevId = previousPackageId?.trim() || null;
  const nextId = nextPackageId?.trim() || null;

  if (!prevId && !nextId) return updates;

  if (prevId && prevId === nextId) {
    const pkg = packages.find((row) => row.id === prevId);
    if (!pkg) return updates;
    const current =
      pkg.ratePlanLinks.find((link) => link.ratePlanId === ratePlanId)?.inclusionType ?? null;
    if (current === inclusionType) return updates;
    updates.push({
      ...packageIdentity(pkg),
      ratePlanIds: [...pkg.ratePlanIds],
      ratePlanLinks: pkg.ratePlanIds.map((id) => ({
        ratePlanId: id,
        inclusionType:
          id === ratePlanId
            ? inclusionType
            : (pkg.ratePlanLinks.find((link) => link.ratePlanId === id)?.inclusionType ??
              "optional"),
      })),
    });
    return updates;
  }

  if (prevId) {
    const prev = packages.find((row) => row.id === prevId);
    if (prev) {
      const ratePlanIds = prev.ratePlanIds.filter((id) => id !== ratePlanId);
      updates.push({
        ...packageIdentity(prev),
        ratePlanIds,
        ratePlanLinks: ratePlanIds.map((id) => ({
          ratePlanId: id,
          inclusionType:
            prev.ratePlanLinks.find((link) => link.ratePlanId === id)?.inclusionType ?? "optional",
        })),
      });
    }
  }

  if (nextId) {
    const next = packages.find((row) => row.id === nextId);
    if (next) {
      const ratePlanIds = [
        ...new Set([...next.ratePlanIds.filter((id) => id !== ratePlanId), ratePlanId]),
      ];
      updates.push({
        ...packageIdentity(next),
        ratePlanIds,
        ratePlanLinks: ratePlanIds.map((id) => ({
          ratePlanId: id,
          inclusionType:
            id === ratePlanId
              ? inclusionType
              : (next.ratePlanLinks.find((link) => link.ratePlanId === id)?.inclusionType ??
                "optional"),
        })),
      });
    }
  }

  return updates;
}

/** Find the package currently linked to a rate plan (at most one expected). */
export function findPackageLinkedToRatePlan(
  packages: ReadonlyArray<PackageCard3Row>,
  ratePlanId: string | null | undefined,
): PackageCard3Row | null {
  if (!ratePlanId) return null;
  return packages.find((row) => row.ratePlanIds.includes(ratePlanId)) ?? null;
}
