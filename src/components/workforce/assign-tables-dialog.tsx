import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listRestaurantTables } from "@/lib/tables.functions";
import {
  assignTableToShift,
  listShiftTableAssignments,
  removeTableAssignment,
  type ShiftRecord,
} from "@/lib/workforce.functions";
import { formatShiftTime } from "@/lib/workforce-rules";

/** Simple checkbox list of active tables for one shift. No drag/drop, zones or floor plans. */
export function AssignTablesDialog({
  restaurantId,
  shift,
  onClose,
}: {
  restaurantId: string;
  shift: ShiftRecord | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchTables = useServerFn(listRestaurantTables);
  const fetchAssignments = useServerFn(listShiftTableAssignments);
  const assignFn = useServerFn(assignTableToShift);
  const removeFn = useServerFn(removeTableAssignment);

  const { data: tableData, isLoading: tablesLoading } = useQuery({
    queryKey: ["restaurant-tables", restaurantId],
    queryFn: () => fetchTables({ data: { restaurantId } }),
    enabled: !!shift,
  });

  const {
    data: assignments,
    isLoading: assignmentsLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["workforce-shift-tables", restaurantId, shift?.id],
    queryFn: () => fetchAssignments({ data: { restaurantId, shiftId: shift!.id } }),
    enabled: !!shift,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["workforce-shift-tables", restaurantId, shift?.id] });
    void queryClient.invalidateQueries({ queryKey: ["workforce-shifts", restaurantId] });
  };

  const assignMutation = useMutation({
    mutationFn: (restaurantTableId: string) =>
      assignFn({ data: { restaurantId, shiftId: shift!.id, restaurantTableId } }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.message);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) => removeFn({ data: { restaurantId, assignmentId } }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.message);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activeTables = (tableData?.tables ?? []).filter((t) => t.active);
  const byTableId = new Map((assignments ?? []).map((a) => [a.restaurantTableId, a.id]));
  const busy = assignMutation.isPending || removeMutation.isPending;

  return (
    <Dialog open={!!shift} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign tables</DialogTitle>
          <DialogDescription>
            {shift
              ? `${shift.staffName ?? "Staff"} · ${shift.shiftDate} · ${formatShiftTime(shift.startTime)}–${formatShiftTime(shift.endTime)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {tablesLoading || assignmentsLoading ? (
          <p className="text-sm text-muted-foreground">Loading tables…</p>
        ) : isError ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">We couldn't load table assignments.</p>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : activeTables.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active tables in this restaurant yet.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {activeTables.map((table) => {
              const assignmentId = byTableId.get(table.id);
              return (
                <li key={table.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 hover:bg-muted">
                    <Checkbox
                      checked={!!assignmentId}
                      disabled={busy}
                      onCheckedChange={(checked) => {
                        if (checked && !assignmentId) assignMutation.mutate(table.id);
                        if (!checked && assignmentId) removeMutation.mutate(assignmentId);
                      }}
                    />
                    <span className="text-sm font-medium">
                      {table.name ? `${table.tableNumber} — ${table.name}` : `Table ${table.tableNumber}`}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
