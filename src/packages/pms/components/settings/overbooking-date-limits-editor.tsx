import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import {
  deleteOverbookingDateLimit,
  listOverbookingDateLimits,
  listRoomTypeOverbookingRules,
  saveOverbookingDateLimit,
  type OverbookingDateLimit,
} from "@/packages/pms/lib/overbooking.functions";

const emptyDraft = {
  id: undefined as string | undefined,
  roomTypeId: "",
  startDate: "",
  endDate: "",
  enabled: true,
  maximumOverbooking: null as number | null,
  percentageLimit: null as number | null,
};

export function OverbookingDateLimitsEditor({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const loadLimits = useServerFn(listOverbookingDateLimits);
  const loadTypes = useServerFn(listRoomTypeOverbookingRules);
  const persist = useServerFn(saveOverbookingDateLimit);
  const remove = useServerFn(deleteOverbookingDateLimit);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(emptyDraft);
  const limits = useQuery({
    queryKey: ["overbooking-date-limits", restaurantId],
    queryFn: () => loadLimits({ data: { restaurantId } }),
  });
  const types = useQuery({
    queryKey: ["room-type-overbooking-rules", restaurantId],
    queryFn: () => loadTypes({ data: { restaurantId } }),
  });

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["overbooking-date-limits", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["overbooking-board", restaurantId] }),
    ]);
  }

  const save = useMutation({
    mutationFn: () =>
      persist({
        data: {
          restaurantId,
          id: draft.id,
          roomTypeId: draft.roomTypeId,
          startDate: draft.startDate,
          endDate: draft.endDate,
          enabled: draft.enabled,
          maximumOverbooking: draft.maximumOverbooking,
          percentageLimit: draft.percentageLimit,
        },
      }),
    onSuccess: async () => {
      toast.success("Date overbooking limit saved.");
      setDraft(emptyDraft);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const discard = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      toast.success("Date overbooking limit removed.");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function edit(limit: OverbookingDateLimit) {
    setDraft({
      id: limit.id,
      roomTypeId: limit.roomTypeId,
      startDate: limit.startDate,
      endDate: limit.endDate,
      enabled: limit.enabled,
      maximumOverbooking: limit.maximumOverbooking,
      percentageLimit: limit.percentageLimit,
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-[#EDE6D8] bg-white p-3">
      <div>
        <p className="text-sm font-medium text-[#251605]">Date limits</p>
        <p className="text-xs text-muted-foreground">
          The end date is the morning the limit releases, so it is not included. Use 0 to allow no extra rooms.
          Save Inventory Rules after turning date limits on. Until that save, these dates are stored and not used.
        </p>
      </div>
      {limits.isError ? (
        <p className="text-sm text-destructive">Date limits could not be loaded.</p>
      ) : null}
      <div className="space-y-2">
        {(limits.data?.limits ?? []).map((limit) => (
          <div
            key={limit.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EDE6D8] px-3 py-2 text-xs"
          >
            <p className="text-[#251605]">
              <span className="font-medium">{limit.roomTypeName}</span>
              {" · "}
              {limit.startDate} to {limit.endDate}
              {limit.maximumOverbooking != null ? ` · Max ${limit.maximumOverbooking}` : ""}
              {limit.percentageLimit != null ? ` · ${limit.percentageLimit}%` : ""}
              {limit.enabled ? "" : " · Off"}
            </p>
            {canEdit ? (
              <span className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => edit(limit)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={discard.isPending}
                  onClick={() => discard.mutate(limit.id)}
                >
                  Remove
                </Button>
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {canEdit ? (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-[#5F554B]">
            Room type
            <select
              className="mt-1 h-9 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-xs"
              value={draft.roomTypeId}
              onChange={(event) => setDraft({ ...draft, roomTypeId: event.target.value })}
            >
              <option value="">Select</option>
              {(types.data?.rules ?? []).map((rule) => (
                <option key={rule.roomTypeId} value={rule.roomTypeId}>
                  {rule.roomTypeName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[#5F554B]">
            Start
            <Input
              type="date"
              className="mt-1"
              value={draft.startDate}
              onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
            />
          </label>
          <label className="text-xs text-[#5F554B]">
            End
            <Input
              type="date"
              className="mt-1"
              value={draft.endDate}
              onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
            />
          </label>
          <label className="text-xs text-[#5F554B]">
            Maximum
            <Input
              type="number"
              min={0}
              step={1}
              className="mt-1"
              value={draft.maximumOverbooking ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  maximumOverbooking: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </label>
          <label className="text-xs text-[#5F554B]">
            Percentage
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              className="mt-1"
              value={draft.percentageLimit ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  percentageLimit: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </label>
          <label className="flex items-center gap-2 self-end text-xs text-[#5F554B]">
            <Switch
              checked={draft.enabled}
              onCheckedChange={(value) => setDraft({ ...draft, enabled: value === true })}
            />
            Enabled
          </label>
          <div className="flex gap-2 md:col-span-2 lg:col-span-3">
            <Button
              type="button"
              size="sm"
              disabled={!draft.roomTypeId || !draft.startDate || !draft.endDate || save.isPending}
              onClick={() => save.mutate()}
            >
              {draft.id ? "Update date limit" : "Add date limit"}
            </Button>
            {draft.id ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setDraft(emptyDraft)}>
                Cancel edit
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
