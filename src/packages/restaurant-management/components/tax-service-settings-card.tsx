import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Percent } from "lucide-react";

import { BillTotals } from "@/packages/restaurant-management/components/bill-totals";
import {
  getRestaurantTaxSettings,
  saveRestaurantTaxSettings,
} from "@/packages/restaurant-management/lib/rm-tax.functions";
import {
  SAMPLE_BILL_MERCHANDISE,
  computeRmBill,
  normalizeRate,
  type RmTaxSettings,
} from "@/packages/restaurant-management/lib/rm-tax";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
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
import { cn } from "@/shared/lib/utils";
import { formatMoney } from "@/shared/lib/property-time";

const MANAGE_ROLES = ["owner", "manager"] as const;

export function TaxServiceSettingsCard({
  restaurantId,
  role,
  currencyCode,
}: {
  restaurantId: string;
  role: string;
  currencyCode: string;
}) {
  const canManage = (MANAGE_ROLES as readonly string[]).includes(role);
  if (!canManage) return null;

  return (
    <TaxServiceSettingsForm
      restaurantId={restaurantId}
      currencyCode={currencyCode}
    />
  );
}

function TaxServiceSettingsForm({
  restaurantId,
  currencyCode,
}: {
  restaurantId: string;
  currencyCode: string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getRestaurantTaxSettings);
  const save = useServerFn(saveRestaurantTaxSettings);
  const money = useMemo(() => (value: number) => formatMoney(value, currencyCode), [currencyCode]);

  const query = useQuery({
    queryKey: ["rm-tax-settings", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const [draft, setDraft] = useState<RmTaxSettings | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const preview = useMemo(
    () => (draft ? computeRmBill(SAMPLE_BILL_MERCHANDISE, draft) : null),
    [draft],
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("Settings are still loading.");
      return save({
        data: {
          restaurantId,
          taxRate: draft.taxRate,
          taxInclusive: draft.taxInclusive,
          serviceEnabled: draft.serviceEnabled,
          serviceRate: draft.serviceRate,
        },
      });
    },
    onSuccess: (result) => {
      setConfirmOpen(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setDraft(result.settings);
      toast.success("Tax & service settings saved. New orders use these rates.");
      void queryClient.invalidateQueries({ queryKey: ["rm-tax-settings", restaurantId] });
    },
    onError: (error: Error) => {
      setConfirmOpen(false);
      toast.error(error.message);
    },
  });

  if (query.isLoading || !draft) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Loading tax &amp; service settings…</p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg">Tax &amp; service</h2>
        <p className="mt-2 text-sm text-destructive">
          {(query.error as Error).message || "You don't have permission to manage these settings."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <Percent className="mt-0.5 size-5 text-primary" />
        <div>
          <h2 className="font-display text-lg">Tax &amp; service</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Property-level tax/VAT and an optional service charge. Changes apply to new orders
            only — bills already placed keep the rates snapshotted at the time.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="rm-tax-rate">Tax rate</Label>
            <div className="relative">
              <Input
                id="rm-tax-rate"
                inputMode="decimal"
                value={String(draft.taxRate)}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "" || next === ".") {
                    setDraft((prev) => (prev ? { ...prev, taxRate: 0 } : prev));
                    return;
                  }
                  const parsed = Number(next);
                  if (!Number.isFinite(parsed)) return;
                  setDraft((prev) => (prev ? { ...prev, taxRate: normalizeRate(parsed) } : prev));
                }}
                className="h-12 pr-10"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">0–100%. Both inclusive and exclusive modes are supported.</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Tax mode</p>
            <div
              role="radiogroup"
              aria-label="Tax mode"
              className="grid grid-cols-2 gap-2"
            >
              {(
                [
                  { value: false, label: "Exclusive" },
                  { value: true, label: "Inclusive" },
                ] as const
              ).map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  role="radio"
                  aria-checked={draft.taxInclusive === option.value}
                  onClick={() => setDraft((prev) => (prev ? { ...prev, taxInclusive: option.value } : prev))}
                  className={cn(
                    "h-12 rounded-2xl border text-sm font-semibold transition-colors",
                    draft.taxInclusive === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {draft.taxInclusive
                ? "Menu prices already include tax. Payable does not add tax again — the bill shows Tax (included)."
                : "Tax is added on top of menu prices. The bill shows Tax (added)."}
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="rm-service-enabled">Service charge</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Off by default. When on, a percentage of merchandise net of tax.
                </p>
              </div>
              <Switch
                id="rm-service-enabled"
                checked={draft.serviceEnabled}
                onCheckedChange={(checked) =>
                  setDraft((prev) => (prev ? { ...prev, serviceEnabled: checked } : prev))
                }
              />
            </div>
            {draft.serviceEnabled ? (
              <div className="space-y-2">
                <Label htmlFor="rm-service-rate">Service rate</Label>
                <div className="relative">
                  <Input
                    id="rm-service-rate"
                    inputMode="decimal"
                    value={String(draft.serviceRate)}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (!Number.isFinite(parsed) && event.target.value !== "") return;
                      setDraft((prev) =>
                        prev ? { ...prev, serviceRate: normalizeRate(Number(event.target.value) || 0) } : prev,
                      );
                    }}
                    className="h-12 pr-10"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Sample bill</p>
          <p className="text-xs text-muted-foreground">
            Preview for {money(SAMPLE_BILL_MERCHANDISE)} of items. Payable is what guests and the
            till will collect.
          </p>
          <div
            aria-live="polite"
            aria-atomic="true"
            className="rounded-2xl border border-border bg-background p-4"
          >
            {preview ? <BillTotals bill={preview} money={money} preview /> : null}
          </div>
          <Button
            type="button"
            className="h-12 w-full rounded-2xl"
            disabled={mutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            Save tax &amp; service
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save tax &amp; service settings?</AlertDialogTitle>
            <AlertDialogDescription>
              New orders will use these rates. Orders already placed keep the amounts snapshotted
              when they were calculated. Cash-up still counts cash tenders only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              {mutation.isPending ? "Saving…" : "Save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
