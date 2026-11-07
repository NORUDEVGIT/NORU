import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoreHorizontal, Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  evaluateCard2RoomTypesReadiness,
  listRooms,
  listRoomTypes,
  type RoomType,
} from "@/packages/pms/lib/rooms.functions";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import { RoomTypeWizard } from "@/packages/pms/components/settings/room-type-wizard/room-type-wizard";
import type { WizardStepId } from "@/packages/pms/components/settings/room-type-wizard/room-type-wizard-types";

export function PmsPropertySetupCard2RoomTypes({
  restaurantId,
  canEdit,
  onReadiness,
  registerActions,
}: {
  restaurantId: string;
  canEdit: boolean;
  onReadiness: (status: PropertySetupCardStatus, blockers: string[]) => void;
  registerActions: (actions: {
    saveDraft: () => Promise<boolean>;
    saveAndContinue: () => Promise<boolean>;
  }) => void;
}) {
  const queryClient = useQueryClient();
  const fetchTypes = useServerFn(listRoomTypes);
  const fetchRooms = useServerFn(listRooms);
  const fetchReady = useServerFn(evaluateCard2RoomTypesReadiness);

  const [wizard, setWizard] = useState<{
    type: RoomType | null;
    initialStep?: WizardStepId;
  } | null>(null);

  const typesQuery = useQuery({
    queryKey: ["pms-card2-room-types", restaurantId],
    queryFn: () => fetchTypes({ data: { restaurantId, includeInactive: true } }),
  });
  const roomsQuery = useQuery({
    queryKey: ["pms-card2-rooms", restaurantId],
    queryFn: () => fetchRooms({ data: { restaurantId, includeInactive: true } }),
  });
  const readyQuery = useQuery({
    queryKey: ["pms-card2-room-types-ready", restaurantId],
    queryFn: () => fetchReady({ data: { restaurantId } }),
    enabled: canEdit,
  });

  const types = typesQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];
  const readiness = readyQuery.data;
  const disabled = !canEdit;

  useEffect(() => {
    if (!readiness) return;
    onReadiness(readiness.stepStatus, readiness.blockers);
  }, [readiness, onReadiness]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-rooms", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types-ready", restaurantId] });
  }

  async function saveDraft(): Promise<boolean> {
    if (!canEdit) return false;
    await readyQuery.refetch();
    return true;
  }

  async function saveAndContinue(): Promise<boolean> {
    const saved = await saveDraft();
    if (!saved) return false;
    const latest = await fetchReady({ data: { restaurantId } });
    onReadiness(latest.stepStatus, latest.blockers);
    if (!latest.ready) {
      toast.error(latest.blockers[0] ?? "Room Types & Rooms is not complete yet.");
      return false;
    }
    return true;
  }

  useEffect(() => {
    registerActions({ saveDraft, saveAndContinue });
  });

  function openCreate() {
    setWizard({ type: null });
  }

  return (
    <div className="space-y-4" data-testid="pms-card2-room-types-form">
      {wizard ? (
        <RoomTypeWizard
          key={`${wizard.type?.id ?? "create"}-${wizard.initialStep ?? 1}`}
          restaurantId={restaurantId}
          canEdit={canEdit}
          initialType={wizard.type}
          initialStep={wizard.initialStep}
          initialRoomsForType={
            wizard.type ? rooms.filter((room) => room.roomTypeId === wizard.type?.id) : []
          }
          onClose={() => setWizard(null)}
          onCompleted={() => {
            setWizard(null);
            refresh();
          }}
        />
      ) : null}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg text-[#251605]">Room Types</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={openCreate}
          >
            <Plus className="mr-1 h-4 w-4" />
            New room type
          </Button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-[#E6DFD3] bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[#F7F4EE] text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Cover</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Occupancy</th>
                <th className="px-3 py-2">Rooms</th>
                <th className="px-3 py-2">Base Price</th>
                <th className="px-3 py-2">Sellable</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {types.map((row) => (
                <tr key={row.id} className="border-t border-[#EDE6D8] hover:bg-[#FBF9F5]">
                  <td className="px-3 py-2">
                    {row.coverUrl ? (
                      <img
                        src={row.coverUrl}
                        alt=""
                        className="h-10 w-14 rounded-md object-cover"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-[#251605]">{row.code}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.category || "—"}</td>
                  <td className="px-3 py-2">{row.class || "—"}</td>
                  <td className="px-3 py-2">
                    {row.standardOccupancy} / {row.maxOccupancy}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {rooms.filter((r) => r.roomTypeId === row.id).length || row.roomCount || 0}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[#251605]">
                    {row.baseNightlyRate != null
                      ? `ETB ${Number(row.baseNightlyRate).toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{row.sellable ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${row.active ? "bg-green-500" : "bg-red-500"}`}
                      />
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#251605] hover:bg-[#F4EDE0]"
                          aria-label={`Actions for ${row.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 border-[#DDD4C5]">
                        <DropdownMenuItem
                          disabled={disabled}
                          onSelect={() => setWizard({ type: row })}
                        >
                          Edit Room Type
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={disabled}
                          onSelect={() => setWizard({ type: row, initialStep: 4 })}
                        >
                          Manage Images
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {types.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center">
                    <p className="text-sm text-muted-foreground">No room types configured</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      disabled={disabled}
                      onClick={openCreate}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      New room type
                    </Button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
