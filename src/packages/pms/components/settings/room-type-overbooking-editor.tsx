import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import {
  listRoomTypeOverbookingRules,
  saveRoomTypeOverbookingRule,
  type RoomTypeOverbookingRuleRow,
} from "@/packages/pms/lib/overbooking.functions";
import { OVERBOOKING_CAPACITY_NOTE } from "@/packages/pms/lib/inventory-rules-card2.server";

export function RoomTypeOverbookingEditor({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const loadRules = useServerFn(listRoomTypeOverbookingRules);
  const persistRule = useServerFn(saveRoomTypeOverbookingRule);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["room-type-overbooking-rules", restaurantId],
    queryFn: () => loadRules({ data: { restaurantId } }),
  });
  const save = useMutation({
    mutationFn: (rule: RoomTypeOverbookingRuleRow) =>
      persistRule({
        data: {
          restaurantId,
          roomTypeId: rule.roomTypeId,
          enabled: rule.enabled,
          maximumOverbooking: rule.maximumOverbooking,
          percentageLimit: rule.percentageLimit,
        },
      }),
    onSuccess: async () => {
      toast.success("Room type overbooking saved.");
      await queryClient.invalidateQueries({ queryKey: ["room-type-overbooking-rules", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["overbooking-board", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Nightly allowance uses the smaller configured limit when both are set. {OVERBOOKING_CAPACITY_NOTE}
      </p>
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading room types…</p> : null}
      {query.isError ? (
        <p className="text-sm text-destructive">Room type overbooking rules could not be loaded.</p>
      ) : null}
      <div className="space-y-2">
        {(query.data?.rules ?? []).map((rule) => (
          <RoomTypeOverbookingRow
            key={rule.roomTypeId}
            rule={rule}
            canEdit={canEdit}
            pending={save.isPending}
            onSave={(next) => save.mutate(next)}
          />
        ))}
      </div>
    </div>
  );
}

function RoomTypeOverbookingRow({
  rule,
  canEdit,
  pending,
  onSave,
}: {
  rule: RoomTypeOverbookingRuleRow;
  canEdit: boolean;
  pending: boolean;
  onSave: (rule: RoomTypeOverbookingRuleRow) => void;
}) {
  const [draft, setDraft] = useState(rule);
  return (
    <div className="grid gap-2 rounded-xl border border-[#EDE6D8] bg-white p-3 md:grid-cols-[minmax(0,1.2fr)_auto_8rem_8rem_auto] md:items-end">
      <div>
        <p className="text-sm font-medium text-[#251605]">{rule.roomTypeName}</p>
        <p className="text-xs text-muted-foreground">
          {draft.enabled ? "Enabled" : "Disabled"}
          {draft.maximumOverbooking != null ? ` · Max ${draft.maximumOverbooking}` : ""}
          {draft.percentageLimit != null ? ` · ${draft.percentageLimit}%` : ""}
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs text-[#5F554B]">
        <Switch
          checked={draft.enabled}
          disabled={!canEdit}
          onCheckedChange={(value) => setDraft({ ...draft, enabled: value === true })}
        />
        Enabled
      </label>
      <label className="text-xs text-[#5F554B]">
        Maximum
        <Input
          type="number"
          min={0}
          step={1}
          className="mt-1"
          disabled={!canEdit}
          value={draft.maximumOverbooking ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              maximumOverbooking: event.target.value === "" ? null : Number(event.target.value),
            })
          }
          aria-label={`${rule.roomTypeName} maximum overbooking`}
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
          disabled={!canEdit}
          value={draft.percentageLimit ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              percentageLimit: event.target.value === "" ? null : Number(event.target.value),
            })
          }
          aria-label={`${rule.roomTypeName} percentage limit`}
        />
      </label>
      <Button
        type="button"
        size="sm"
        disabled={!canEdit || pending}
        onClick={() => onSave(draft)}
      >
        Save
      </Button>
    </div>
  );
}
