/**
 * Guest Agreement draft, publish, and check-in projection rules.
 * Property Setup owns check-in and check-out times. This module only snapshots them.
 */
import { normalizeClock } from "@/packages/pms/lib/pms-set1-foundation";
import type {
  CheckInAgreementAcknowledgement,
  CheckInAgreementVersion,
} from "@/packages/pms/lib/fo-check-in-agreement";

export type GuestAgreementSection = {
  id: string;
  title: string;
  descriptionTemplate: string;
  resolvedDescription: string | null;
  enabled: boolean;
  displayOrder: number;
};

export type GuestAgreementAcknowledgementDef = {
  id: string;
  title: string;
  statement: string;
  enabled: boolean;
  required: boolean;
  displayOrder: number;
};

export type GuestAgreementPackage = {
  title: string;
  intro: string;
  leadIn: string;
  acknowledgementTitle: string;
  acknowledgementIntro: string;
  sections: GuestAgreementSection[];
  acknowledgements: GuestAgreementAcknowledgementDef[];
};

export type GuestAgreementPropertyTimes = {
  checkInTime: string | null;
  checkOutTime: string | null;
};

export const GUEST_AGREEMENT_PLACEHOLDERS = ["check_in_time", "check_out_time"] as const;

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

export function canManageGuestAgreement(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

export function shouldSeedGuestAgreement(versionCount: number): boolean {
  return versionCount === 0;
}

export function agreementVersionIsEditable(publishedAt: string | null | undefined): boolean {
  return publishedAt == null;
}

export function nextGuestAgreementLabel(existingLabels: string[]): string {
  const used = new Set(existingLabels.map((label) => label.trim()));
  let number = 1;
  while (used.has(String(number))) number += 1;
  return String(number);
}

function byOrder<T extends { displayOrder: number; title: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.title.localeCompare(right.title),
  );
}

export function copyGuestAgreementPackage(source: GuestAgreementPackage): GuestAgreementPackage {
  return {
    title: source.title,
    intro: source.intro,
    leadIn: source.leadIn,
    acknowledgementTitle: source.acknowledgementTitle,
    acknowledgementIntro: source.acknowledgementIntro,
    sections: source.sections.map((section) => ({
      ...section,
      resolvedDescription: null,
    })),
    acknowledgements: source.acknowledgements.map((item) => ({ ...item })),
  };
}

export function withSectionWording(
  source: GuestAgreementPackage,
  sectionId: string,
  descriptionTemplate: string,
): GuestAgreementPackage {
  const next = copyGuestAgreementPackage(source);
  next.sections = next.sections.map((section) =>
    section.id === sectionId ? { ...section, descriptionTemplate } : section,
  );
  return next;
}

export function withSectionEnabled(
  source: GuestAgreementPackage,
  sectionId: string,
  enabled: boolean,
): GuestAgreementPackage {
  const next = copyGuestAgreementPackage(source);
  next.sections = next.sections.map((section) =>
    section.id === sectionId ? { ...section, enabled } : section,
  );
  return next;
}

export function withoutSection(
  source: GuestAgreementPackage,
  sectionId: string,
): GuestAgreementPackage {
  const next = copyGuestAgreementPackage(source);
  next.sections = next.sections.filter((section) => section.id !== sectionId);
  return next;
}

export function withSection(
  source: GuestAgreementPackage,
  section: GuestAgreementSection,
): GuestAgreementPackage {
  const next = copyGuestAgreementPackage(source);
  next.sections = [
    ...next.sections.filter((row) => row.id !== section.id),
    { ...section, resolvedDescription: null },
  ];
  return next;
}

export function withAcknowledgementEnabled(
  source: GuestAgreementPackage,
  acknowledgementId: string,
  enabled: boolean,
): GuestAgreementPackage {
  const next = copyGuestAgreementPackage(source);
  next.acknowledgements = next.acknowledgements.map((item) =>
    item.id === acknowledgementId ? { ...item, enabled } : item,
  );
  return next;
}

export function withAcknowledgementRequired(
  source: GuestAgreementPackage,
  acknowledgementId: string,
  required: boolean,
): GuestAgreementPackage {
  const next = copyGuestAgreementPackage(source);
  next.acknowledgements = next.acknowledgements.map((item) =>
    item.id === acknowledgementId ? { ...item, required } : item,
  );
  return next;
}

export function withoutAcknowledgement(
  source: GuestAgreementPackage,
  acknowledgementId: string,
): GuestAgreementPackage {
  const next = copyGuestAgreementPackage(source);
  next.acknowledgements = next.acknowledgements.filter((item) => item.id !== acknowledgementId);
  return next;
}

export function withAcknowledgement(
  source: GuestAgreementPackage,
  item: GuestAgreementAcknowledgementDef,
): GuestAgreementPackage {
  const next = copyGuestAgreementPackage(source);
  next.acknowledgements = [
    ...next.acknowledgements.filter((row) => row.id !== item.id),
    { ...item },
  ];
  return next;
}

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? "");
}

export function guestAgreementPlaceholderTokens(source: GuestAgreementPackage): string[] {
  const texts = [
    source.title,
    source.intro,
    source.leadIn,
    source.acknowledgementTitle,
    source.acknowledgementIntro,
    ...source.sections.map((section) => `${section.title}\n${section.descriptionTemplate}`),
    ...source.acknowledgements.map((item) => `${item.title}\n${item.statement}`),
  ];
  return [...new Set(texts.flatMap(placeholdersIn))];
}

export function normalizeGuestAgreementDraft(
  source: GuestAgreementPackage,
): GuestAgreementPackage | null {
  const title = source.title.trim();
  const intro = source.intro.trim();
  const leadIn = source.leadIn.trim();
  if (!title || title.length > 120 || intro.length > 2000 || leadIn.length > 2000) return null;
  if (source.sections.length < 1 || source.sections.length > 40) return null;
  if (source.acknowledgements.length < 1 || source.acknowledgements.length > 20) return null;
  const sectionIds = new Set<string>();
  const sections = byOrder(source.sections).map((section) => {
    const id = section.id.trim();
    const sectionTitle = section.title.trim();
    const descriptionTemplate = section.descriptionTemplate.trim();
    if (!id || id.length > 40 || sectionIds.has(id)) return null;
    if (!sectionTitle || sectionTitle.length > 120) return null;
    if (!descriptionTemplate || descriptionTemplate.length > 4000) return null;
    if (
      !Number.isInteger(section.displayOrder) ||
      section.displayOrder < 0 ||
      section.displayOrder > 9999
    ) {
      return null;
    }
    sectionIds.add(id);
    return {
      id,
      title: sectionTitle,
      descriptionTemplate,
      resolvedDescription: null,
      enabled: section.enabled === true,
      displayOrder: section.displayOrder,
    };
  });
  if (sections.some((section) => section == null)) return null;
  const acknowledgementIds = new Set<string>();
  const acknowledgements = byOrder(source.acknowledgements).map((item) => {
    const id = item.id.trim();
    const itemTitle = item.title.trim();
    const statement = item.statement.trim();
    if (!id || id.length > 40 || acknowledgementIds.has(id)) return null;
    if (!itemTitle || itemTitle.length > 120) return null;
    if (!statement || statement.length > 2000) return null;
    if (!Number.isInteger(item.displayOrder) || item.displayOrder < 0 || item.displayOrder > 9999)
      return null;
    acknowledgementIds.add(id);
    return {
      id,
      title: itemTitle,
      statement,
      enabled: item.enabled === true,
      required: item.required === true,
      displayOrder: item.displayOrder,
    };
  });
  if (acknowledgements.some((item) => item == null)) return null;
  return {
    title,
    intro,
    leadIn,
    acknowledgementTitle: source.acknowledgementTitle.trim().slice(0, 120),
    acknowledgementIntro: source.acknowledgementIntro.trim().slice(0, 2000),
    sections: sections as GuestAgreementSection[],
    acknowledgements: acknowledgements as GuestAgreementAcknowledgementDef[],
  };
}

function resolveText(text: string, times: { checkInTime: string; checkOutTime: string }): string {
  return text.replace(PLACEHOLDER, (_match, token: string) =>
    token === "check_in_time" ? times.checkInTime : times.checkOutTime,
  );
}

export function publishGuestAgreementSnapshot(
  source: GuestAgreementPackage,
  propertyTimes: GuestAgreementPropertyTimes,
):
  | {
      ok: true;
      package: GuestAgreementPackage;
      body: string;
      checkInTime: string;
      checkOutTime: string;
    }
  | {
      ok: false;
      code:
        | "AGREEMENT_CONFIG_INVALID"
        | "AGREEMENT_PLACEHOLDER_UNKNOWN"
        | "AGREEMENT_PROPERTY_TIME_MISSING";
    } {
  const draft = normalizeGuestAgreementDraft(source);
  if (!draft) return { ok: false, code: "AGREEMENT_CONFIG_INVALID" };
  const tokens = guestAgreementPlaceholderTokens(draft);
  const unknown = tokens.find(
    (token) =>
      !GUEST_AGREEMENT_PLACEHOLDERS.includes(
        token as (typeof GUEST_AGREEMENT_PLACEHOLDERS)[number],
      ),
  );
  if (unknown) return { ok: false, code: "AGREEMENT_PLACEHOLDER_UNKNOWN" };
  const checkInTime = normalizeClock(propertyTimes.checkInTime);
  const checkOutTime = normalizeClock(propertyTimes.checkOutTime);
  if (tokens.includes("check_in_time") && !checkInTime) {
    return { ok: false, code: "AGREEMENT_PROPERTY_TIME_MISSING" };
  }
  if (tokens.includes("check_out_time") && !checkOutTime) {
    return { ok: false, code: "AGREEMENT_PROPERTY_TIME_MISSING" };
  }
  const times = { checkInTime, checkOutTime };
  const published: GuestAgreementPackage = {
    ...draft,
    title: resolveText(draft.title, times),
    intro: resolveText(draft.intro, times),
    leadIn: resolveText(draft.leadIn, times),
    acknowledgementTitle: resolveText(draft.acknowledgementTitle, times),
    acknowledgementIntro: resolveText(draft.acknowledgementIntro, times),
    sections: draft.sections.map((section) => ({
      ...section,
      title: resolveText(section.title, times),
      resolvedDescription: resolveText(section.descriptionTemplate, times),
    })),
    acknowledgements: draft.acknowledgements.map((item) => ({
      ...item,
      title: resolveText(item.title, times),
      statement: resolveText(item.statement, times),
    })),
  };
  return {
    ok: true,
    package: published,
    body: renderGuestAgreementBody(published),
    checkInTime,
    checkOutTime,
  };
}

export function renderGuestAgreementBody(source: GuestAgreementPackage): string {
  const sections = byOrder(source.sections)
    .filter((section) => section.enabled)
    .map(
      (section) =>
        `${section.title}\n${section.resolvedDescription ?? section.descriptionTemplate}`,
    );
  return [source.title, source.intro, source.leadIn, ...sections]
    .filter((part) => part.trim())
    .join("\n\n");
}

export function projectCheckInAgreementContent(input: {
  id: string;
  label: string;
  body: string;
  title: string | null;
  intro: string | null;
  leadIn: string | null;
  acknowledgementTitle: string | null;
  acknowledgementIntro: string | null;
  sections: GuestAgreementSection[] | null;
  acknowledgements: GuestAgreementAcknowledgementDef[] | null;
}): CheckInAgreementVersion {
  if (!input.sections) {
    return {
      id: input.id,
      label: input.label,
      body: input.body,
      legacy: true,
      title: null,
      intro: null,
      leadIn: null,
      acknowledgementTitle: null,
      acknowledgementIntro: null,
      sections: [],
      acknowledgements: [],
    };
  }
  const sections = byOrder(input.sections)
    .filter((section) => section.enabled)
    .map((section) => ({
      id: section.id,
      title: section.title,
      description: section.resolvedDescription ?? section.descriptionTemplate,
      displayOrder: section.displayOrder,
    }));
  const acknowledgements = byOrder(input.acknowledgements ?? [])
    .filter((item) => item.enabled)
    .map((item) => ({
      id: item.id,
      title: item.title,
      statement: item.statement,
      required: item.enabled && item.required,
      displayOrder: item.displayOrder,
    }));
  return {
    id: input.id,
    label: input.label,
    body: input.body,
    legacy: false,
    title: input.title,
    intro: input.intro,
    leadIn: input.leadIn,
    acknowledgementTitle: input.acknowledgementTitle,
    acknowledgementIntro: input.acknowledgementIntro,
    sections,
    acknowledgements,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asGuestAgreementSections(value: unknown): GuestAgreementSection[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return value.flatMap((row) => {
    const record = asRecord(row);
    if (!record || typeof record.id !== "string" || typeof record.title !== "string") return [];
    const template =
      typeof record.descriptionTemplate === "string"
        ? record.descriptionTemplate
        : typeof record.resolvedDescription === "string"
          ? record.resolvedDescription
          : "";
    if (!template) return [];
    return [
      {
        id: record.id,
        title: record.title,
        descriptionTemplate: template,
        resolvedDescription:
          typeof record.resolvedDescription === "string" ? record.resolvedDescription : null,
        enabled: record.enabled !== false,
        displayOrder: Number.isFinite(Number(record.displayOrder))
          ? Number(record.displayOrder)
          : 0,
      },
    ];
  });
}

export function asGuestAgreementAcknowledgements(
  value: unknown,
): GuestAgreementAcknowledgementDef[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return value.flatMap((row) => {
    const record = asRecord(row);
    if (!record || typeof record.id !== "string" || typeof record.statement !== "string") return [];
    return [
      {
        id: record.id,
        title: typeof record.title === "string" ? record.title : record.id,
        statement: record.statement,
        enabled: record.enabled !== false,
        required: record.required === true,
        displayOrder: Number.isFinite(Number(record.displayOrder))
          ? Number(record.displayOrder)
          : 0,
      },
    ];
  });
}

export function missingRequiredAcknowledgements(
  definitions: CheckInAgreementVersion["acknowledgements"],
  flags: CheckInAgreementAcknowledgement,
): string[] {
  return (definitions ?? [])
    .filter((item) => item.required)
    .filter((item) => flags[item.id] !== true)
    .map((item) => item.id);
}
