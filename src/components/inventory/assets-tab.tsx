import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, MapPin, MoreHorizontal, Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  ASSET_CONDITION_LABEL,
  ASSET_STATUS_LABEL,
  AssetDisposeDialog,
  AssetFormDialog,
  AssetHistoryDialog,
  AssetQuickChangeDialog,
  type AssetFormValues,
  type QuickField,
} from "@/components/inventory/asset-dialogs";
import {
  createRestaurantAsset,
  disposeRestaurantAsset,
  listAssetHistory,
  listRestaurantAssets,
  updateRestaurantAsset,
  type RestaurantAsset,
} from "@/lib/assets.functions";
import type { AssetCondition, AssetStatus, AssetType, WarrantyState } from "@/lib/assets.server";
import { useMoney, useRestaurantTime } from "@/core/state/restaurant-context";
import { cn } from "@/shared/lib/utils";

const STATUS_STYLE: Record<AssetStatus, string> = {
  active: "bg-success/15 text-success",
  under_maintenance: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  out_of_service: "bg-destructive/10 text-destructive",
  disposed: "bg-muted text-muted-foreground",
};

const CONDITION_STYLE: Record<AssetCondition, string> = {
  excellent: "bg-success/15 text-success",
  good: "bg-primary/10 text-primary",
  fair: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  damaged: "bg-destructive/10 text-destructive",
};

const WARRANTY_LABEL: Record<WarrantyState, string> = {
  none: "—",
  valid: "Valid",
  expiring: "Expiring soon",
  expired: "Expired",
};

const WARRANTY_STYLE: Record<WarrantyState, string> = {
  none: "text-muted-foreground",
  valid: "text-success",
  expiring: "text-amber-600",
  expired: "text-destructive",
};

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", className)}>{label}</span>;
}

export function AssetsTab({ restaurantId, assetType }: { restaurantId: string; assetType: AssetType }) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const { dateTime, date } = useRestaurantTime();
  const isEquipment = assetType === "equipment";

  const fetchAssets = useServerFn(listRestaurantAssets);
  const fetchHistory = useServerFn(listAssetHistory);
  const createAsset = useServerFn(createRestaurantAsset);
  const editAsset = useServerFn(updateRestaurantAsset);
  const dispose = useServerFn(disposeRestaurantAsset);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AssetStatus>("all");
  const [conditionFilter, setConditionFilter] = useState<"all" | AssetCondition>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [showDisposed, setShowDisposed] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantAsset | null>(null);
  const [quick, setQuick] = useState<{ asset: RestaurantAsset; field: QuickField } | null>(null);
  const [disposing, setDisposing] = useState<RestaurantAsset | null>(null);
  const [historyAsset, setHistoryAsset] = useState<RestaurantAsset | null>(null);

  const assetsQuery = useQuery({
    queryKey: ["restaurant-assets", restaurantId, assetType, showDisposed],
    queryFn: () => fetchAssets({ data: { restaurantId, assetType, includeDisposed: showDisposed } }),
  });

  const historyQuery = useQuery({
    queryKey: ["restaurant-asset-history", restaurantId, historyAsset?.id],
    queryFn: () => fetchHistory({ data: { restaurantId, assetId: historyAsset!.id } }),
    enabled: !!historyAsset,
  });

  const canManage = !!assetsQuery.data?.permissions.canManage;
  const assets = assetsQuery.data?.assets ?? [];

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["restaurant-assets", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["restaurant-asset-overview", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["restaurant-asset-history", restaurantId] });
  }

  function handleResult(result: { ok: boolean; message?: string }, successMessage: string, onDone: () => void) {
    if (!result.ok) {
      toast.error(result.message ?? "That change could not be saved.");
      return;
    }
    toast.success(successMessage);
    onDone();
    refresh();
  }

  const createMutation = useMutation({
    mutationFn: (values: AssetFormValues) => createAsset({ data: { restaurantId, assetType, ...values } }),
    onSuccess: (r) => handleResult(r, "Asset created.", () => setFormOpen(false)),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (input: Partial<AssetFormValues> & { assetId: string; changeNote?: string | null }) =>
      editAsset({ data: { restaurantId, ...input } }),
    onSuccess: (r) =>
      handleResult(r, "Asset updated.", () => {
        setFormOpen(false);
        setEditing(null);
        setQuick(null);
      }),
    onError: (e: Error) => toast.error(e.message),
  });

  const disposeMutation = useMutation({
    mutationFn: (input: { assetId: string; reason: string | null }) => dispose({ data: { restaurantId, ...input } }),
    onSuccess: (r) => handleResult(r, "Asset marked as disposed.", () => setDisposing(null)),
    onError: (e: Error) => toast.error(e.message),
  });

  const locations = useMemo(
    () => [...new Set(assets.map((a) => a.location).filter(Boolean) as string[])].sort(),
    [assets],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (conditionFilter !== "all" && a.condition !== conditionFilter) return false;
      if (locationFilter !== "all" && (a.location ?? "") !== locationFilter) return false;
      if (!q) return true;
      return [a.name, a.assetCode ?? "", a.serialNumber ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [assets, search, statusFilter, conditionFilter, locationFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={isEquipment ? "Search name, code or serial" : "Search name or asset code"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{ASSET_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={conditionFilter} onValueChange={(v) => setConditionFilter(v as typeof conditionFilter)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Condition" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All conditions</SelectItem>
            {(Object.keys(ASSET_CONDITION_LABEL) as AssetCondition[]).map((c) => (
              <SelectItem key={c} value={c}>{ASSET_CONDITION_LABEL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {locations.length > 0 ? (
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => setShowDisposed((v) => !v)}>
          {showDisposed ? "Hide disposed" : "Show disposed"}
        </Button>
        {canManage ? (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">{isEquipment ? "New equipment" : "New asset"}</span>
          </Button>
        ) : null}
      </div>

      {assetsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading assets…</p>
      ) : assetsQuery.isError ? (
        <p className="text-sm text-destructive">
          {(assetsQuery.error as Error)?.message ?? "We couldn't load the asset register."}
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No {isEquipment ? "equipment" : "operating assets"} yet.
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Asset code</th>
                  {isEquipment ? <th className="px-4 py-3">Serial</th> : <th className="px-4 py-3">Quantity</th>}
                  <th className="px-4 py-3">Condition</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Location</th>
                  {isEquipment ? <th className="px-4 py-3">Warranty</th> : null}
                  <th className="px-4 py-3">Purchase cost</th>
                  {isEquipment ? null : <th className="px-4 py-3">Last updated</th>}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((a) => (
                  <tr key={a.id} className={cn(a.status === "disposed" && "opacity-60")}>
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.assetCode ?? "—"}</td>
                    {isEquipment ? (
                      <td className="px-4 py-3 text-muted-foreground">{a.serialNumber ?? "—"}</td>
                    ) : (
                      <td className="px-4 py-3 tabular-nums">{a.quantity}</td>
                    )}
                    <td className="px-4 py-3">
                      <Badge label={ASSET_CONDITION_LABEL[a.condition]} className={CONDITION_STYLE[a.condition]} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={ASSET_STATUS_LABEL[a.status]} className={STATUS_STYLE[a.status]} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.location ?? "—"}</td>
                    {isEquipment ? (
                      <td className={cn("px-4 py-3 text-xs font-medium", WARRANTY_STYLE[a.warranty])}>
                        {WARRANTY_LABEL[a.warranty]}
                        {a.warrantyExpiry ? (
                          <span className="block text-muted-foreground">{date(`${a.warrantyExpiry}T12:00:00Z`)}</span>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="px-4 py-3">{a.purchaseCost === null ? "—" : money(a.purchaseCost)}</td>
                    {isEquipment ? null : (
                      <td className="px-4 py-3 text-xs text-muted-foreground">{dateTime(a.updatedAt)}</td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <AssetActions
                        asset={a}
                        canManage={canManage}
                        onQuick={(field) => setQuick({ asset: a, field })}
                        onEdit={() => {
                          setEditing(a);
                          setFormOpen(true);
                        }}
                        onDispose={() => setDisposing(a)}
                        onHistory={() => setHistoryAsset(a)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <ul className="space-y-3 lg:hidden">
            {filtered.map((a) => (
              <li
                key={a.id}
                className={cn("rounded-2xl border border-border bg-card p-4", a.status === "disposed" && "opacity-60")}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.assetCode ?? "No code"}
                      {isEquipment ? ` · ${a.serialNumber ?? "No serial"}` : ` · Qty ${a.quantity}`}
                    </p>
                  </div>
                  <AssetActions
                    asset={a}
                    canManage={canManage}
                    onQuick={(field) => setQuick({ asset: a, field })}
                    onEdit={() => {
                      setEditing(a);
                      setFormOpen(true);
                    }}
                    onDispose={() => setDisposing(a)}
                    onHistory={() => setHistoryAsset(a)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <Badge label={ASSET_CONDITION_LABEL[a.condition]} className={CONDITION_STYLE[a.condition]} />
                  <Badge label={ASSET_STATUS_LABEL[a.status]} className={STATUS_STYLE[a.status]} />
                  <span className="text-muted-foreground">{a.location ?? "No location"}</span>
                  <span className="text-muted-foreground">
                    {a.purchaseCost === null ? "No cost" : money(a.purchaseCost)}
                  </span>
                  {isEquipment && a.warranty !== "none" ? (
                    <span className={WARRANTY_STYLE[a.warranty]}>Warranty {WARRANTY_LABEL[a.warranty]}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <AssetFormDialog
        open={formOpen}
        asset={editing}
        assetType={assetType}
        submitting={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(values) =>
          editing ? updateMutation.mutate({ ...values, assetId: editing.id }) : createMutation.mutate(values)
        }
      />

      <AssetQuickChangeDialog
        open={!!quick}
        asset={quick?.asset ?? null}
        field={quick?.field ?? "status"}
        submitting={updateMutation.isPending}
        onClose={() => setQuick(null)}
        onSubmit={(values) => (quick ? updateMutation.mutate({ ...values, assetId: quick.asset.id }) : undefined)}
      />

      <AssetDisposeDialog
        open={!!disposing}
        asset={disposing}
        submitting={disposeMutation.isPending}
        onClose={() => setDisposing(null)}
        onSubmit={(reason) => (disposing ? disposeMutation.mutate({ assetId: disposing.id, reason }) : undefined)}
      />

      <AssetHistoryDialog
        open={!!historyAsset}
        asset={historyAsset}
        entries={historyQuery.data ?? []}
        loading={historyQuery.isLoading}
        onClose={() => setHistoryAsset(null)}
      />
    </div>
  );
}

function AssetActions({
  asset,
  canManage,
  onQuick,
  onEdit,
  onDispose,
  onHistory,
}: {
  asset: RestaurantAsset;
  canManage: boolean;
  onQuick: (field: QuickField) => void;
  onEdit: () => void;
  onDispose: () => void;
  onHistory: () => void;
}) {
  const editable = canManage && asset.status !== "disposed";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${asset.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {editable ? (
          <>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="mr-2 size-4" /> Edit asset
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onQuick("condition")}>Change condition</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onQuick("status")}>
              <Wrench className="mr-2 size-4" /> Change status
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onQuick("location")}>
              <MapPin className="mr-2 size-4" /> Change location
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onQuick("quantity")}>Update quantity</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDispose}>
              <Trash2 className="mr-2 size-4" /> Mark disposed
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onSelect={onHistory}>
          <History className="mr-2 size-4" /> View history
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
