/**
 * Phase 8H3 — Standalone POS settings.
 *
 * Only `pos_settings` is read or written here. Restaurant and hotel tax
 * configuration is untouched. Currency, timezone and business date come from
 * the property and are shown read-only.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { getPosSettings, savePosSettings } from "@/packages/standalone-pos/lib/standalone-pos.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { ErrorNotice, PosHeader, ReadOnlyNotice, canSetupPos } from "./pos-shared";

export function StandalonePosSettings({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const canEdit = canSetupPos(membership);
  const qc = useQueryClient();
  const getFn = useServerFn(getPosSettings);
  const saveFn = useServerFn(savePosSettings);

  const settings = useQuery({
    queryKey: ["pos-settings", restaurantId],
    queryFn: () => getFn({ data: { restaurantId } }),
  });

  const [taxRate, setTaxRate] = useState("");
  const [inclusive, setInclusive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setTaxRate(String(settings.data.defaultTaxRate));
    setInclusive(settings.data.taxInclusive);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const rate = Number(taxRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        throw new Error("Enter a tax rate between 0 and 100.");
      }
      return saveFn({ data: { restaurantId, defaultTaxRate: rate, taxInclusive: inclusive } });
    },
    onSuccess: async () => {
      setError(null);
      setSaved(true);
      await qc.invalidateQueries({ queryKey: ["pos-settings", restaurantId] });
    },
    onError: (e: unknown) => {
      setSaved(false);
      setError(e instanceof Error ? e.message : "Could not save the settings.");
    },
  });

  const d = settings.data;

  return (
    <div className="space-y-6">
      <PosHeader
        title="Settings"
        crumb="Settings"
        propertyName={membership.restaurant.name}
        description="How this till prices and dates its sales."
      />

      {canEdit ? null : (
        <ReadOnlyNotice>
          You can view these settings. Only an owner or manager can change them.
        </ReadOnlyNotice>
      )}

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg">Tax</h2>
        <p className="text-sm text-muted-foreground">
          Products without their own rate use this default. Nothing here affects restaurant or hotel
          tax settings.
        </p>
        <div className="grid gap-4 sm:max-w-sm">
          <div className="space-y-1.5">
            <Label htmlFor="pos-tax-rate">Default tax rate (%)</Label>
            <Input
              id="pos-tax-rate"
              inputMode="decimal"
              value={taxRate}
              disabled={!canEdit || settings.isLoading}
              onChange={(e) => {
                setTaxRate(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-3 py-2">
            <div>
              <Label htmlFor="pos-tax-inclusive">Prices include tax</Label>
              <p className="text-xs text-muted-foreground">
                {inclusive
                  ? "Tax is taken out of the shown price."
                  : "Tax is added on top of the shown price."}
              </p>
            </div>
            <Switch
              id="pos-tax-inclusive"
              checked={inclusive}
              disabled={!canEdit || settings.isLoading}
              onCheckedChange={(v) => {
                setInclusive(v);
                setSaved(false);
              }}
            />
          </div>
        </div>
        <ErrorNotice message={error} />
        {saved ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
        {canEdit ? (
          <Button onClick={() => save.mutate()} disabled={save.isPending || settings.isLoading}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg">From the property</h2>
        <p className="text-sm text-muted-foreground">
          These come from the property's own settings and are not changed here.
        </p>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Currency</dt>
            <dd className="font-medium">{d?.currency ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Time zone</dt>
            <dd className="font-medium">{d?.timezone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Business date</dt>
            <dd className="font-medium">{d?.businessDate ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg">Receipt numbering</h2>
        <p className="text-sm text-muted-foreground">
          Receipts are numbered POS-000001 upwards, counted separately for this property and
          unrelated to booking numbers. The number is issued when a sale is completed and cannot be
          changed.
        </p>
      </section>
    </div>
  );
}
