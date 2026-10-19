/**
 * Guest Agreement configuration screen rules.
 * Publishing and placeholder resolution stay on the server.
 */
import { canManageGuestAgreement } from "@/packages/pms/lib/guest-agreement-config";
import type { GuestAgreementPackage } from "@/packages/pms/lib/guest-agreement-config";

export const GUEST_AGREEMENT_ROUTE = "/restaurant/pms/guest-services/agreement";

export const GUEST_AGREEMENT_PAGE_TITLE = "Guest Agreement";

export const GUEST_AGREEMENT_PAGE_SUBTITLE =
  "Configure the registration agreement and acknowledgements presented during check-in.";

export const GUEST_AGREEMENT_READONLY =
  "Published versions are read-only. Create a new version to make changes.";

export const GUEST_AGREEMENT_PROPERTY_SETUP_HELP =
  "These values come from Settings → Property Setup and are resolved into the agreement when a version is published.";

export const GUEST_AGREEMENT_REMOVE_SECTION =
  "Removing this section affects only the current draft. Previously published versions remain unchanged.";

export const GUEST_AGREEMENT_REMOVE_ACKNOWLEDGEMENT =
  "Removing this acknowledgement affects only the current draft. Previously published versions remain unchanged.";

export const GUEST_AGREEMENT_PUBLISH_TITLE = "Publish this Guest Agreement?";

export const GUEST_AGREEMENT_PUBLISH_POINTS = [
  "It will become the active agreement for new Check-Ins.",
  "Property Setup check-in and check-out values will be resolved into this published version.",
  "Previous signed and published versions remain unchanged.",
] as const;

export const GUEST_AGREEMENT_MANAGER_ONLY =
  "An owner or manager has to manage the guest agreement.";

export const GUEST_AGREEMENT_PREVIEW_NOTE =
  "Preview uses the current Property Setup times. Publishing resolves them on the server.";

export type GuestAgreementVersionView = {
  id: string;
  label: string;
  active: boolean;
  publishedAt: string | null;
  editable: boolean;
  legacy: boolean;
  body: string;
  agreement: GuestAgreementPackage | null;
  resolvedCheckInTime: string | null;
  resolvedCheckOutTime: string | null;
};

export type GuestAgreementHistoryRow = {
  id: string;
  label: string;
  active: boolean;
  publishedAt: string | null;
  editable: boolean;
};

export type GuestAgreementConfiguration = {
  active: GuestAgreementVersionView | null;
  draft: GuestAgreementVersionView | null;
  history: GuestAgreementHistoryRow[];
  checkInTime: string | null;
  checkOutTime: string | null;
};

export function guestAgreementCanMutate(role: string | null | undefined): boolean {
  return canManageGuestAgreement(role);
}

export function guestAgreementActionState(
  role: string | null | undefined,
  hasDraft: boolean,
): { create: boolean; save: boolean; publish: boolean } {
  const allowed = guestAgreementCanMutate(role);
  return {
    create: allowed && !hasDraft,
    save: allowed && hasDraft,
    publish: allowed && hasDraft,
  };
}

export function propertySetupTimeWarning(
  checkInTime: string | null,
  checkOutTime: string | null,
): string | null {
  if (checkInTime && checkOutTime) return null;
  return "Set the check-in and check-out times in Settings → Property Setup before publishing.";
}

export function guestAgreementHistoryStatus(row: {
  active: boolean;
  editable: boolean;
}): "Draft" | "Active" | "Published" {
  if (row.editable) return "Draft";
  if (row.active) return "Active";
  return "Published";
}

export function enabledAgreementCount(
  version: GuestAgreementVersionView | null,
  kind: "sections" | "acknowledgements",
): number | null {
  if (!version || version.legacy || !version.agreement) return null;
  const rows =
    kind === "sections" ? version.agreement.sections : version.agreement.acknowledgements;
  return rows.filter((row) => row.enabled).length;
}

export function formatGuestAgreementPublishedAt(value: string | null): string {
  if (!value) return "Not published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not published";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function guestAgreementVersionDetail(
  configuration: GuestAgreementConfiguration,
  versionId: string,
): GuestAgreementVersionView | GuestAgreementHistoryRow | null {
  if (configuration.active?.id === versionId) return configuration.active;
  if (configuration.draft?.id === versionId) return configuration.draft;
  return configuration.history.find((row) => row.id === versionId) ?? null;
}

export function isStructuredAgreementVersion(
  version: GuestAgreementVersionView | GuestAgreementHistoryRow,
): version is GuestAgreementVersionView {
  return "legacy" in version;
}

export function previewGuestAgreement(
  source: GuestAgreementPackage,
  times: { checkInTime: string | null; checkOutTime: string | null },
): GuestAgreementPackage {
  const show = (text: string) =>
    text
      .replace(/\{\{\s*check_in_time\s*\}\}/g, times.checkInTime || "{{check_in_time}}")
      .replace(/\{\{\s*check_out_time\s*\}\}/g, times.checkOutTime || "{{check_out_time}}");
  return {
    title: show(source.title),
    intro: show(source.intro),
    leadIn: show(source.leadIn),
    acknowledgementTitle: show(source.acknowledgementTitle),
    acknowledgementIntro: show(source.acknowledgementIntro),
    sections: source.sections
      .filter((section) => section.enabled)
      .map((section) => ({
        ...section,
        title: show(section.title),
        descriptionTemplate: section.descriptionTemplate,
        resolvedDescription: show(section.resolvedDescription ?? section.descriptionTemplate),
      })),
    acknowledgements: source.acknowledgements
      .filter((item) => item.enabled)
      .map((item) => ({
        ...item,
        title: show(item.title),
        statement: show(item.statement),
        required: item.enabled && item.required,
      })),
  };
}

export function reorderGuestAgreementItems<T extends { id: string; displayOrder: number }>(
  rows: T[],
  id: string,
  direction: "up" | "down",
): T[] {
  const ordered = [...rows].sort((left, right) => left.displayOrder - right.displayOrder);
  const index = ordered.findIndex((row) => row.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ordered.length) return ordered;
  const next = [...ordered];
  const current = next[index];
  const neighbor = next[target];
  if (!current || !neighbor) return ordered;
  next[index] = neighbor;
  next[target] = current;
  return next.map((row, position) => ({ ...row, displayOrder: (position + 1) * 10 }));
}

export function guestAgreementActionFailure(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "The guest agreement could not be saved.";
  const firstLine = message.split("\n")[0]?.trim() || "The guest agreement could not be saved.";
  if (firstLine.includes("    at ") || firstLine.length > 280) {
    return "The guest agreement could not be saved.";
  }
  return firstLine;
}
