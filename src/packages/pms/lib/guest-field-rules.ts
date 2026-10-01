/**
 * Central Guest Field Rule Resolver & Validator.
 * Phase 4: Property Setup -> Guest Create / Edit / Check-In Field Rule Integration.
 *
 * Source of Truth Precedence:
 * 1. Card 4 / GuestWorkspaceConfig (primary policy source)
 * 2. Technical Minimum System Constraints (non-negotiable identity invariants)
 * 3. Legacy SET3 fallback (compatibility only when Card 4 is unseeded/empty)
 */

import type {
  GuestWorkspaceConfig,
  GuestWorkspaceIdentityDocTypeConfig,
  GuestWorkspaceRequiredFieldConfig,
  GuestWorkspaceTypeConfig,
} from "./guest-workspace-config.functions";
import type { GuestDocument, GuestProfile, GuestSummary } from "./guests.functions";
import {
  GUEST_GENDER_LABELS,
  GUEST_GENDERS,
  GUEST_TITLE_LABELS,
  GUEST_TITLES,
} from "./guest-profile-individual";
import {
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_METHODS,
  PREFERRED_CONTACT_TIME_LABELS,
  PREFERRED_CONTACT_TIMES,
} from "./guest-profile-overview";
import { ISO_COUNTRIES } from "./pms-geography";
import { guestCreateBlocked, type GuestProfileRules } from "./pms-set3-rates-guest";

export type GuestFieldContext = "profile_create" | "profile_edit" | "reservation" | "check_in";

export type NormalizedFieldOption = {
  id: string;
  label: string;
  value: string;
  active: boolean;
};

export type CanonicalGuestFieldKey =
  | "firstName"
  | "middleName"
  | "lastName"
  | "preferredName"
  | "title"
  | "gender"
  | "dateOfBirth"
  | "nationality"
  | "language"
  | "phone"
  | "phoneAlt"
  | "email"
  | "emailAlt"
  | "preferredContactMethod"
  | "preferredContactTime"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "region"
  | "country"
  | "postalCode"
  | "position"
  | "department"
  | "sourceOfBusiness"
  | "documents"
  | "company";

export type GuestFieldCategory = "core_mapped" | "custom_value" | "document" | "lookup";

export type ResolvedGuestFieldRule = {
  id: string;
  code: string;
  canonicalKey: CanonicalGuestFieldKey | null;
  category: GuestFieldCategory;
  label: string;
  fieldType: string;
  active: boolean;
  required: boolean;
  requiredForContext: boolean;
  displayOrder: number;
  options: NormalizedFieldOption[];
  isTechnicalMinimum: boolean;
  isUnsupported: boolean;
  minValue?: number | null;
  maxValue?: number | null;
};

export function classifyGuestField(code: string, fieldType: string): GuestFieldCategory {
  const codeUpper = code.toUpperCase();
  if (CANONICAL_FIELD_CODE_MAP[codeUpper]) return "core_mapped";
  if (fieldType === "document") return "document";
  if (fieldType === "lookup") return "lookup";
  return "custom_value";
}

/**
 * Canonical mapping between Card 4 configured field codes and operational guest keys.
 */
export const CANONICAL_FIELD_CODE_MAP: Record<string, CanonicalGuestFieldKey> = {
  FIRST_NAME: "firstName",
  MIDDLE_NAME: "middleName",
  LAST_NAME: "lastName",
  PREFERRED_NAME: "preferredName",
  TITLE: "title",
  GENDER: "gender",
  DOB: "dateOfBirth",
  DATE_OF_BIRTH: "dateOfBirth",
  NATIONALITY: "nationality",
  LANGUAGE: "language",
  PHONE: "phone",
  PHONE_ALT: "phoneAlt",
  EMAIL: "email",
  EMAIL_ALT: "emailAlt",
  PREFERRED_CONTACT_METHOD: "preferredContactMethod",
  PREFERRED_CONTACT_TIME: "preferredContactTime",
  ADDRESS: "addressLine1",
  ADDRESS_LINE_1: "addressLine1",
  ADDRESS_LINE_2: "addressLine2",
  CITY: "city",
  REGION: "region",
  COUNTRY: "country",
  POSTAL_CODE: "postalCode",
  POSITION: "position",
  DEPARTMENT: "department",
  SOURCE_OF_BUSINESS: "sourceOfBusiness",
  IDENTITY_DOCUMENT: "documents",
  COMPANY: "company",
};

/**
 * Technical minimum invariants:
 * Fundamental identity constraints that cannot be bypassed even if unconfigured in Property Setup.
 */
export const TECHNICAL_MINIMUM_FIELD_CODES = new Set<string>(["FIRST_NAME"]);

/**
 * Normalizes Card 4 field options into a consistent object structure.
 * Handles legacy string arrays, partial objects, or raw database jsonb.
 */
export function normalizeFieldOptions(
  rawOptions: unknown,
  fallbackEnum?: readonly string[],
  fallbackLabels?: Record<string, string>,
): NormalizedFieldOption[] {
  if (Array.isArray(rawOptions) && rawOptions.length > 0) {
    return rawOptions.map((opt, index) => {
      if (typeof opt === "string") {
        return {
          id: `opt-${index}-${opt}`,
          label: fallbackLabels?.[opt] ?? opt,
          value: opt,
          active: true,
        };
      }
      if (opt && typeof opt === "object") {
        const item = opt as Record<string, unknown>;
        const value = String(item["value"] ?? item["id"] ?? item["name"] ?? index);
        const label = String(item["label"] ?? item["name"] ?? value);
        return {
          id: String(item["id"] ?? `opt-${index}-${value}`),
          label: label.trim() || value,
          value: value.trim(),
          active: item["active"] !== false,
        };
      }
      return {
        id: `opt-${index}`,
        label: String(opt),
        value: String(opt),
        active: true,
      };
    });
  }

  // Precedence 2: Authoritative shared NORU enum where intentionally configured
  if (fallbackEnum && fallbackEnum.length > 0) {
    return fallbackEnum.map((val) => ({
      id: `builtin-${val}`,
      label: fallbackLabels?.[val] ?? val,
      value: val,
      active: true,
    }));
  }

  return [];
}

/**
 * Resolves default fallback options for canonical fields where setup options are not supplied.
 */
export function resolveFallbackOptionsForField(code: string): NormalizedFieldOption[] {
  switch (code) {
    case "TITLE":
      return GUEST_TITLES.map((t) => ({
        id: `title-${t}`,
        label: GUEST_TITLE_LABELS[t] ?? t,
        value: t,
        active: true,
      }));
    case "GENDER":
      return GUEST_GENDERS.map((g) => ({
        id: `gender-${g}`,
        label: GUEST_GENDER_LABELS[g] ?? g,
        value: g,
        active: true,
      }));
    case "PREFERRED_CONTACT_METHOD":
      return PREFERRED_CONTACT_METHODS.map((m) => ({
        id: `pcm-${m}`,
        label: PREFERRED_CONTACT_METHOD_LABELS[m] ?? m,
        value: m,
        active: true,
      }));
    case "PREFERRED_CONTACT_TIME":
      return PREFERRED_CONTACT_TIMES.map((t) => ({
        id: `pct-${t}`,
        label: PREFERRED_CONTACT_TIME_LABELS[t] ?? t,
        value: t,
        active: true,
      }));
    case "NATIONALITY":
    case "COUNTRY":
      return ISO_COUNTRIES.map((c) => ({
        id: `iso-${c.code}`,
        label: c.name,
        value: c.code,
        active: true,
      }));
    default:
      return [];
  }
}

/**
 * Checks whether the Individual profile type is active in Property Setup.
 */
export function isIndividualProfileTypeActive(
  config: GuestWorkspaceConfig | null | undefined,
): boolean {
  if (!config?.types || config.types.length === 0) return true;
  const individual = config.types.find(
    (t) => t.domain === "individual" || t.code?.toUpperCase() === "INDIVIDUAL",
  );
  if (!individual) return true;
  return individual.active;
}

/**
 * Resolves the active Individual profile type configuration from GuestWorkspaceConfig.
 */
export function resolveIndividualProfileType(
  config: GuestWorkspaceConfig | null | undefined,
): GuestWorkspaceTypeConfig | null {
  if (!config?.types) return null;
  const individual = config.types.find(
    (t) => (t.domain === "individual" || t.code?.toUpperCase() === "INDIVIDUAL") && t.active,
  );
  return (
    individual ??
    config.types.find((t) => t.domain === "individual" || t.code?.toUpperCase() === "INDIVIDUAL") ??
    null
  );
}

/**
 * Resolves whether an identity document type is eligible for a given profile type.
 * Enforces bidirectional check:
 * 1. profileType.documentTypeIds (if configured)
 * 2. docType.validForProfileTypeIds (if configured)
 */
export function isDocumentTypeAllowedForProfileType(
  docType: { id: string; active?: boolean; validForProfileTypeIds?: string[] | null },
  profileType: { id: string; documentTypeIds?: string[] | null } | null | undefined,
): boolean {
  if (docType.active === false) return false;
  if (!profileType) return true;

  // 1. If profileType lists documentTypeIds, docType must be in the list
  if (Array.isArray(profileType.documentTypeIds) && profileType.documentTypeIds.length > 0) {
    if (!profileType.documentTypeIds.includes(docType.id)) {
      return false;
    }
  }

  // 2. If docType lists validForProfileTypeIds, profileType must be in the list
  if (Array.isArray(docType.validForProfileTypeIds) && docType.validForProfileTypeIds.length > 0) {
    if (!docType.validForProfileTypeIds.includes(profileType.id)) {
      return false;
    }
  }

  return true;
}

/**
 * Central field rule resolver.
 * Merges Card 4 fields with profile type configurations and operational context.
 */
export function resolveGuestFieldRules(
  config: GuestWorkspaceConfig | null | undefined,
  profileType: GuestWorkspaceTypeConfig | null | undefined,
  context: GuestFieldContext,
): ResolvedGuestFieldRule[] {
  const fields =
    config?.requiredFields ??
    (config as unknown as { fields?: GuestWorkspaceRequiredFieldConfig[] })?.fields ??
    [];
  const typeRequiredIds = new Set(profileType?.requiredFieldIds ?? []);

  const rules: ResolvedGuestFieldRule[] = [];
  const coveredCodes = new Set<string>();

  for (const field of fields) {
    const code = field.code?.toUpperCase() || "";
    coveredCodes.add(code);
    const canonicalKey = CANONICAL_FIELD_CODE_MAP[code] ?? null;
    const isTechnicalMinimum = TECHNICAL_MINIMUM_FIELD_CODES.has(code);

    // Profile-Type participation:
    // Required at create if field.required === true OR profileType.requiredFieldIds includes field.id
    const isTypeRequired = typeRequiredIds.has(field.id);
    const effectiveCreateRequired = (field.required || isTypeRequired) && field.active;

    let requiredForContext = false;
    switch (context) {
      case "profile_create":
        requiredForContext = effectiveCreateRequired || isTechnicalMinimum;
        break;
      case "profile_edit":
        // Editing an existing guest does not enforce reservation or check-in requirements
        requiredForContext = isTechnicalMinimum;
        break;
      case "reservation":
        requiredForContext = field.reservation && field.active;
        break;
      case "check_in":
        requiredForContext = field.checkIn && field.active;
        break;
    }

    // Normalized options: Card 4 options first, then shared enum fallbacks
    const normalizedOptions = normalizeFieldOptions(field.options, undefined, undefined);
    const options =
      normalizedOptions.length > 0 ? normalizedOptions : resolveFallbackOptionsForField(code);

    const category = classifyGuestField(code, field.fieldType);

    rules.push({
      id: field.id,
      code,
      canonicalKey,
      category,
      label: field.name,
      fieldType: field.fieldType,
      active: field.active,
      required: field.required || isTypeRequired,
      requiredForContext,
      displayOrder: field.displayOrder ?? 0,
      options,
      isTechnicalMinimum,
      isUnsupported: false,
      minValue: (field as { minValue?: number | null }).minValue ?? null,
      maxValue: (field as { maxValue?: number | null }).maxValue ?? null,
    });
  }

  // Always ensure technical minimum fields exist even if completely unseeded in Card 4
  for (const minCode of TECHNICAL_MINIMUM_FIELD_CODES) {
    if (!coveredCodes.has(minCode)) {
      rules.unshift({
        id: `tech-min-${minCode}`,
        code: minCode,
        canonicalKey: CANONICAL_FIELD_CODE_MAP[minCode] ?? "firstName",
        category: "core_mapped",
        label: minCode === "FIRST_NAME" ? "First Name" : minCode,
        fieldType: "text",
        active: true,
        required: true,
        requiredForContext: true,
        displayOrder: -1,
        options: [],
        isTechnicalMinimum: true,
        isUnsupported: false,
      });
    }
  }

  return rules.sort((a, b) => a.displayOrder - b.displayOrder);
}

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  missingFieldCodes: string[];
};

/**
 * Validates a guest data object against resolved field rules for the given context.
 */
export function validateGuestFields(
  values: Record<string, unknown>,
  rules: ResolvedGuestFieldRule[],
  context: GuestFieldContext,
  set3Fallback?: GuestProfileRules | null,
  customFieldValues?: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];
  const missingFieldCodes: string[] = [];

  // Check if Card 4 has any active configured fields (excluding synthetic tech-min)
  const hasConfiguredCard4Fields = rules.some((r) => !r.id.startsWith("tech-min-") && r.active);

  // If Card 4 is completely unseeded/empty, use legacy SET3 fallback
  if (!hasConfiguredCard4Fields && set3Fallback?.savedAt) {
    const blocked = guestCreateBlocked(set3Fallback, {
      firstName: String(values["firstName"] ?? ""),
      lastName: String(values["lastName"] ?? ""),
      phone: String(values["phone"] ?? ""),
      email: String(values["email"] ?? ""),
    });
    if (blocked) {
      return { valid: false, errors: [blocked], missingFieldCodes: ["SET3_FALLBACK"] };
    }
    return { valid: true, errors: [], missingFieldCodes: [] };
  }

  for (const rule of rules) {
    if (!rule.requiredForContext) continue;

    // Document & relationship lookup fields are resolved in their specialized check routines
    if (rule.category === "document" || rule.category === "lookup") continue;

    let val: unknown;
    if (rule.category === "core_mapped" && rule.canonicalKey) {
      val = values[rule.canonicalKey];
    } else {
      // Custom field: check customFieldValues or values by id, code, or lowercase code
      val =
        customFieldValues?.[rule.id] ??
        customFieldValues?.[rule.code] ??
        customFieldValues?.[rule.code.toLowerCase()] ??
        values[rule.code] ??
        values[rule.code.toLowerCase()] ??
        values[rule.id];
    }

    let isBlank = false;
    if (val === null || val === undefined) {
      isBlank = true;
    } else if (typeof val === "string") {
      isBlank = val.trim() === "";
    } else if (Array.isArray(val)) {
      isBlank = val.length === 0;
    }

    if (isBlank) {
      missingFieldCodes.push(rule.code);
      errors.push(`${rule.label} is required.`);
    } else if (rule.category === "custom_value") {
      // Format validation for non-blank custom values
      if (rule.fieldType === "email" && typeof val === "string" && val.trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
          errors.push(`${rule.label} must be a valid email address.`);
        }
      } else if (rule.fieldType === "number") {
        const num = typeof val === "number" ? val : Number(val);
        if (!Number.isFinite(num)) {
          errors.push(`${rule.label} must be a number.`);
        } else {
          if (rule.minValue !== null && rule.minValue !== undefined && num < rule.minValue) {
            errors.push(`${rule.label} cannot be less than ${rule.minValue}.`);
          }
          if (rule.maxValue !== null && rule.maxValue !== undefined && num > rule.maxValue) {
            errors.push(`${rule.label} cannot be greater than ${rule.maxValue}.`);
          }
        }
      } else if (rule.fieldType === "date" && typeof val === "string" && val.trim()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
          errors.push(`${rule.label} must be a valid date in YYYY-MM-DD format.`);
        }
      } else if (rule.fieldType === "select" && typeof val === "string" && val.trim()) {
        const allowed = new Set(rule.options.map((opt) => opt.value));
        if (allowed.size > 0 && !allowed.has(val.trim())) {
          errors.push(`Selected option for ${rule.label} is invalid.`);
        }
      } else if (rule.fieldType === "multi_select" && Array.isArray(val) && val.length > 0) {
        const allowed = new Set(rule.options.map((opt) => opt.value));
        if (allowed.size > 0) {
          for (const item of val) {
            if (!allowed.has(String(item))) {
              errors.push(`Option "${item}" for ${rule.label} is invalid.`);
            }
          }
        }
      }
    }
  }

  // Cross-field technical minimum: valid email or phone format if provided
  if (typeof values["email"] === "string" && values["email"].trim()) {
    const email = values["email"].trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Invalid email address format.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    missingFieldCodes,
  };
}

/**
 * Validates reservation requirements for a guest.
 * Returns missing required fields if any.
 */
export function validateReservationGuestRequirements(
  guest: GuestProfile | GuestSummary | null | undefined,
  config: GuestWorkspaceConfig | null | undefined,
  profileType?: GuestWorkspaceTypeConfig | null,
  customFieldValues?: Record<string, unknown>,
): ValidationResult {
  if (!guest) {
    return { valid: false, errors: ["No guest selected."], missingFieldCodes: ["GUEST"] };
  }

  const pType = profileType ?? resolveIndividualProfileType(config);
  const rules = resolveGuestFieldRules(config, pType, "reservation");

  // Cast guest to generic dictionary for validation
  const dict = guest as unknown as Record<string, unknown>;
  return validateGuestFields(dict, rules, "reservation", null, customFieldValues);
}

export type CheckInDocumentCandidate = {
  id?: string;
  typeId?: string | null;
  kind?: string | null;
  documentNumberMasked?: string | null;
  documentNumber?: string | null;
  issuingCountry?: string | null;
  expiryDate?: string | null;
  [key: string]: unknown;
};

/**
 * Validates Front Office check-in requirements:
 * 1. Checks check_in field requirements on the guest (core and custom).
 * 2. Checks identity document requirements (if any active doc type has requiredAtCheckIn).
 */
export function validateGuestCheckInRequirements(params: {
  guest: GuestProfile | GuestSummary | null | undefined;
  documents: CheckInDocumentCandidate[];
  config: GuestWorkspaceConfig | null | undefined;
  profileType?: GuestWorkspaceTypeConfig | null;
  today?: string;
  customFieldValues?: Record<string, unknown>;
}): ValidationResult {
  const { guest, documents, config, customFieldValues } = params;
  if (!guest) {
    return { valid: false, errors: ["No guest profile on file."], missingFieldCodes: ["GUEST"] };
  }

  const pType = params.profileType ?? resolveIndividualProfileType(config);
  const rules = resolveGuestFieldRules(config, pType, "check_in");

  const dict = guest as unknown as Record<string, unknown>;
  const fieldValidation = validateGuestFields(dict, rules, "check_in", null, customFieldValues);
  const errors = [...fieldValidation.errors];
  const missingFieldCodes = [...fieldValidation.missingFieldCodes];

  // Property date in YYYY-MM-DD form
  const today = params.today ?? new Date().toISOString().slice(0, 10);

  // Identity document check-in requirement
  const checkInDocTypes = (
    config?.identityDocumentTypes ??
    (config as unknown as { idDocs?: GuestWorkspaceIdentityDocTypeConfig[] })?.idDocs ??
    []
  ).filter(
    (d: GuestWorkspaceIdentityDocTypeConfig) =>
      d.active && d.requiredAtCheckIn && isDocumentTypeAllowedForProfileType(d, pType),
  );

  if (checkInDocTypes.length > 0) {
    const matchingDocs = documents.filter((doc) =>
      checkInDocTypes.some((t) => t.id === doc.typeId || t.code === doc.kind),
    );

    if (matchingDocs.length === 0) {
      missingFieldCodes.push("IDENTITY_DOCUMENT");
      errors.push("An identity document is required for check-in.");
    } else {
      let hasValidDoc = false;
      const failureReasons: Array<
        "expired" | "missing_expiry" | "missing_country" | "missing_number"
      > = [];

      for (const doc of matchingDocs) {
        const typeConfig = checkInDocTypes.find((t) => t.id === doc.typeId || t.code === doc.kind)!;
        const hasNumber = Boolean(
          (
            doc.documentNumberMasked ??
            doc.documentNumber ??
            ((doc as Record<string, unknown>)["document_number"] as string | null)
          )?.trim(),
        );
        const hasCountry = Boolean(
          (
            doc.issuingCountry ??
            ((doc as Record<string, unknown>)["issuing_country"] as string | null)
          )?.trim(),
        );
        const rawExpiry =
          doc.expiryDate ?? ((doc as Record<string, unknown>)["expiry_date"] as string | null);
        const expiry = typeof rawExpiry === "string" ? rawExpiry.trim() || null : null;

        if (typeConfig.documentNumberRequired && !hasNumber) {
          failureReasons.push("missing_number");
          continue;
        }
        if (typeConfig.issuingCountryRequired && !hasCountry) {
          failureReasons.push("missing_country");
          continue;
        }
        if (typeConfig.expiryDateRequired && !expiry) {
          failureReasons.push("missing_expiry");
          continue;
        }
        if (expiry && expiry < today) {
          failureReasons.push("expired");
          continue;
        }

        hasValidDoc = true;
        break;
      }

      if (!hasValidDoc) {
        missingFieldCodes.push("IDENTITY_DOCUMENT");
        if (
          failureReasons.includes("expired") &&
          !failureReasons.some((r) => r.startsWith("missing_"))
        ) {
          errors.push("An unexpired identity document is required for check-in.");
        } else if (failureReasons.includes("missing_number")) {
          errors.push("Identity document number is required for check-in.");
        } else if (failureReasons.includes("missing_country")) {
          errors.push("Identity document issuing country is required for check-in.");
        } else if (failureReasons.includes("missing_expiry")) {
          errors.push("Identity document expiry date is required for check-in.");
        } else if (failureReasons.includes("expired")) {
          errors.push("An unexpired identity document is required for check-in.");
        } else {
          errors.push("An identity document is required for check-in.");
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    missingFieldCodes,
  };
}
