/**
 * In-memory Marketing CMS helper used by unit tests.
 * Admin UI persists through marketing.functions.ts (Milestone C).
 * This store never imports entitlement APIs.
 */

import {
  createSeedMarketingSnapshot,
  evaluatePublish,
  evaluateSaveDraft,
  isMarketingContent,
  type MarketingCmsSnapshot,
} from "./document.ts";
import { validateMarketingEditorContent, type MarketingEditorReport } from "./editor.ts";
import type { MarketingContent } from "./types.ts";

export const MARKETING_MOCK_STORAGE_KEY = "noru.admin.marketing.draft.v1";

export type MarketingPublishState = "draft" | "published";

export type MarketingMockSnapshot = MarketingCmsSnapshot;

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
  return createSeedMarketingSnapshot();
}

export function snapshotHasUnpublishedChanges(snapshot: MarketingMockSnapshot): boolean {
  return JSON.stringify(snapshot.draft) !== JSON.stringify(snapshot.published);
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
    const { persist, report } = evaluateSaveDraft(next);
    if (!persist) return report;
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
    const result = evaluatePublish(this.#snapshot.draft, this.#snapshot);
    if (result.ok) this.#snapshot = result.snapshot;
    return result;
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
