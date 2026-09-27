import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  ACTIVATION_DISCARD_COPY,
  type CommercialActivationKind,
} from "@/packages/pms/lib/revenue/commercial-activation-workflow";
import { getPromotionsWorkspace } from "@/packages/pms/lib/revenue/commercial-overview.functions";
import { getPackagesWorkspace } from "@/packages/pms/lib/revenue/commercial-packages.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/shared/components/ui/sheet";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";
import type { CommercialActivationWorkflowProps } from "./commercial-activation-types";
import { PackageActivationFlow } from "./package-activation-flow";
import { PromotionActivationFlow } from "./promotion-activation-flow";

export function CommercialActivationWorkflow({
  open,
  onOpenChange,
  restaurantId,
  canManage,
  source,
  currency,
  roomTypes,
  ratePlans,
  initialKind,
  initialPromotionId = null,
  initialPackageId = null,
  promotionMasters,
  packageMasters,
  onActivated,
}: CommercialActivationWorkflowProps) {
  const [kind, setKind] = useState<CommercialActivationKind | null>(initialKind ?? null);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const fetchPromotions = useServerFn(getPromotionsWorkspace);
  const fetchPackages = useServerFn(getPackagesWorkspace);

  useEffect(() => {
    if (!open) {
      setKind(initialKind ?? null);
      setDirty(false);
      setConfirmClose(false);
    }
  }, [open, initialKind]);

  const promotionsQuery = useQuery({
    queryKey: ["commercial-promotions", restaurantId, "activation-masters"],
    queryFn: () => fetchPromotions({ data: { restaurantId } }),
    enabled: open && (kind === "promotion" || !kind) && !promotionMasters,
    retry: false,
  });
  const packagesQuery = useQuery({
    queryKey: ["commercial-packages", restaurantId, "activation-masters"],
    queryFn: () => fetchPackages({ data: { restaurantId } }),
    enabled: open && (kind === "package" || !kind) && !packageMasters,
    retry: false,
  });

  const resolvedPromotionMasters = promotionMasters ?? promotionsQuery.data?.masters ?? [];
  const resolvedPackageMasters = packageMasters ?? packagesQuery.data?.masters ?? [];
  const resolvedCurrency = currency || promotionsQuery.data?.currency || packagesQuery.data?.currency || "ETB";

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(false);
  }, [dirty, onOpenChange]);

  function discardAndClose() {
    setConfirmClose(false);
    setDirty(false);
    onOpenChange(false);
  }

  const showChooser = open && !kind;
  const title = showChooser
    ? "Activate Commercial Item"
    : kind === "promotion"
      ? "Activate Promotion"
      : "Activate Package";

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && requestClose()}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col p-0 sm:w-[92vw] md:max-w-[860px]"
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            {showChooser
              ? "Choose whether to activate a promotion or a package."
              : "Create a commercial activation from a Property Setup master."}
          </SheetDescription>
          {showChooser ? (
            <div className="flex h-full flex-col bg-[#F7F4EE]">
              <div className="border-b border-[#E8E1D7] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Commercial
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">{title}</h3>
              </div>
              <div className="space-y-3 p-4">
                <p className="text-xs text-muted-foreground">
                  Activate one Property Setup master at a time. There is no third commercial type in V1.
                </p>
                <button
                  type="button"
                  className={`${commercialGoldButton(!canManage)} w-full justify-center`}
                  disabled={!canManage}
                  onClick={() => setKind("promotion")}
                >
                  Promotion
                </button>
                <button
                  type="button"
                  className={`${commercialOutlineButton()} w-full justify-center`}
                  disabled={!canManage}
                  onClick={() => setKind("package")}
                >
                  Package
                </button>
                {!canManage ? (
                  <p className="text-[10px] text-[#6B4A0A]">You do not have permission to manage activations.</p>
                ) : null}
              </div>
              <div className="mt-auto flex gap-2 border-t border-[#E8E1D7] px-4 py-3">
                <button type="button" className={commercialOutlineButton()} onClick={() => onOpenChange(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {kind === "promotion" ? (
            <PromotionActivationFlow
              key={`${source}-promotion-${initialPromotionId ?? "none"}`}
              restaurantId={restaurantId}
              canManage={canManage}
              currency={resolvedCurrency}
              masters={resolvedPromotionMasters}
              roomTypes={roomTypes}
              ratePlans={ratePlans}
              initialPromotionId={initialPromotionId}
              onClose={requestClose}
              onActivated={(activationId) => onActivated?.({ kind: "promotion", activationId })}
              onDirtyChange={setDirty}
            />
          ) : null}
          {kind === "package" ? (
            <PackageActivationFlow
              key={`${source}-package-${initialPackageId ?? "none"}`}
              restaurantId={restaurantId}
              canManage={canManage}
              currency={resolvedCurrency}
              masters={resolvedPackageMasters}
              roomTypes={roomTypes}
              ratePlans={ratePlans}
              initialPackageId={initialPackageId}
              onClose={requestClose}
              onActivated={(activationId) => onActivated?.({ kind: "package", activationId })}
              onDirtyChange={setDirty}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard activation setup?</AlertDialogTitle>
            <AlertDialogDescription>{ACTIVATION_DISCARD_COPY}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={discardAndClose}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
