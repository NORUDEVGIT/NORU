/**
 * In-memory / localStorage Marketing CMS stub (Milestone B).
 *
 * Edits the same MarketingContent shape as the public seed. This store never
 * imports entitlement APIs and never writes restaurant_package_entitlements.
 * Public `/` keeps using the seed until Milestone C.
 */

import { MARKETING_SEED } from "./seed.ts";
import { validateMarketingEditorContent, type MarketingEditorReport } from "./editor.ts";
import type { MarketingContent } from "./types.ts";

export const MARKETING_MOCK_STORAGE_KEY = "noru.admin.marketing.draft.v1";

export type MarketingPublishState = "draft" | "published";

export interface MarketingMockSnapshot {
  draft: MarketingContent;
  published: MarketingContent;
  draftUpdatedAt: string;
  publishedAt: string | null;
}

export interface MarketingMockPublishResult {
  ok: boolean;
  report: MarketingEditorReport;
  snapshot: MarketingMockSnapshot;
}

function cloneContent(content: MarketingContent): MarketingContent {
  return structuredClone(content);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createInitialMarketingSnapshot(): MarketingMockSnapshot {
  const seed = cloneContent(MARKETING_SEED);
  return {
    draft: seed,
    published: cloneContent(MARKETING_SEED),
    draftUpdatedAt: nowIso(),
    publishedAt: null,
  };
}

export function snapshotHasUnpublishedChanges(snapshot: MarketingMockSnapshot): boolean {
  return JSON.stringify(snapshot.draft) !== JSON.stringify(snapshot.published);
}

function isMarketingContent(value: unknown): value is MarketingContent {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MarketingContent>;
  return (
    typeof record.brand === "object" &&
    record.brand != null &&
    Array.isArray(record.nav) &&
    Array.isArray(record.packages)
  );
}

function isSnapshot(value: unknown): value is MarketingMockSnapshot {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MarketingMockSnapshot>;
  return isMarketingContent(record.draft) && isMarketingContent(record.published);
}

export function readStoredMarketingSnapshot(): MarketingMockSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(MARKETING_MOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredMarketingSnapshot(snapshot: MarketingMockSnapshot): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MARKETING_MOCK_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearStoredMarketingSnapshot(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(MARKETING_MOCK_STORAGE_KEY);
}

export class MarketingMockStore {
  #snapshot: MarketingMockSnapshot;

  constructor(initial?: MarketingMockSnapshot) {
    this.#snapshot = initial ? structuredClone(initial) : createInitialMarketingSnapshot();
  }

  get snapshot(): MarketingMockSnapshot {
    return structuredClone(this.#snapshot);
  }

  get draft(): MarketingContent {
    return structuredClone(this.#snapshot.draft);
  }

  get published(): MarketingContent {
    return structuredClone(this.#snapshot.published);
  }

  /** Optional hook a public consumer could use later. Admin-only for Milestone B. */
  peekPublished(): MarketingContent {
    return this.published;
  }

  replaceDraft(next: MarketingContent): MarketingEditorReport {
    const report = validateMarketingEditorContent(next);
    this.#snapshot = {
      ...this.#snapshot,
      draft: cloneContent(next),
      draftUpdatedAt: nowIso(),
    };
    return report;
  }

  updateDraft(mutator: (draft: MarketingContent) => void): MarketingEditorReport {
    const next = this.draft;
    mutator(next);
    return this.replaceDraft(next);
  }

  publish(): MarketingMockPublishResult {
    const report = validateMarketingEditorContent(this.#snapshot.draft);
    if (!report.ok) {
      return { ok: false, report, snapshot: this.snapshot };
    }
    this.#snapshot = {
      ...this.#snapshot,
      published: cloneContent(this.#snapshot.draft),
      publishedAt: nowIso(),
    };
    return { ok: true, report, snapshot: this.snapshot };
  }

  revertDraftToPublished(): MarketingEditorReport {
    return this.replaceDraft(this.published);
  }

  resetToSeed(): MarketingEditorReport {
    this.#snapshot = createInitialMarketingSnapshot();
    return validateMarketingEditorContent(this.#snapshot.draft);
  }
}

let singleton: MarketingMockStore | null = null;

export function getMarketingMockStore(): MarketingMockStore {
  if (!singleton) {
    singleton = new MarketingMockStore(readStoredMarketingSnapshot() ?? createInitialMarketingSnapshot());
  }
  return singleton;
}

export function persistMarketingMockStore(): void {
  if (!singleton) return;
  writeStoredMarketingSnapshot(singleton.snapshot);
}

export function resetMarketingMockStoreForTests(initial?: MarketingMockSnapshot): MarketingMockStore {
  singleton = new MarketingMockStore(initial);
  return singleton;
}
