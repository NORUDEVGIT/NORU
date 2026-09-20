/**
 * Card 8 read-only validation aggregation.
 *
 * Domain modules own every business rule. These helpers only normalize their
 * blocker/warning outputs and derive summaries from returned issues.
 */
import {
  CARD8_VALIDATION_ADAPTERS,
  card8ValidationReady,
  deriveCard8ValidationCounts,
  mapCard8Blocker,
  mapCard8Warning,
  type Card8ValidationCategory,
  type Card8ValidationIssue,
  type Card8ValidationReport,
  type Card8ValidationSummary,
} from "./pms-property-setup-card8-validation.ts";

export type Card8DomainSlice = {
  id: string;
  label: string;
  blockers?: readonly string[];
  warnings?: readonly string[];
  href?: string;
};

export type Card8AdapterResult = {
  cardNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  category: Card8ValidationCategory;
  succeeded: boolean;
  issues: Card8ValidationIssue[];
  error?: string;
};

function issueId(cardNumber: number, domain: string, severity: string, index: number): string {
  const slug = domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `card-${cardNumber}-${slug}-${severity}-${index + 1}`;
}

export function adaptCard8DomainSlices(
  cardNumber: Card8AdapterResult["cardNumber"],
  category: Card8ValidationCategory,
  slices: readonly Card8DomainSlice[],
): Card8AdapterResult {
  const adapter = CARD8_VALIDATION_ADAPTERS.find((row) => row.cardNumber === cardNumber);
  const issues: Card8ValidationIssue[] = [];
  for (const slice of slices) {
    const href = slice.href ?? adapter?.href;
    for (const [index, message] of (slice.blockers ?? []).entries()) {
      issues.push({
        id: issueId(cardNumber, slice.id, "critical", index),
        cardNumber,
        category,
        domain: slice.label,
        severity: mapCard8Blocker(message),
        message,
        ...(href ? { href } : {}),
      });
    }
    for (const [index, message] of (slice.warnings ?? []).entries()) {
      issues.push({
        id: issueId(cardNumber, slice.id, "warning", index),
        cardNumber,
        category,
        domain: slice.label,
        severity: mapCard8Warning(message),
        message,
        ...(href ? { href } : {}),
      });
    }
  }
  return { cardNumber, category, succeeded: true, issues };
}

export function failedCard8Adapter(
  cardNumber: Card8AdapterResult["cardNumber"],
  category: Card8ValidationCategory,
  error: unknown,
): Card8AdapterResult {
  return {
    cardNumber,
    category,
    succeeded: false,
    issues: [],
    error: error instanceof Error ? error.message : "Validation source unavailable.",
  };
}

export function buildCard8ValidationReport(
  results: readonly Card8AdapterResult[],
  generatedAt = new Date().toISOString(),
): Card8ValidationReport {
  const issues = results.flatMap((result) => result.issues);
  const issueCounts = deriveCard8ValidationCounts(issues, []);
  const summaries: Card8ValidationSummary[] = CARD8_VALIDATION_ADAPTERS.map((adapter) => {
    const result = results.find((row) => row.cardNumber === adapter.cardNumber);
    const cardIssues = result?.issues ?? [];
    return {
      cardNumber: adapter.cardNumber,
      category: adapter.category,
      programmeId: adapter.programmeId,
      href: adapter.href,
      succeeded: result?.succeeded === true,
      critical: cardIssues.filter((row) => row.severity === "critical").length,
      warning: cardIssues.filter((row) => row.severity === "warning").length,
      informational: cardIssues.filter((row) => row.severity === "informational").length,
      ...(result?.error ? { error: result.error } : {}),
    };
  });
  const succeeded = summaries.filter((row) => row.succeeded).length;
  const counts = {
    ...issueCounts,
    passedCards: summaries.filter((row) => row.succeeded && row.critical === 0).length,
  };
  if (succeeded === 0) {
    return {
      verdict: "FAIL",
      reason: "No Card 1–7 validation adapter completed.",
      ready: false,
      generatedAt,
      issues,
      counts,
      summaries,
    };
  }
  if (succeeded < summaries.length) {
    return {
      verdict: "PARTIAL",
      reason: `${summaries.length - succeeded} validation adapter${summaries.length - succeeded === 1 ? "" : "s"} could not run.`,
      ready: false,
      generatedAt,
      issues,
      counts,
      summaries,
    };
  }
  return {
    verdict: "PASS",
    ready: card8ValidationReady(counts),
    generatedAt,
    issues,
    counts,
    summaries,
  };
}
