import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import { COMPETITOR_SETUP_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import {
  RATE_SHOPPING_EMPTY_COPY,
  RATE_SHOPPING_EMPTY_HELPER,
  RATE_SHOPPING_HEADER_HELPER,
  type CompetitorProviderMapping,
  type CompetitorRoomMapping,
  type CompetitorSetupRow,
} from "@/packages/pms/lib/revenue/rate-shopping";
import {
  createCompetitorProviderMapping,
  createCompetitorRoomMapping,
  createHotelCompetitor,
  getCompetitorSetupWorkspace,
  updateCompetitorProviderMapping,
  updateCompetitorRoomMapping,
  updateHotelCompetitor,
} from "@/packages/pms/lib/revenue/rate-shopping.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";
import { CompetitorDetailDrawer } from "./competitor-detail-drawer";
import { CompetitorFormDialog, ProviderMappingFormDialog, RoomMappingFormDialog } from "./competitor-setup-forms";

function formatStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        active
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-800"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function CompetitorSetupView({
  restaurantId,
  access,
}: {
  restaurantId: string;
  access: RevenueAccess;
}) {
  const canManage = access.canViewCommercial;
  const queryClient = useQueryClient();
  const loadWorkspace = useServerFn(getCompetitorSetupWorkspace);
  const createCompetitorFn = useServerFn(createHotelCompetitor);
  const updateCompetitorFn = useServerFn(updateHotelCompetitor);
  const createProviderFn = useServerFn(createCompetitorProviderMapping);
  const updateProviderFn = useServerFn(updateCompetitorProviderMapping);
  const createRoomFn = useServerFn(createCompetitorRoomMapping);
  const updateRoomFn = useServerFn(updateCompetitorRoomMapping);

  const query = useQuery({
    queryKey: ["competitor-setup", restaurantId],
    queryFn: () => loadWorkspace({ data: { restaurantId } }),
    retry: false,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [competitorForm, setCompetitorForm] = useState<CompetitorSetupRow | "new" | null>(null);
  const [providerForm, setProviderForm] = useState<CompetitorProviderMapping | "new" | null>(null);
  const [roomForm, setRoomForm] = useState<CompetitorRoomMapping | "new" | null>(null);

  const selected = useMemo(
    () => query.data?.competitors.find((row) => row.id === selectedId) ?? null,
    [query.data, selectedId],
  );
  const selectedProviders = useMemo(
    () => (query.data?.providerMappings ?? []).filter((row) => row.competitorId === selectedId),
    [query.data, selectedId],
  );
  const selectedRooms = useMemo(
    () => (query.data?.roomMappings ?? []).filter((row) => row.competitorId === selectedId),
    [query.data, selectedId],
  );

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["competitor-setup", restaurantId] });
  }

  const competitorMutation = useMutation({
    mutationFn: async (input: {
      competitorId?: string;
      name: string;
      locationLabel: string;
      notes: string;
      active: boolean;
    }) => {
      if (input.competitorId) {
        return updateCompetitorFn({
          data: {
            restaurantId,
            competitorId: input.competitorId,
            name: input.name,
            locationLabel: input.locationLabel,
            notes: input.notes,
            active: input.active,
          },
        });
      }
      return createCompetitorFn({
        data: {
          restaurantId,
          name: input.name,
          locationLabel: input.locationLabel,
          notes: input.notes,
          active: input.active,
        },
      });
    },
    onSuccess: (row) => {
      toast.success("Competitor saved.");
      setCompetitorForm(null);
      setSelectedId(row.id);
      refresh();
    },
    onError: (error) => toast.error(revenueUiError(error, "Competitor could not be saved.")),
  });

  const providerMutation = useMutation({
    mutationFn: async (input: {
      mappingId?: string;
      provider: string;
      externalPropertyId: string;
      externalPropertyName: string;
      active: boolean;
    }) => {
      if (!selectedId) throw new Error("COMPETITOR_NOT_FOUND");
      if (input.mappingId) {
        return updateProviderFn({
          data: {
            restaurantId,
            mappingId: input.mappingId,
            provider: input.provider,
            externalPropertyId: input.externalPropertyId,
            externalPropertyName: input.externalPropertyName,
            active: input.active,
          },
        });
      }
      return createProviderFn({
        data: {
          restaurantId,
          competitorId: selectedId,
          provider: input.provider,
          externalPropertyId: input.externalPropertyId,
          externalPropertyName: input.externalPropertyName,
          active: input.active,
        },
      });
    },
    onSuccess: () => {
      toast.success("Provider mapping saved.");
      setProviderForm(null);
      refresh();
    },
    onError: (error) => toast.error(revenueUiError(error, "Provider mapping could not be saved.")),
  });

  const roomMutation = useMutation({
    mutationFn: async (input: {
      mappingId?: string;
      provider: string;
      ourRoomTypeId: string;
      externalRoomId: string;
      externalRoomName: string;
      notes: string;
      active: boolean;
    }) => {
      if (!selectedId) throw new Error("COMPETITOR_NOT_FOUND");
      if (input.mappingId) {
        return updateRoomFn({
          data: {
            restaurantId,
            mappingId: input.mappingId,
            provider: input.provider,
            ourRoomTypeId: input.ourRoomTypeId,
            externalRoomId: input.externalRoomId,
            externalRoomName: input.externalRoomName,
            notes: input.notes,
            active: input.active,
          },
        });
      }
      return createRoomFn({
        data: {
          restaurantId,
          competitorId: selectedId,
          provider: input.provider,
          ourRoomTypeId: input.ourRoomTypeId,
          externalRoomId: input.externalRoomId,
          externalRoomName: input.externalRoomName,
          notes: input.notes,
          active: input.active,
        },
      });
    },
    onSuccess: () => {
      toast.success("Room mapping saved.");
      setRoomForm(null);
      refresh();
    },
    onError: (error) => toast.error(revenueUiError(error, "Room mapping could not be saved.")),
  });

  function toggleCompetitor(row: CompetitorSetupRow) {
    competitorMutation.mutate({
      competitorId: row.id,
      name: row.name,
      locationLabel: row.locationLabel ?? "",
      notes: row.notes ?? "",
      active: !row.active,
    });
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-16 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
        <div className="h-72 animate-pulse rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <InventoryState
        state="error"
        title={COMPETITOR_SETUP_LOAD_ERROR}
        description={revenueUiError(query.error, COMPETITOR_SETUP_LOAD_ERROR)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  if (!data) return null;

  const kpis = [
    { label: "Competitors", value: data.counts.competitors },
    { label: "Active Competitors", value: data.counts.activeCompetitors },
    { label: "Provider Mapped", value: data.counts.providerMapped },
    { label: "Room Mappings", value: data.counts.roomMappings },
    { label: "Unmapped Competitors", value: data.counts.unmappedCompetitors },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold text-[#251605]">Competitor Setup</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Configure competitor hotels and mappings for future rate shopping.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{RATE_SHOPPING_HEADER_HELPER}</p>
            </div>
            {canManage ? (
              <button type="button" className={commercialGoldButton()} onClick={() => setCompetitorForm("new")}>
                Add Competitor
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-[#E8E1D7] bg-card px-3 py-2">
                <div className="text-[10px] text-muted-foreground">{kpi.label}</div>
                <div className="font-display text-lg text-[#251605]">{kpi.value}</div>
              </div>
            ))}
          </div>

          {data.competitors.length === 0 ? (
            <div className="space-y-3">
              <InventoryState
                state="empty"
                title={RATE_SHOPPING_EMPTY_COPY}
                description={RATE_SHOPPING_EMPTY_HELPER}
              />
              {canManage ? (
                <div className="flex justify-center">
                  <button type="button" className={commercialGoldButton()} onClick={() => setCompetitorForm("new")}>
                    Add Competitor
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#E8E1D7] bg-card">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#F7F4EE] text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Competitor</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Provider Mapping</th>
                    <th className="px-3 py-2 font-medium">Room Mappings</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.competitors.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-[#E8E1D7] ${
                        selectedId === row.id ? "bg-[#F8F1E5]" : "hover:bg-[#F7F4EE]"
                      }`}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-[#251605]">{row.name}</div>
                        <div className="text-muted-foreground">{row.listHelper}</div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusChip active={row.active} />
                      </td>
                      <td className="px-3 py-2 text-[#251605]">{row.locationLabel || "—"}</td>
                      <td className="px-3 py-2 text-[#251605]">
                        {row.providerLabels.length > 0 ? row.providerLabels.join(", ") : "Not Mapped"}
                      </td>
                      <td className="px-3 py-2 text-[#251605]">
                        {row.mappedRoomTypeCount} of {row.propertyRoomTypeCount}
                      </td>
                      <td className="px-3 py-2 text-[#251605]">{formatStamp(row.updatedAt)}</td>
                      <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                        {canManage ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className={commercialOutlineButton()} aria-label="Competitor actions">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedId(row.id)}>Open</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setCompetitorForm(row)}>Edit</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleCompetitor(row)}>
                                {row.active ? "Deactivate" : "Reactivate"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-muted-foreground">View</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <CompetitorDetailDrawer
          row={selected}
          providerMappings={selectedProviders}
          roomMappings={selectedRooms}
          roomTypes={data.roomTypes}
          canManage={canManage}
          onClose={() => setSelectedId(null)}
          onEdit={() => selected && setCompetitorForm(selected)}
          onToggleActive={() => selected && toggleCompetitor(selected)}
          onAddProvider={() => setProviderForm("new")}
          onEditProvider={(mapping) => setProviderForm(mapping)}
          onToggleProvider={(mapping) =>
            providerMutation.mutate({
              mappingId: mapping.id,
              provider: mapping.provider,
              externalPropertyId: mapping.externalPropertyId,
              externalPropertyName: mapping.externalPropertyName ?? "",
              active: !mapping.active,
            })
          }
          onAddRoom={() => setRoomForm("new")}
          onEditRoom={(mapping) => setRoomForm(mapping)}
          onToggleRoom={(mapping) =>
            roomMutation.mutate({
              mappingId: mapping.id,
              provider: mapping.provider,
              ourRoomTypeId: mapping.ourRoomTypeId,
              externalRoomId: mapping.externalRoomId,
              externalRoomName: mapping.externalRoomName ?? "",
              notes: mapping.notes ?? "",
              active: !mapping.active,
            })
          }
        />
      </div>

      <CompetitorFormDialog
        open={competitorForm !== null}
        competitor={competitorForm && competitorForm !== "new" ? competitorForm : null}
        busy={competitorMutation.isPending}
        onClose={() => setCompetitorForm(null)}
        onSave={(input) =>
          competitorMutation.mutate({
            competitorId: competitorForm && competitorForm !== "new" ? competitorForm.id : undefined,
            ...input,
          })
        }
      />
      <ProviderMappingFormDialog
        open={providerForm !== null}
        mapping={providerForm && providerForm !== "new" ? providerForm : null}
        busy={providerMutation.isPending}
        onClose={() => setProviderForm(null)}
        onSave={(input) =>
          providerMutation.mutate({
            mappingId: providerForm && providerForm !== "new" ? providerForm.id : undefined,
            ...input,
          })
        }
      />
      <RoomMappingFormDialog
        open={roomForm !== null}
        mapping={roomForm && roomForm !== "new" ? roomForm : null}
        providers={selected?.providerLabels ?? []}
        roomTypes={data.roomTypes}
        busy={roomMutation.isPending}
        onClose={() => setRoomForm(null)}
        onSave={(input) =>
          roomMutation.mutate({
            mappingId: roomForm && roomForm !== "new" ? roomForm.id : undefined,
            ...input,
          })
        }
      />
    </div>
  );
}
