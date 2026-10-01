/**
 * PMS Property Setup Card 3 — Rate & Pricing (compatibility aliases).
 * Rate & Pricing has been migrated to Card 2 (Rooms & Operations).
 * All canonical implementations reside in rates-card2.functions.ts.
 *
 * DO NOT add separate writer logic here.
 */

import {
  getRatesCard2,
  loadRatesCard2Snapshot,
  saveRateCategoryCard2,
  saveRatePlanCard2,
} from "./rates-card2.functions.ts";

/** @deprecated Use getRatesCard2 from rates-card2.functions */
export const getRatesCard3 = getRatesCard2;

/** @deprecated Use saveRateCategoryCard2 from rates-card2.functions */
export const saveRateCategoryCard3 = saveRateCategoryCard2;

/** @deprecated Use saveRatePlanCard2 from rates-card2.functions */
export const saveRatePlanCard3 = saveRatePlanCard2;

/** @deprecated Use loadRatesCard2Snapshot from rates-card2.functions */
export const loadRatesCard3Snapshot = loadRatesCard2Snapshot;
