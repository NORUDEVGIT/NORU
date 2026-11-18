/**
 * Plain-language messages for Property Setup forms.
 * Zod and Postgres text stay on the server; the screen shows what to fix.
 */

import { suggestTaxSetupCode } from "./taxes-card3-code.ts";

const FIELD_LABELS: Record<string, string> = {
  code: "Code",
  name: "Name",
  description: "Description",
  contractType: "Contract type",
  sortOrder: "Sequence",
  displayOrder: "Display order",
  defaultValidityDays: "Default validity",
  defaultPrice: "Default price",
  defaultProbability: "Default probability",
  validFrom: "Valid from",
  validTo: "Valid to",
  depositValue: "Deposit amount",
  depositType: "Deposit type",
  currencyCode: "Currency",
  paymentTerms: "Payment terms",
  cancellationPolicy: "Cancellation policy",
  pricingMethod: "Pricing method",
  eventTypeId: "Event type",
  taxGroupId: "Tax group",
  categoryId: "Category",
  departmentType: "Department type",
  facilityTypeCode: "Facility type",
  minStayNights: "Minimum stay",
  restrictionKind: "Restriction type",
};

type ZodIssue = {
  code?: string;
  message?: string;
  path?: Array<string | number>;
  minimum?: number;
  maximum?: number;
  type?: string;
};

export function setupCodeFromName(
  name: string,
  options?: { max?: number; style?: "underscore" | "compact" },
): string {
  if (options?.style === "compact") {
    const max = options.max ?? 12;
    return name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, max);
  }
  const max = options?.max ?? 20;
  const code = suggestTaxSetupCode(name);
  if (code.length <= max) return code;
  return code.slice(0, max).replace(/_+$/g, "");
}

export function draftWithGeneratedCode<T extends { id?: string | null; code: string }>(
  previous: T,
  key: keyof T & string,
  value: T[keyof T],
  options: {
    codeTouched: boolean;
    style?: "underscore" | "compact";
    max?: number;
    normalize?: (code: string) => string;
  },
): T {
  const next = { ...previous, [key]: value };
  if (key !== "name" || options.codeTouched || previous.id) return next;
  const generated = setupCodeFromName(String(value ?? ""), {
    style: options.style,
    max: options.max,
  });
  next.code = options.normalize ? options.normalize(generated) : generated;
  return next;
}

function fieldLabel(path: Array<string | number> | undefined): string {
  const key = [...(path ?? [])].reverse().find((part) => typeof part === "string");
  if (typeof key !== "string") return "This field";
  return FIELD_LABELS[key] ?? key.replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function rewriteIssue(issue: ZodIssue): string {
  const label = fieldLabel(issue.path);
  const message = issue.message?.trim() ?? "";
  if (
    message &&
    !/^string must contain at least 1 character/i.test(message) &&
    !/^required$/i.test(message) &&
    !/^invalid$/i.test(message) &&
    !/^expected .+ received /i.test(message) &&
    !/^invalid input/i.test(message) &&
    !/^invalid string/i.test(message)
  ) {
    if (/^[a-z]/.test(message)) return `${label}: ${message.charAt(0).toUpperCase()}${message.slice(1)}`;
    return message;
  }
  if (issue.code === "too_small" && issue.type === "string" && (issue.minimum ?? 1) <= 1) {
    return `${label} is required.`;
  }
  if (issue.code === "too_small" && issue.type === "string") {
    return `${label} must be at least ${issue.minimum} characters.`;
  }
  if (issue.code === "too_big" && issue.type === "string") {
    return `${label} must be ${issue.maximum} characters or fewer.`;
  }
  if (issue.code === "too_small" && (issue.type === "number" || issue.type === "integer")) {
    return `${label} must be at least ${issue.minimum}.`;
  }
  if (issue.code === "invalid_type" || /received undefined|received null/i.test(message)) {
    return `${label} is required.`;
  }
  if (issue.code === "invalid_string" || /invalid string/i.test(message)) {
    if (issue.path?.includes("currencyCode")) return "Choose a 3-letter currency code.";
    return `${label} can use letters, numbers, and underscores only.`;
  }
  if (/at least 1 character/i.test(message) || /^required$/i.test(message)) {
    return `${label} is required.`;
  }
  return message ? `${label}: ${message}` : `${label} needs to be corrected.`;
}

function issuesFromMessage(raw: string): ZodIssue[] | null {
  const start = raw.indexOf("[");
  if (start < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(start)) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((item) => item && typeof item === "object" && "message" in item)) return null;
    return parsed as ZodIssue[];
  } catch {
    return null;
  }
}

function looksTechnical(message: string): boolean {
  return /duplicate key|unique constraint|violates|null value in column|invalid input syntax|value too long|check constraint|foreign key|relation "|column "|PGRST|22P02|23502|23503|23505|23514|zod|syntax error|failed query/i.test(
    message,
  );
}

export function friendlySetupError(error: unknown, fallback = "Please check the form and try again."): string {
  const raw = (error instanceof Error ? error.message : String(error ?? "")).trim();
  if (!raw) return fallback;

  const issues = issuesFromMessage(raw);
  if (issues) {
    const lines = [...new Set(issues.map(rewriteIssue))].slice(0, 3);
    return lines.join(" ");
  }

  if (/duplicate key|unique constraint|23505|already exists|already used/i.test(raw)) {
    if (/code/i.test(raw)) return "That code is already used. Change the name or code and try again.";
    if (/name/i.test(raw)) return "That name is already used. Choose a different name.";
    return "That record already exists. Change the name or code and try again.";
  }
  if (/null value in column|23502|not-null/i.test(raw)) {
    return "A required field is missing. Fill it in and try again.";
  }
  if (/value too long|22001/i.test(raw)) {
    return "One of the fields is too long. Shorten it and try again.";
  }
  if (/invalid input syntax|22P02/i.test(raw)) {
    return "One of the fields has a value this form cannot save. Check numbers and dates.";
  }
  if (/foreign key|23503/i.test(raw)) {
    return "That choice is no longer available. Pick another option and try again.";
  }
  if (/check constraint|23514/i.test(raw)) {
    return "One of the values is not allowed. Check the form and try again.";
  }
  if (looksTechnical(raw) || raw.startsWith("{") || raw.startsWith("[")) return fallback;
  return raw;
}
