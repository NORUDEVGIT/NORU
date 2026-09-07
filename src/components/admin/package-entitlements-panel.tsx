/**
 * Phase 8B2 — Platform Admin package entitlement controls.
 *
 * Commercial layer only: this decides what a property has been sold, not who
 * inside that property may use it (that stays with staff module access).
 * Nothing in the tenant product reads these values yet.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { PACKAGE_LABELS, type PackageKey } from "@/lib/package-entitlements";
import {
  clearPropertyPackageEntitlement,
  getPackageEntitlementsAdmin,
  setPropertyPackageEntitlement,
  type AdminPackageState,
} from "@/lib/package-entitlements.functions";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export function PackageEntitlementsPanel({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPackageEntitlementsAdmin);
  const save = useServerFn(setPropertyPackageEntitlement);
  const reset = useServerFn(clearPropertyPackageEntitlement);

  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});
  const [confirmKey, setConfirmKey] = useState<PackageKey | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-packages", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-packages", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-restaurant", restaurantId] });
  };

  const mutation = useMutation({
    mutationFn: (input: { packageKey: PackageKey; enabled: boolean; expiresAt: string | null }) =>
      save({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      setConfirmKey(null);
      toast.success("Package updated.");
      invalidate();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "That change could not be saved."),
  });

  const resetMutation = useMutation({
    mutationFn: (packageKey: PackageKey) => reset({ data: { restaurantId, packageKey } }),
    onSuccess: () => {
      toast.success("Package returned to the compatibility default.");
      invalidate();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "That change could not be saved."),
  });

  const busy = mutation.isPending || resetMutation.isPending;

  const expiryFor = (s: AdminPackageState) =>
    expiryDrafts[s.packageKey] ?? toLocalInput(s.expiresAt);

  const expiryIso = (s: AdminPackageState): string | null => {
    const raw = expiryFor(s);
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new Error("That expiry date isn't valid.");
    return d.toISOString();
  };

  const submit = (s: AdminPackageState, enabled: boolean) => {
    try {
      const expiresAt = expiryIso(s);
      if (enabled && expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        toast.error("An expiry date must be in the future.");
        return;
      }
      mutation.mutate({ packageKey: s.packageKey, enabled, expiresAt });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That expiry date isn't valid.");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Package entitlements</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What this customer has bought. Staff permissions are managed separately inside the property
        and are not affected by these controls.
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading packages…</p>
      ) : error || !data ? (
        <p className="mt-4 text-sm text-destructive">Administrator access required.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {data.map((s) => {
            const expired = s.enabledFlag && !s.enabled;
            return (
              <div key={s.packageKey} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{PACKAGE_LABELS[s.packageKey]}</p>
                    <p className="text-xs text-muted-foreground">
                      Source:{" "}
                      {s.source === "explicit" ? "Explicit entitlement" : "Compatibility default"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      s.enabled
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {s.enabled ? "Enabled" : expired ? "Expired" : "Disabled"}
                  </span>
                </div>

                {s.source === "explicit" ? (
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>Activated: {fmt(s.activatedAt)}</span>
                    <span>Expires: {fmt(s.expiresAt)}</span>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="grow sm:grow-0">
                    <Label className="text-xs" htmlFor={`expiry-${s.packageKey}`}>
                      Expiry (optional)
                    </Label>
                    <Input
                      id={`expiry-${s.packageKey}`}
                      type="datetime-local"
                      className="mt-1 w-56"
                      value={expiryFor(s)}
                      onChange={(e) =>
                        setExpiryDrafts((d) => ({ ...d, [s.packageKey]: e.target.value }))
                      }
                    />
                  </div>
                  {expiryFor(s) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setExpiryDrafts((d) => ({ ...d, [s.packageKey]: "" }))}
                    >
                      Clear expiry
                    </Button>
                  ) : null}
                </div>

                {confirmKey === s.packageKey ? (
                  <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3">
                    <p className="text-sm">
                      Disable {PACKAGE_LABELS[s.packageKey]} for this property? This prepares the
                      package to become unavailable once package enforcement is switched on. Nothing
                      changes for the customer today.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() => submit(s, false)}
                      >
                        {busy ? "Working…" : "Confirm disable"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmKey(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={() => submit(s, true)}>
                      {s.enabled && s.source === "explicit" ? "Save as enabled" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => setConfirmKey(s.packageKey)}
                    >
                      Disable
                    </Button>
                    {s.source === "explicit" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setExpiryDrafts((d) => ({ ...d, [s.packageKey]: "" }));
                          resetMutation.mutate(s.packageKey);
                        }}
                      >
                        Reset to compatibility default
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
