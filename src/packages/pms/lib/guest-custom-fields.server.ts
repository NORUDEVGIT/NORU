/**
 * Card 4 Phase 2 Hardening — Dynamic Guest Custom Fields Server Module.
 *
 * Pure module. Owns normalization, validation, and display formatting for
 * generic guest custom field values.
 *
 * Does not duplicate:
 * - Core mapped fields (stored on guest_profiles)
 * - Identity documents (stored on guest_documents)
 * - Account link relationships (stored on guest_account_links)
 */

import type { GuestFieldOption, GuestFieldRecord, GuestFieldType } from "./required-fields-card4.server.ts";

export type StoredCustomFieldValue = string | number | string[] | null;

export type ResolvedCustomFieldValue = {
  fieldId: string;
  code: string;
  name: string;
  fieldType: GuestFieldType;
  value: StoredCustomFieldValue;
  formattedValue: string;
  active: boolean;
};

/**
 * Normalizes an arbitrary raw value according to the target field type.
 */
export function normalizeCustomFieldValue(
  fieldType: GuestFieldType,
  raw: unknown,
): StoredCustomFieldValue {
  if (raw === null || raw === undefined) return null;

  switch (fieldType) {
    case "text":
    case "phone":
    case "email":
    case "address": {
      const s = String(raw).trim();
      return s.length > 0 ? s : null;
    }
    case "number": {
      if (typeof raw === "number") {
        return Number.isFinite(raw) ? raw : null;
      }
      const s = String(raw).trim();
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    case "date": {
      const s = String(raw).trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    }
    case "select": {
      const s = String(raw).trim();
      return s.length > 0 ? s : null;
    }
    case "multi_select": {
      if (!Array.isArray(raw)) {
        if (typeof raw === "string" && raw.trim()) {
          return [raw.trim()];
        }
        return [];
      }
      const cleaned = raw.map((item) => String(item).trim()).filter(Boolean);
      return [...new Set(cleaned)];
    }
    default:
      return null;
  }
}

/**
 * Validates a normalized custom field value against the field definition.
 */
export function validateCustomFieldValue(
  field: GuestFieldRecord,
  value: StoredCustomFieldValue,
  isNewEntry = false,
): string | null {
  // If field is inactive, it cannot accept newly introduced values
  if (!field.active && isNewEntry && value !== null && !(Array.isArray(value) && value.length === 0)) {
    return `${field.name} is inactive and cannot accept new values.`;
  }

  if (value === null || (Array.isArray(value) && value.length === 0)) {
    return null;
  }

  switch (field.fieldType) {
    case "text":
    case "address": {
      if (typeof value === "string" && value.length > 2000) {
        return `${field.name} cannot exceed 2000 characters.`;
      }
      return null;
    }
    case "email": {
      if (typeof value === "string") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return `${field.name} must be a valid email address.`;
        }
      }
      return null;
    }
    case "phone": {
      if (typeof value === "string" && value.length > 50) {
        return `${field.name} phone number is too long.`;
      }
      return null;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `${field.name} must be a valid number.`;
      }
      if (field.minValue !== null && value < field.minValue) {
        return `${field.name} cannot be less than ${field.minValue}.`;
      }
      if (field.maxValue !== null && value > field.maxValue) {
        return `${field.name} cannot be greater than ${field.maxValue}.`;
      }
      return null;
    }
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${field.name} must be a valid date in YYYY-MM-DD format.`;
      }
      return null;
    }
    case "select": {
      if (typeof value !== "string") return `${field.name} has an invalid selection.`;
      const activeOptions = new Set(
        field.options.filter((opt) => opt.active).map((opt) => opt.value),
      );
      // For existing historical entries, allow previously active options
      const allKnownOptions = new Set(field.options.map((opt) => opt.value));
      if (isNewEntry) {
        if (!activeOptions.has(value)) {
          return `Selected option for ${field.name} is not available.`;
        }
      } else {
        if (!allKnownOptions.has(value)) {
          return `Selected option for ${field.name} does not exist.`;
        }
      }
      return null;
    }
    case "multi_select": {
      if (!Array.isArray(value)) return `${field.name} has an invalid selection.`;
      const activeOptions = new Set(
        field.options.filter((opt) => opt.active).map((opt) => opt.value),
      );
      const allKnownOptions = new Set(field.options.map((opt) => opt.value));
      for (const item of value) {
        if (isNewEntry) {
          if (!activeOptions.has(item)) {
            return `Option "${item}" for ${field.name} is not available.`;
          }
        } else {
          if (!allKnownOptions.has(item)) {
            return `Option "${item}" for ${field.name} does not exist.`;
          }
        }
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Formats a stored value for display in guest detail and read-only views.
 */
export function formatCustomFieldValueForDisplay(
  field: { fieldType: GuestFieldType; options: GuestFieldOption[] },
  value: StoredCustomFieldValue,
): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    const optionMap = new Map(field.options.map((opt) => [opt.value, opt.label]));
    return value.map((val) => optionMap.get(val) ?? val).join(", ");
  }
  if (field.fieldType === "select") {
    const opt = field.options.find((o) => o.value === String(value));
    return opt ? opt.label : String(value);
  }
  return String(value);
}
