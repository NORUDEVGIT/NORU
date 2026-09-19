/**
 * Card 4 Phase 6 — Company & Business types and validation.
 *
 * Property Setup catalogue only. Distinct from pms_guest_profile_types.
 * Does not store company billing, credit ledgers, or operational guest records.
 */

export type BusinessProfileTypeRecord = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  requiredFieldIds: string[];
  staleRequiredFieldIds: string[];
  taxIdRequired: boolean;
  contactRequired: boolean;
  creditAccountAllowed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BusinessProfileSettings = {
  enabled: boolean;
  defaultBusinessTypeId: string | null;
  autoApproval: boolean;
  defaultInvalid: boolean;
};

export type BusinessFieldOption = {
  id: string;
  name: string;
  code: string;
  active: boolean;
};

export type BusinessProfileTypeDraft = {
  id: string | null;
  name: string;
  code: string;
  description: string;
  active: boolean;
  requiredFieldIds: string[];
  taxIdRequired: boolean;
  contactRequired: boolean;
  creditAccountAllowed: boolean;
};

export type BusinessProfileSnapshot = {
  types: BusinessProfileTypeRecord[];
  settings: BusinessProfileSettings;
  fields: BusinessFieldOption[];
  lastUpdatedAt: string | null;
};

export type BusinessProfileError = { field: string; message: string };

export const DEFAULT_BUSINESS_PROFILE_TYPES = [
  {
    name: "Corporate Company",
    code: "CORP",
    description: "Corporate companies and business clients.",
    taxIdRequired: true,
    contactRequired: true,
    creditAccountAllowed: true,
  },
  {
    name: "Government",
    code: "GOV",
    description: "Government agencies and public institutions.",
    taxIdRequired: true,
    contactRequired: true,
    creditAccountAllowed: true,
  },
  {
    name: "NGO",
    code: "NGO",
    description: "Non-governmental and non-profit organisations.",
    taxIdRequired: true,
    contactRequired: true,
    creditAccountAllowed: false,
  },
  {
    name: "Travel Agency",
    code: "TRA",
    description: "Travel agencies booking on behalf of guests.",
    taxIdRequired: true,
    contactRequired: true,
    creditAccountAllowed: true,
  },
  {
    name: "Tour Operator",
    code: "TOU",
    description: "Tour operators and package organisers.",
    taxIdRequired: true,
    contactRequired: true,
    creditAccountAllowed: true,
  },
  {
    name: "DMC",
    code: "DMC",
    description: "Destination management companies.",
    taxIdRequired: true,
    contactRequired: true,
    creditAccountAllowed: true,
  },
  {
    name: "Wholesale Partner",
    code: "WHL",
    description: "Wholesale and contracted distribution partners.",
    taxIdRequired: true,
    contactRequired: true,
    creditAccountAllowed: true,
  },
] as const;

export const DEFAULT_BUSINESS_FIELDS = [
  { name: "Company Name", code: "COMPANY_NAME", fieldType: "text" as const },
  { name: "Tax ID", code: "TAX_ID", fieldType: "text" as const },
  { name: "Contact Person", code: "CONTACT_PERSON", fieldType: "text" as const },
  { name: "Business Address", code: "BUSINESS_ADDRESS", fieldType: "address" as const },
  { name: "Business License", code: "BUSINESS_LICENSE", fieldType: "text" as const },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeBusinessTypeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeBusinessTypeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function emptyBusinessTypeDraft(): BusinessProfileTypeDraft {
  return {
    id: null,
    name: "",
    code: "",
    description: "",
    active: true,
    requiredFieldIds: [],
    taxIdRequired: true,
    contactRequired: true,
    creditAccountAllowed: false,
  };
}

export function emptyBusinessSettings(): BusinessProfileSettings {
  return {
    enabled: true,
    defaultBusinessTypeId: null,
    autoApproval: false,
    defaultInvalid: false,
  };
}

export function validateBusinessTypeDraft(
  draft: BusinessProfileTypeDraft,
  existing: readonly {
    id: string;
    name: string;
    code: string;
    active: boolean;
  }[],
  fields: readonly { id: string; active: boolean }[],
): BusinessProfileError[] {
  const errors: BusinessProfileError[] = [];
  const name = normalizeBusinessTypeName(draft.name);
  const code = normalizeBusinessTypeCode(draft.code);
  if (!name) errors.push({ field: "name", message: "Please enter a business type name." });
  else if (name.length > 80) errors.push({ field: "name", message: "Name is too long." });
  if (!code) errors.push({ field: "code", message: "Code is required." });
  else if (!/^[A-Z][A-Z0-9]{1,11}$/.test(code)) {
    errors.push({
      field: "code",
      message: "Use 2–12 letters or numbers, starting with a letter.",
    });
  }
  const others = existing.filter((row) => row.id !== draft.id);
  if (others.some((row) => normalizeBusinessTypeCode(row.code) === code)) {
    errors.push({ field: "code", message: "This code is already in use." });
  }
  if (
    draft.active &&
    others.some(
      (row) =>
        row.active && normalizeBusinessTypeName(row.name).toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.push({
      field: "name",
      message: "An active business type with this name already exists.",
    });
  }
  if (draft.requiredFieldIds.length === 0) {
    errors.push({ field: "requiredFieldIds", message: "Select at least one required field." });
  }
  const fieldById = new Map(fields.map((row) => [row.id, row]));
  const missing = draft.requiredFieldIds.filter((id) => !UUID.test(id) || !fieldById.has(id));
  if (missing.length > 0) {
    errors.push({
      field: "requiredFieldIds",
      message: "A selected required field is no longer in the catalogue.",
    });
  }
  const inactiveSelected = draft.requiredFieldIds.filter(
    (id) => fieldById.get(id)?.active === false,
  );
  if (inactiveSelected.length > 0) {
    errors.push({
      field: "requiredFieldIds",
      message: "Remove inactive required fields before saving.",
    });
  }
  return errors;
}

export function validateBusinessSettings(
  settings: Pick<BusinessProfileSettings, "enabled" | "defaultBusinessTypeId">,
  types: readonly { id: string; active: boolean }[],
): BusinessProfileError[] {
  const errors: BusinessProfileError[] = [];
  if (!settings.enabled) return errors;
  const active = types.filter((row) => row.active);
  if (active.length === 0) {
    errors.push({
      field: "defaultBusinessTypeId",
      message: "No active business types configured.",
    });
    return errors;
  }
  if (!settings.defaultBusinessTypeId) {
    errors.push({
      field: "defaultBusinessTypeId",
      message: "Choose an active default business type.",
    });
    return errors;
  }
  const selected = types.find((row) => row.id === settings.defaultBusinessTypeId);
  if (!selected || !selected.active) {
    errors.push({
      field: "defaultBusinessTypeId",
      message: "The default business type must be an active configured type.",
    });
  }
  return errors;
}

export function companyBusinessConfigured(
  types: readonly BusinessProfileTypeRecord[],
  settings: BusinessProfileSettings,
): boolean {
  if (types.length === 0) return false;
  if (!settings.enabled) return true;
  return Boolean(
    settings.defaultBusinessTypeId &&
    types.some((row) => row.id === settings.defaultBusinessTypeId && row.active),
  );
}

export function settingsDefaultInvalid(
  defaultBusinessTypeId: string | null,
  types: readonly { id: string; active: boolean }[],
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (!defaultBusinessTypeId) return types.some((row) => row.active);
  const selected = types.find((row) => row.id === defaultBusinessTypeId);
  return !selected || !selected.active;
}

export function staleRequiredFieldIds(
  requiredFieldIds: string[],
  fields: readonly { id: string; active: boolean }[],
): string[] {
  const byId = new Map(fields.map((row) => [row.id, row]));
  return requiredFieldIds.filter((id) => {
    const field = byId.get(id);
    return !field || !field.active;
  });
}
