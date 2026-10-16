/**
 * FO Phase 8 — authorization/override (pure).
 * Model B: live staff-role authorization. pms_approval_rules is setup config, not an inbox.
 */
export const FO_LIVE_AUTHORIZER_ROLES = ["owner", "manager"] as const;

export const FO_AUTHORIZATION_KEYS = [
  "front_office.check_in.override",
  "front_office.check_out.override",
  "front_office.fee.override",
  "late_checkout.authorize",
  "cashiering.room_charge.override",
  "cashiering.discount.post",
  "cashiering.adjustment.post",
  "rates.calendar.override",
  "guest.restriction.authorize",
] as const;

export type FoAuthorizationKey = (typeof FO_AUTHORIZATION_KEYS)[number];

export const FO_AUTHORIZATION_META: Record<
  FoAuthorizationKey,
  {
    permissionCode: string | null;
    ownerModule: string;
    foCommand: boolean;
    title: string;
    reason: string;
  }
> = {
  "front_office.check_in.override": {
    permissionCode: "front_office.check_in.override",
    ownerModule: "front_office",
    foCommand: true,
    title: "Waive check-in step",
    reason: "Registration, deposit, or key waiver uses the live owner/manager staff role.",
  },
  "front_office.check_out.override": {
    permissionCode: "front_office.check_out.override",
    ownerModule: "front_office",
    foCommand: true,
    title: "Override checkout settlement",
    reason: "Leaving the folio open at check-out requires owner or manager authorization.",
  },
  "front_office.fee.override": {
    permissionCode: "front_office.fee.override",
    ownerModule: "front_office",
    foCommand: true,
    title: "Waive cancel / no-show fee",
    reason: "Fee waiver uses the live owner/manager staff role. Cashiering still owns posting.",
  },
  "late_checkout.authorize": {
    permissionCode: null,
    ownerModule: "front_office",
    foCommand: true,
    title: "Late checkout authorization",
    reason: "When the property policy requires approval, late checkout uses the owner/manager staff role.",
  },
  "cashiering.room_charge.override": {
    permissionCode: "cashiering.room_charge.override",
    ownerModule: "cashiering",
    foCommand: false,
    title: "Room-charge override",
    reason: "Cashiering owns room-charge reversal. Front Office does not post it.",
  },
  "cashiering.discount.post": {
    permissionCode: "cashiering.discount.post",
    ownerModule: "cashiering",
    foCommand: false,
    title: "Folio discount",
    reason: "Cashiering owns discounts. Front Office does not post them.",
  },
  "cashiering.adjustment.post": {
    permissionCode: "cashiering.adjustment.post",
    ownerModule: "cashiering",
    foCommand: false,
    title: "Folio adjustment",
    reason: "Cashiering owns adjustments. Front Office does not post them.",
  },
  "rates.calendar.override": {
    permissionCode: "rates.calendar.override",
    ownerModule: "rates",
    foCommand: false,
    title: "Rate calendar override",
    reason: "Rate & Revenue owns calendar overrides. Front Office does not price stays.",
  },
  "guest.restriction.authorize": {
    permissionCode: "guest.restriction.authorize",
    ownerModule: "guest_profile",
    foCommand: false,
    title: "Guest restriction authorization",
    reason: "Guest Profile owns restriction authorize. Front Office does not write it.",
  },
};

export type FoApprovalState = "authorized" | "authorization_required" | "not_authorized" | "not_configured" | "unsupported";

export type FoApprovalRequirement = {
  actionKey: FoAuthorizationKey;
  permissionCode: string | null;
  title: string;
  reason: string;
  ownerModule: string;
  foCommand: boolean;
  liveAuthz: "staff_role";
  liveAuthorizerRoles: readonly string[];
  catalogueConfigured: boolean;
  ruleConfigured: boolean;
  ruleActive: boolean;
  approverRoleName: string | null;
  thresholdAmount: number | null;
  thresholdUnit: "amount" | "percent" | null;
  thresholdSummary: string | null;
  policyNeedsApproval: boolean | null;
  directPermission: boolean;
  canCurrentUserAuthorize: boolean;
  approvalRequired: boolean;
  state: FoApprovalState;
  unavailable: boolean;
  unavailableMessage: string | null;
};

export function isFoLiveAuthorizer(role: string): boolean {
  return (FO_LIVE_AUTHORIZER_ROLES as readonly string[]).includes(role);
}

export function evaluateFoApprovalRequirement(input: {
  actionKey: FoAuthorizationKey;
  staffRole: string;
  catalogueConfigured: boolean;
  ruleActive: boolean;
  approverRoleName: string | null;
  thresholdAmount: number | null;
  thresholdUnit: "amount" | "percent" | null;
  amount: number | null;
  policyNeedsApproval: boolean | null;
  unavailable?: boolean;
  unavailableMessage?: string | null;
}): FoApprovalRequirement {
  const meta = FO_AUTHORIZATION_META[input.actionKey];
  const canAuthorize = isFoLiveAuthorizer(input.staffRole);
  const policyNeeds = input.actionKey === "late_checkout.authorize" ? input.policyNeedsApproval === true : true;
  const liveRequired = meta.foCommand && policyNeeds;
  const approvalRequired = liveRequired && !canAuthorize;
  const directPermission = liveRequired && canAuthorize;
  let state: FoApprovalState = "not_configured";
  if (input.unavailable) state = "unsupported";
  else if (!meta.foCommand) state = "unsupported";
  else if (!liveRequired) state = "authorized";
  else if (directPermission) state = "authorized";
  else if (approvalRequired) state = "authorization_required";
  else state = "not_authorized";

  let thresholdSummary: string | null = null;
  if (input.ruleActive && input.thresholdAmount != null && input.thresholdUnit) {
    thresholdSummary =
      input.thresholdUnit === "percent"
        ? `Configured threshold ${input.thresholdAmount}% (setup only — not live-enforced)`
        : `Configured threshold ${input.thresholdAmount} (setup only — not live-enforced)`;
  } else if (input.ruleActive) {
    thresholdSummary = "Approval rule is configured. Live authorization still uses the staff role.";
  }

  return {
    actionKey: input.actionKey,
    permissionCode: meta.permissionCode,
    title: meta.title,
    reason: meta.reason,
    ownerModule: meta.ownerModule,
    foCommand: meta.foCommand,
    liveAuthz: "staff_role",
    liveAuthorizerRoles: FO_LIVE_AUTHORIZER_ROLES,
    catalogueConfigured: input.catalogueConfigured,
    ruleConfigured: input.ruleActive,
    ruleActive: input.ruleActive,
    approverRoleName: input.approverRoleName,
    thresholdAmount: input.thresholdAmount,
    thresholdUnit: input.thresholdUnit,
    thresholdSummary,
    policyNeedsApproval: input.policyNeedsApproval,
    directPermission,
    canCurrentUserAuthorize: meta.foCommand && liveRequired ? canAuthorize : meta.foCommand && !liveRequired,
    approvalRequired,
    state,
    unavailable: input.unavailable === true,
    unavailableMessage: input.unavailableMessage ?? null,
  };
}

export function foAuthorizationButtonLabel(requirement: FoApprovalRequirement): string {
  if (!requirement.foCommand) return "Not a Front Office command";
  if (requirement.state === "unsupported") return "Not supported";
  if (requirement.approvalRequired) return "Requires approval";
  if (requirement.canCurrentUserAuthorize) return "Authorize";
  return "Not authorized";
}

export function foLateCheckoutRequiresApproval(needsApproval: boolean, staffRole: string): boolean {
  return needsApproval && !isFoLiveAuthorizer(staffRole);
}

export function foRequiresApprovalLabel(base: string, required: boolean): string {
  return required ? `${base} · Requires approval` : base;
}
