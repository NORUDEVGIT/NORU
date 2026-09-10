import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getDraftMarketingContent,
  publishMarketingContent,
  resetMarketingContentToSeed,
  revertDraftMarketingContent,
  saveDraftMarketingContent,
} from "@/core/lib/marketing.functions";
import {
  createSeedMarketingSnapshot,
  evaluateMarketingDocument,
  snapshotHasUnpublishedChanges,
  type MarketingContent,
  type MarketingEditorReport,
  type MarketingCmsSnapshot,
} from "@/core/lib/marketing";

interface MarketingEditorApi {
  snapshot: MarketingCmsSnapshot;
  draft: MarketingContent;
  report: MarketingEditorReport;
  dirty: boolean;
  loading: boolean;
  updateDraft: (mutator: (draft: MarketingContent) => void) => MarketingEditorReport;
  publish: () => Promise<boolean>;
  revertDraft: () => Promise<void>;
  resetToSeed: () => Promise<void>;
}

const MarketingEditorContext = createContext<MarketingEditorApi | null>(null);

const SAVE_DEBOUNCE_MS = 400;

export function MarketingEditorProvider({ children }: { children: ReactNode }) {
  const loadDraft = useServerFn(getDraftMarketingContent);
  const saveDraft = useServerFn(saveDraftMarketingContent);
  const publishFn = useServerFn(publishMarketingContent);
  const revertFn = useServerFn(revertDraftMarketingContent);
  const resetFn = useServerFn(resetMarketingContentToSeed);

  const seed = createSeedMarketingSnapshot();
  const [snapshot, setSnapshot] = useState<MarketingCmsSnapshot>(seed);
  const [report, setReport] = useState<MarketingEditorReport>(() => evaluateMarketingDocument(seed.draft));
  const [loading, setLoading] = useState(true);
  const snapshotRef = useRef(snapshot);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    void loadDraft()
      .then((next) => {
        if (cancelled) return;
        setSnapshot(next);
        setReport(evaluateMarketingDocument(next.draft));
      })
      .catch((error) => {
        console.error("[MarketingEditorProvider]", error);
        if (!cancelled) {
          toast.error("Could not load the marketing draft from the server. Showing the honest seed.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [loadDraft]);

  const persist = useCallback(
    (content: MarketingContent) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveDraft({ data: { content } }).catch((error) => {
          console.error("[saveDraftMarketingContent]", error);
          toast.error("Draft save failed. Your edits are still on this screen.");
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [saveDraft],
  );

  const applySnapshot = useCallback((next: MarketingCmsSnapshot, nextReport: MarketingEditorReport) => {
    setSnapshot(next);
    setReport(nextReport);
    return nextReport;
  }, []);

  const updateDraft = useCallback(
    (mutator: (draft: MarketingContent) => void) => {
      const nextDraft = structuredClone(snapshotRef.current.draft);
      mutator(nextDraft);
      const nextReport = evaluateMarketingDocument(nextDraft);
      const next: MarketingCmsSnapshot = {
        ...snapshotRef.current,
        draft: nextDraft,
        draftUpdatedAt: new Date().toISOString(),
      };
      applySnapshot(next, nextReport);
      persist(nextDraft);
      return nextReport;
    },
    [applySnapshot, persist],
  );

  const publish = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      const result = await publishFn({ data: { content: snapshotRef.current.draft } });
      applySnapshot(result.snapshot, result.report);
      if (result.ok) {
        toast.success("Published. The public site will use this document (seed fallback if a read fails).");
        return true;
      }
      toast.error(result.report.errors[0]?.message ?? "Publish blocked — fix validation errors first.");
      return false;
    } catch (error) {
      console.error("[publishMarketingContent]", error);
      toast.error("Publish failed. The last published document was kept.");
      return false;
    }
  }, [applySnapshot, publishFn]);

  const revertDraft = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      const result = await revertFn();
      applySnapshot(result.snapshot, result.report);
      toast.success("Draft reverted to the last published document.");
    } catch (error) {
      console.error("[revertDraftMarketingContent]", error);
      toast.error("Could not revert the draft.");
    }
  }, [applySnapshot, revertFn]);

  const resetToSeed = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      const result = await resetFn();
      applySnapshot(result.snapshot, result.report);
      toast.success("Draft and published documents reset to the honest seed.");
    } catch (error) {
      console.error("[resetMarketingContentToSeed]", error);
      toast.error("Could not reset marketing content.");
    }
  }, [applySnapshot, resetFn]);

  const value = useMemo<MarketingEditorApi>(
    () => ({
      snapshot,
      draft: snapshot.draft,
      report,
      dirty: snapshotHasUnpublishedChanges(snapshot),
      loading,
      updateDraft,
      publish,
      revertDraft,
      resetToSeed,
    }),
    [snapshot, report, loading, updateDraft, publish, revertDraft, resetToSeed],
  );

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading marketing draft…
      </p>
    );
  }

  return <MarketingEditorContext.Provider value={value}>{children}</MarketingEditorContext.Provider>;
}

export function useMarketingEditor(): MarketingEditorApi {
  const ctx = useContext(MarketingEditorContext);
  if (!ctx) throw new Error("useMarketingEditor must be used inside MarketingEditorProvider.");
  return ctx;
}
