import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import {
  FO_FEE_DEFAULTS_HINT,
  FO_FEE_DEFAULTS_SECTION,
  canEditFoFeeDefaults,
  foFeeDefaultsBeforeAfter,
  foFeeDefaultsEqual,
  normalizeFoFeeDefaults,
  validateFoFeeDefaults,
  type FoFeeDefaults,
} from "@/packages/pms/lib/fo-fee-defaults";
import { getFoFeeDefaults, saveFoFeeDefaults } from "@/packages/pms/lib/fo-fee-defaults.functions";
import { formatMoney } from "@/shared/lib/property-time";

const EMPTY: FoFeeDefaults = {
  cancelFeeRequired: true,
  cancelFeeDefault: 0,
  noshowFeeRequired: true,
  noshowFeeDefault: 0,
};

export function FoFeeDefaultsEditor({
  restaurantId,
  role,
  currencyCode,
}: {
  restaurantId: string;
  role: string;
  currencyCode: string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getFoFeeDefaults);
  const save = useServerFn(saveFoFeeDefaults);
  const roleCanEdit = canEditFoFeeDefaults(role);

  const query = useQuery({
    queryKey: ["fo-fee-defaults", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const [draft, setDraft] = useState<FoFeeDefaults>(EMPTY);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (query.data?.defaults) setDraft(query.data.defaults);
  }, [query.data]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#cancel-noshow-fees") {
      document.getElementById("cancel-noshow-fees")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [query.data]);

  const saved = query.data?.defaults ?? EMPTY;
  const canEdit = roleCanEdit && (query.data?.canEdit ?? roleCanEdit);
  const next = normalizeFoFeeDefaults(draft);
  const validation = validateFoFeeDefaults(next);
  const unchanged = foFeeDefaultsEqual(saved, next);
  const money = (value: number) => formatMoney(value, currencyCode);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          cancelFeeRequired: next.cancelFeeRequired,
          cancelFeeDefault: next.cancelFeeDefault,
          noshowFeeRequired: next.noshowFeeRequired,
          noshowFeeDefault: next.noshowFeeDefault,
        },
      }),
    onSuccess: (result) => {
      setConfirmOpen(false);
      setDraft(result.defaults);
      toast.success("Cancel and no-show fee defaults saved.");
      void queryClient.invalidateQueries({ queryKey: ["fo-fee-defaults", restaurantId] });
    },
    onError: (error: Error) => {
      setConfirmOpen(false);
      toast.error(error.message);
    },
  });

  const rows = foFeeDefaultsBeforeAfter(saved, next);

  return (
    <section
      id="cancel-noshow-fees"
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
      data-testid="fo-fee-defaults-editor"
    >
      <div>
        <h2 className="font-display text-lg text-[#251605]">{FO_FEE_DEFAULTS_SECTION}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{FO_FEE_DEFAULTS_HINT}</p>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading fee defaults…</p>
      ) : query.isError ? (
        isPermissionDeniedMessage(query.error) ? (
          <PermissionDeniedPanel message={(query.error as Error).message} />
        ) : (
          <p className="text-sm text-destructive">{(query.error as Error).message}</p>
        )
      ) : !canEdit ? (
        <>
          <PermissionDeniedPanel message="Only a supervisor, manager or property admin can edit cancel and no-show fee defaults." />
          <FeeSummary defaults={saved} money={money} />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FeeSwitch
              id="fo-cancel-fee-required"
              label="Cancel fee required"
              checked={draft.cancelFeeRequired}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, cancelFeeRequired: checked }))}
            />
            <FeeAmount
              id="fo-cancel-fee-default"
              label="Cancel fee default"
              value={draft.cancelFeeDefault}
              onChange={(cancelFeeDefault) => setDraft((prev) => ({ ...prev, cancelFeeDefault }))}
            />
            <FeeSwitch
              id="fo-noshow-fee-required"
              label="No-show fee required"
              checked={draft.noshowFeeRequired}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, noshowFeeRequired: checked }))}
            />
            <FeeAmount
              id="fo-noshow-fee-default"
              label="No-show fee default"
              value={draft.noshowFeeDefault}
              onChange={(noshowFeeDefault) => setDraft((prev) => ({ ...prev, noshowFeeDefault }))}
            />
          </div>

          {validation ? <p className="text-sm text-destructive">{validation}</p> : null}

          <Button
            type="button"
            disabled={unchanged || !!validation || mutation.isPending}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => setConfirmOpen(true)}
          >
            Save fee defaults
          </Button>
        </>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="border-[#C89933]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#251605]">Confirm fee defaults</AlertDialogTitle>
            <AlertDialogDescription>
              Review Before → After, then confirm. Only the four existing fee columns are updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border border-[#CCCCCC] p-3" data-testid="fo-fee-defaults-before-after">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Before → After</p>
            <dl className="mt-2 space-y-2 text-sm">
              {rows.map((row) => (
                <div key={row.id} className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Previous {row.label}</dt>
                    <dd className="text-[#251605]">
                      {row.id === "cancelFeeDefault" || row.id === "noshowFeeDefault"
                        ? money(saved[row.id])
                        : row.previous}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">New {row.label}</dt>
                    <dd className="text-[#436436]">
                      {row.id === "cancelFeeDefault" || row.id === "noshowFeeDefault"
                        ? money(next[row.id])
                        : row.next}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || !!validation}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              {mutation.isPending ? "Saving…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function FeeSummary({ defaults, money }: { defaults: FoFeeDefaults; money: (value: number) => string }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 text-sm" data-testid="fo-fee-defaults-readonly">
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Cancel fee required</dt>
        <dd>{defaults.cancelFeeRequired ? "Required" : "Not required"}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Cancel fee default</dt>
        <dd>{money(defaults.cancelFeeDefault)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">No-show fee required</dt>
        <dd>{defaults.noshowFeeRequired ? "Required" : "Not required"}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">No-show fee default</dt>
        <dd>{money(defaults.noshowFeeDefault)}</dd>
      </div>
    </dl>
  );
}

function FeeSwitch({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function FeeAmount({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "" || raw === ".") {
            onChange(0);
            return;
          }
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) ? parsed : value);
        }}
        className="h-12 rounded-xl"
      />
    </div>
  );
}
