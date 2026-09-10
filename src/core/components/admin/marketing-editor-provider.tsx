import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  getMarketingMockStore,
  persistMarketingMockStore,
  snapshotHasUnpublishedChanges,
  validateMarketingEditorContent,
  type MarketingContent,
  type MarketingEditorReport,
  type MarketingMockSnapshot,
} from "@/core/lib/marketing";

interface MarketingEditorApi {
  snapshot: MarketingMockSnapshot;
  draft: MarketingContent;
  report: MarketingEditorReport;
  dirty: boolean;
  updateDraft: (mutator: (draft: MarketingContent) => void) => MarketingEditorReport;
  publish: () => boolean;
  revertDraft: () => void;
  resetToSeed: () => void;
}

const MarketingEditorContext = createContext<MarketingEditorApi | null>(null);

export function MarketingEditorProvider({ children }: { children: ReactNode }) {
  const store = getMarketingMockStore();
  const [snapshot, setSnapshot] = useState<MarketingMockSnapshot>(() => store.snapshot);
  const [report, setReport] = useState<MarketingEditorReport>(() =>
    validateMarketingEditorContent(store.draft),
  );

  const sync = useCallback(
    (nextReport: MarketingEditorReport) => {
      persistMarketingMockStore();
      setSnapshot(store.snapshot);
      setReport(nextReport);
      return nextReport;
    },
    [store],
  );

  const updateDraft = useCallback(
    (mutator: (draft: MarketingContent) => void) => sync(store.updateDraft(mutator)),
    [store, sync],
  );

  const publish = useCallback(() => {
    const result = store.publish();
    persistMarketingMockStore();
    setSnapshot(store.snapshot);
    setReport(result.report);
    if (result.ok) {
      toast.success("Published to the local marketing stub. The public site still uses the seed until Milestone C.");
      return true;
    }
    toast.error(result.report.errors[0]?.message ?? "Publish blocked — fix validation errors first.");
    return false;
  }, [store]);

  const revertDraft = useCallback(() => {
    sync(store.revertDraftToPublished());
    toast.success("Draft reverted to the last published stub.");
  }, [store, sync]);

  const resetToSeed = useCallback(() => {
    sync(store.resetToSeed());
    persistMarketingMockStore();
    toast.success("Draft and published stub reset to the honest seed.");
  }, [store, sync]);

  const value = useMemo<MarketingEditorApi>(
    () => ({
      snapshot,
      draft: snapshot.draft,
      report,
      dirty: snapshotHasUnpublishedChanges(snapshot),
      updateDraft,
      publish,
      revertDraft,
      resetToSeed,
    }),
    [snapshot, report, updateDraft, publish, revertDraft, resetToSeed],
  );

  return <MarketingEditorContext.Provider value={value}>{children}</MarketingEditorContext.Provider>;
}

export function useMarketingEditor(): MarketingEditorApi {
  const ctx = useContext(MarketingEditorContext);
  if (!ctx) throw new Error("useMarketingEditor must be used inside MarketingEditorProvider.");
  return ctx;
}
