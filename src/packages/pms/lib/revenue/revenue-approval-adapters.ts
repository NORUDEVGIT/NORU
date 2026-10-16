/**
 * P7-STEP-02 — Domain adapters. Preview and apply stay on existing engines.
 */

import { COMMERCIAL_ABSENT_VERSION } from "./commercial-engine.ts";
import { packageActivationPreviewCanApply } from "./commercial-package-activation.ts";
import { previewStoredPackageActivation } from "./commercial-package-activation.server.ts";
import { promotionActivationPreviewCanApply } from "./commercial-promotion-activation.ts";
import { previewStoredPromotionActivation } from "./commercial-promotion-activation.server.ts";
import { rateError } from "../rates.server.ts";
import {
  decideAtomicRateChangeApply,
  rateChangeRequestSchema,
  resolveRateChangeActionType,
  type RateChangeRequest,
} from "./rate-change.ts";
import { previewRateChanges } from "./rate-change.server.ts";
import {
  decideAtomicRestrictionApply,
  restrictionActionType,
  restrictionChangeRequestSchema,
  type RestrictionChangeRequest,
} from "./restriction-change.ts";
import { previewRestrictionChanges } from "./restriction-change.server.ts";
import {
  buildCommercialDisplaySnapshot,
  buildRateDisplaySnapshot,
  buildRestrictionDisplaySnapshot,
  encodeExpectedVersions,
  isStaleDomainError,
  packageActivationProposalSchema,
  parseRevenueApprovalProposal,
  promotionActivationProposalSchema,
  rateEntityType,
  restrictionEntityType,
  type PreparedRevenueApproval,
  type RevenueApprovalDomain,
} from "./revenue-approval.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type RevenueApprovalStaleCheck = { stale: false } | { stale: true; reason: string };

export type RevenueApprovalDomainAdapter = {
  domain: RevenueApprovalDomain;
  prepareSubmit(db: DbClient, proposal: unknown): Promise<PreparedRevenueApproval>;
  checkStale(db: DbClient, proposal: unknown): Promise<RevenueApprovalStaleCheck>;
};

function firstStaleReason(messages: string[]): string | null {
  return messages.find((message) => isStaleDomainError(message)) ?? null;
}

async function prepareRate(db: DbClient, proposal: unknown): Promise<PreparedRevenueApproval> {
  const request = rateChangeRequestSchema.parse(proposal);
  const preview = await previewRateChanges(db, request);
  const decision = decideAtomicRateChangeApply(preview);
  if (!decision.ok) throw rateError(decision.error);
  const expectedVersions = preview.items.map((item) => ({
    ratePlanId: item.ratePlanId,
    date: item.date,
    expectedVersion: item.expectedVersion,
  }));
  const canonical: RateChangeRequest = {
    restaurantId: request.restaurantId,
    targets: request.targets,
    rule: request.rule,
    reason: request.reason ?? null,
    expectedVersions,
    source: request.source ?? "rate_revenue",
  };
  const snapshot = buildRateDisplaySnapshot({
    ruleType: request.rule.type,
    ratePlanNames: preview.items.map((item) => item.ratePlanName ?? item.ratePlanCode ?? ""),
    roomTypeNames: preview.items.map((item) => item.roomTypeName ?? ""),
    dates: preview.items.map((item) => item.date),
    operationLabel: resolveRateChangeActionType(request.rule, request.targets.length),
  });
  return {
    restaurantId: request.restaurantId,
    domain: "rate",
    actionType: resolveRateChangeActionType(request.rule, request.targets.length),
    entityType: rateEntityType(request.targets.length),
    entityId: null,
    requestReason: request.reason ?? null,
    proposalPayload: canonical as unknown as Record<string, unknown>,
    displaySnapshot: snapshot,
    expectedVersion: encodeExpectedVersions(expectedVersions),
    summary: snapshot.summary,
  };
}

async function staleRate(db: DbClient, proposal: unknown): Promise<RevenueApprovalStaleCheck> {
  const request = rateChangeRequestSchema.parse(proposal);
  const preview = await previewRateChanges(db, request);
  const decision = decideAtomicRateChangeApply(preview);
  if (decision.ok) return { stale: false };
  const reason =
    firstStaleReason(preview.items.flatMap((item) => item.validationMessages)) ?? decision.error;
  if (isStaleDomainError(reason) || reason === "RATE_CHANGE_STALE") {
    return { stale: true, reason };
  }
  throw rateError(reason);
}

async function prepareRestriction(
  db: DbClient,
  proposal: unknown,
): Promise<PreparedRevenueApproval> {
  const request = restrictionChangeRequestSchema.parse(proposal);
  const preview = await previewRestrictionChanges(db, request);
  const decision = decideAtomicRestrictionApply(preview);
  if (!decision.ok) throw rateError(decision.error);
  const expectedVersions = preview.items.map((item) => ({
    ratePlanId: item.ratePlanId,
    date: item.date,
    expectedVersion: item.expectedVersion,
  }));
  const canonical: RestrictionChangeRequest = {
    restaurantId: request.restaurantId,
    targets: request.targets,
    operation: request.operation,
    expectedVersions,
    reason: request.reason ?? null,
    source: request.source ?? "rate_revenue",
  };
  const fields = [...new Set(preview.items.flatMap((item) => item.changedFields))];
  const snapshot = buildRestrictionDisplaySnapshot({
    operationType: request.operation.type,
    fields,
    ratePlanNames: preview.items.map((item) => item.ratePlanName || item.ratePlanCode),
    roomTypeNames: preview.items.map((item) => item.roomTypeName),
    dates: preview.items.map((item) => item.date),
    operationLabel: restrictionActionType(request.operation, request.targets.length),
  });
  return {
    restaurantId: request.restaurantId,
    domain: "restriction",
    actionType: restrictionActionType(request.operation, request.targets.length),
    entityType: restrictionEntityType(request.targets.length),
    entityId: null,
    requestReason: request.reason ?? null,
    proposalPayload: canonical as unknown as Record<string, unknown>,
    displaySnapshot: snapshot,
    expectedVersion: encodeExpectedVersions(expectedVersions),
    summary: snapshot.summary,
  };
}

async function staleRestriction(
  db: DbClient,
  proposal: unknown,
): Promise<RevenueApprovalStaleCheck> {
  const request = restrictionChangeRequestSchema.parse(proposal);
  const preview = await previewRestrictionChanges(db, request);
  const decision = decideAtomicRestrictionApply(preview);
  if (decision.ok) return { stale: false };
  const reason =
    firstStaleReason(preview.items.flatMap((item) => item.validationMessages)) ?? decision.error;
  if (isStaleDomainError(reason) || reason === "RESTRICTION_CHANGE_STALE") {
    return { stale: true, reason };
  }
  throw rateError(reason);
}

async function preparePromotion(db: DbClient, proposal: unknown): Promise<PreparedRevenueApproval> {
  const input = promotionActivationProposalSchema.parse(proposal);
  const preview = await previewStoredPromotionActivation(db, input);
  if (!promotionActivationPreviewCanApply(preview) || !preview.proposedActivation) {
    const reason = preview.errors[0] ?? "COMMERCIAL_OPERATION_INVALID";
    if (isStaleDomainError(reason)) throw rateError(reason);
    throw rateError(reason);
  }
  const payload = {
    restaurantId: input.restaurantId,
    operation: input.operation,
    activationId: input.activationId ?? null,
    promotionId: preview.proposedActivation.promotionId,
    validFrom: preview.proposedActivation.validFrom,
    validTo: preview.proposedActivation.validTo,
    bookingFrom: preview.proposedActivation.bookingFrom,
    bookingTo: preview.proposedActivation.bookingTo,
    priority: preview.proposedActivation.priority,
    roomTypeIds: preview.proposedActivation.roomTypeIds,
    ratePlanIds: preview.proposedActivation.ratePlanIds,
    reason: preview.proposedActivation.reason,
    expectedVersion: preview.expectedVersion,
    active: preview.proposedActivation.active,
    reactivate: Boolean(
      preview.currentActivation &&
      preview.currentActivation.active === false &&
      preview.proposedActivation.active === true,
    ),
  };
  const snapshot = buildCommercialDisplaySnapshot({
    operation: input.operation,
    kind: "promotion",
    name: preview.proposedActivation.promotionName,
    code: preview.proposedActivation.promotionCode,
    dateFrom: preview.proposedActivation.validFrom,
    dateTo: preview.proposedActivation.validTo,
    active: preview.proposedActivation.active,
  });
  return {
    restaurantId: input.restaurantId,
    domain: "promotion_activation",
    actionType: input.operation,
    entityType: "promotion_activation",
    entityId: input.operation === "CREATE" ? null : (input.activationId ?? null),
    requestReason: input.reason ?? null,
    proposalPayload: payload,
    displaySnapshot: snapshot,
    expectedVersion:
      input.operation === "CREATE" ? COMMERCIAL_ABSENT_VERSION : preview.expectedVersion,
    summary: snapshot.summary,
  };
}

async function stalePromotion(db: DbClient, proposal: unknown): Promise<RevenueApprovalStaleCheck> {
  const input = promotionActivationProposalSchema.parse(proposal);
  const preview = await previewStoredPromotionActivation(db, input);
  const stale = preview.errors.find((code) => isStaleDomainError(code));
  if (stale) return { stale: true, reason: stale };
  if (input.operation === "CREATE" && preview.currentActivation) {
    return { stale: true, reason: "COMMERCIAL_ACTIVATION_STALE" };
  }
  if (!promotionActivationPreviewCanApply(preview)) {
    throw rateError(preview.errors[0] ?? "COMMERCIAL_OPERATION_INVALID");
  }
  return { stale: false };
}

async function preparePackage(db: DbClient, proposal: unknown): Promise<PreparedRevenueApproval> {
  const input = packageActivationProposalSchema.parse(proposal);
  const preview = await previewStoredPackageActivation(db, input);
  if (!packageActivationPreviewCanApply(preview) || !preview.proposedActivation) {
    throw rateError(preview.errors[0] ?? "COMMERCIAL_OPERATION_INVALID");
  }
  const payload = {
    restaurantId: input.restaurantId,
    operation: input.operation,
    activationId: input.activationId ?? null,
    packageId: preview.proposedActivation.packageId,
    validFrom: preview.proposedActivation.validFrom,
    validTo: preview.proposedActivation.validTo,
    roomTypeIds: preview.proposedActivation.roomTypeIds,
    ratePlanIds: preview.proposedActivation.ratePlanIds,
    reason: preview.proposedActivation.reason,
    expectedVersion: preview.expectedVersion,
    active: preview.proposedActivation.active,
    reactivate: Boolean(
      preview.currentActivation &&
      preview.currentActivation.active === false &&
      preview.proposedActivation.active === true,
    ),
  };
  const snapshot = buildCommercialDisplaySnapshot({
    operation: input.operation,
    kind: "package",
    name: preview.proposedActivation.packageName,
    code: preview.proposedActivation.packageCode,
    dateFrom: preview.proposedActivation.validFrom,
    dateTo: preview.proposedActivation.validTo,
    active: preview.proposedActivation.active,
  });
  return {
    restaurantId: input.restaurantId,
    domain: "package_activation",
    actionType: input.operation,
    entityType: "package_activation",
    entityId: input.operation === "CREATE" ? null : (input.activationId ?? null),
    requestReason: input.reason ?? null,
    proposalPayload: payload,
    displaySnapshot: snapshot,
    expectedVersion:
      input.operation === "CREATE" ? COMMERCIAL_ABSENT_VERSION : preview.expectedVersion,
    summary: snapshot.summary,
  };
}

async function stalePackage(db: DbClient, proposal: unknown): Promise<RevenueApprovalStaleCheck> {
  const input = packageActivationProposalSchema.parse(proposal);
  const preview = await previewStoredPackageActivation(db, input);
  const stale = preview.errors.find((code) => isStaleDomainError(code));
  if (stale) return { stale: true, reason: stale };
  if (input.operation === "CREATE" && preview.currentActivation) {
    return { stale: true, reason: "COMMERCIAL_ACTIVATION_STALE" };
  }
  if (!packageActivationPreviewCanApply(preview)) {
    throw rateError(preview.errors[0] ?? "COMMERCIAL_OPERATION_INVALID");
  }
  return { stale: false };
}

const adapters: Record<RevenueApprovalDomain, RevenueApprovalDomainAdapter> = {
  rate: { domain: "rate", prepareSubmit: prepareRate, checkStale: staleRate },
  restriction: {
    domain: "restriction",
    prepareSubmit: prepareRestriction,
    checkStale: staleRestriction,
  },
  promotion_activation: {
    domain: "promotion_activation",
    prepareSubmit: preparePromotion,
    checkStale: stalePromotion,
  },
  package_activation: {
    domain: "package_activation",
    prepareSubmit: preparePackage,
    checkStale: stalePackage,
  },
};

export function getRevenueApprovalAdapter(
  domain: RevenueApprovalDomain,
): RevenueApprovalDomainAdapter {
  return adapters[domain];
}

export function parseStoredApprovalProposal(domain: RevenueApprovalDomain, payload: unknown) {
  return parseRevenueApprovalProposal(domain, payload);
}
