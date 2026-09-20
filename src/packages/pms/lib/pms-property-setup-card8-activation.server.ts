import { canActivateSet1 } from "./pms-set1-foundation";
import {
  card8GoliveReadinessInput,
  card8GoliveReady,
  type Card8GoliveSnapshot,
} from "./pms-property-setup-card8-golive";
import { loadCard8GoliveSnapshot } from "./pms-property-setup-card8-golive.functions";
import { loadCard8ValidationReport } from "./pms-property-setup-card8-validation.functions";
import type { Card8ValidationReport } from "./pms-property-setup-card8-validation";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

export type Card8ActivationEligibility = {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
  property: {
    id: string;
    name: string;
    propertyCode: string | null;
  };
  canonicalLive: boolean;
  businessDate: string | null;
  validation: Card8ValidationReport["counts"];
  golive: {
    ready: boolean;
    status: string;
    incompleteRequiredTasks: number;
    businessDateConfirmed: boolean;
    openingStateConfirmed: boolean;
    futureReservationsConfirmed: boolean;
    sandboxAcknowledged: boolean;
    cutoverLockAcknowledged: boolean;
  };
  ownerAuthorized: boolean;
  set1ChecklistReady: boolean;
};

function required<T>(
  result: { data?: T; error?: { message?: string } | null },
  fallback: string,
): T {
  if (result.error) throw new Error(result.error.message ?? fallback);
  return result.data as T;
}

export async function loadCard8ActivationEligibility(
  db: DbClient,
  restaurantId: string,
  userId: string,
  role: string,
  set1ChecklistReady: boolean,
  preloaded?: {
    validation: Card8ValidationReport;
    golive: Card8GoliveSnapshot;
  },
): Promise<Card8ActivationEligibility> {
  const [propertyResult, validation, goliveSnapshot] = await Promise.all([
    db
      .from("restaurants")
      .select("id, name, property_code, business_date, pms_set1_live")
      .eq("id", restaurantId)
      .maybeSingle(),
    preloaded?.validation ?? loadCard8ValidationReport(db, restaurantId, userId),
    preloaded?.golive ?? loadCard8GoliveSnapshot(db, restaurantId, false),
  ]);
  const property = required<any | null>(
    propertyResult,
    "Could not load the property activation state.",
  );
  if (!property) throw new Error("Property not found.");

  const readinessInput = card8GoliveReadinessInput(
    goliveSnapshot.plan,
    goliveSnapshot.tasks,
    validation.counts.critical,
  );
  const goliveReady = card8GoliveReady(readinessInput);
  const ownerAuthorized = canActivateSet1(role);
  const canonicalLive = property.pms_set1_live === true;
  const businessDate = property.business_date ? String(property.business_date) : null;
  const blockers: string[] = [];

  if (canonicalLive) blockers.push("Property is already active.");
  if (!ownerAuthorized) blockers.push("Only the property owner can activate.");
  if (!set1ChecklistReady) blockers.push("The existing SET1 mandatory checklist is incomplete.");
  if (validation.counts.critical > 0) {
    blockers.push(
      `System Validation has ${validation.counts.critical} critical ${
        validation.counts.critical === 1 ? "issue" : "issues"
      }.`,
    );
  }
  if (!businessDate) blockers.push("The authoritative Card 1 business date is missing.");
  if (!goliveSnapshot.plan.businessDateConfirmed) {
    blockers.push("The Go-Live business date confirmation is incomplete.");
  }
  if (!goliveReady) blockers.push("Card 8 Go-Live governance is not ready.");

  return {
    eligible: blockers.length === 0,
    blockers,
    warnings: validation.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
    property: {
      id: String(property.id),
      name: String(property.name ?? "Property"),
      propertyCode: property.property_code ? String(property.property_code) : null,
    },
    canonicalLive,
    businessDate,
    validation: validation.counts,
    golive: {
      ready: goliveReady,
      status: goliveSnapshot.plan.status,
      incompleteRequiredTasks: readinessInput.incompleteRequiredTasks,
      businessDateConfirmed: goliveSnapshot.plan.businessDateConfirmed,
      openingStateConfirmed: goliveSnapshot.plan.openingStateConfirmed,
      futureReservationsConfirmed: goliveSnapshot.plan.futureReservationsConfirmed,
      sandboxAcknowledged: goliveSnapshot.plan.sandboxAcknowledgement,
      cutoverLockAcknowledged: goliveSnapshot.plan.cutoverLockAcknowledgement,
    },
    ownerAuthorized,
    set1ChecklistReady,
  };
}
