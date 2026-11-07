import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  FoActionModal,
  FO_ACTION_CONTROL,
  FO_ACTION_SELECT,
} from "@/packages/pms/components/frontoffice/fo-action-modal";
import { labelTaskType } from "@/packages/pms/components/housekeeping/housekeeping-bits";
import {
  createHousekeepingTask,
  listHousekeepingTasks,
  updateHousekeepingTask,
} from "@/packages/pms/lib/housekeeping.functions";
import { getPmsSet4Snapshot } from "@/packages/pms/lib/pms-set4-hk-inventory.functions";
import {
  HK_STATUS_LABELS,
  resolveCleaningTypesForCreate,
  resolvePrioritiesForCreate,
  type HkStatusCode,
} from "@/packages/pms/lib/pms-set4-hk-inventory";

export type FoHkTaskRoomTarget = {
  roomId: string;
  roomNumber: string;
  occupancy: "vacant" | "occupied" | null;
  housekeepingStatus: string | null;
  guestName: string | null;
  openTaskId?: string | null;
  openTaskStatus?: string | null;
  openTaskType?: string | null;
  openTaskPriority?: string | null;
};

const OPEN_TASK = new Set(["pending", "assigned", "in_progress"]);
const FALLBACK_TYPES = ["departure_cleaning", "stayover_cleaning", "touch_up", "deep_cleaning", "re_clean"];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Could not update the cleaning task.";
}

function hkChip(status: string | null): string | null {
  const raw = String(status ?? "").trim();
  if (!raw) return null;
  if (raw in HK_STATUS_LABELS) return HK_STATUS_LABELS[raw as HkStatusCode];
  return raw.replaceAll("_", " ");
}

export function FoHousekeepingTaskModal({
  restaurantId,
  today,
  target,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  today: string;
  target: FoHkTaskRoomTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createHousekeepingTask);
  const update = useServerFn(updateHousekeepingTask);
  const fetchTasks = useServerFn(listHousekeepingTasks);
  const loadSet4 = useServerFn(getPmsSet4Snapshot);
  const [taskType, setTaskType] = useState("departure_cleaning");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");

  const set4 = useQuery({
    queryKey: ["pms-set4-snapshot", restaurantId],
    queryFn: () => loadSet4({ data: { restaurantId } }),
    enabled: open,
    retry: false,
  });
  const tasksQuery = useQuery({
    queryKey: ["hk-tasks", restaurantId, today],
    queryFn: () => fetchTasks({ data: { restaurantId, today } }),
    enabled: open && Boolean(target?.roomId),
    retry: false,
  });

  const cleaningTypes = resolveCleaningTypesForCreate(set4.data?.snapshot.cleaningPosture).filter(
    (row) => row.code !== "turn_down",
  );
  const typeOptions = cleaningTypes.length
    ? cleaningTypes
    : FALLBACK_TYPES.map((code) => ({ code, label: labelTaskType(code) }));
  const priorities = resolvePrioritiesForCreate(
    set4.data?.snapshot.cleaningPosture,
    set4.data?.snapshot.maintenancePriorities,
  );
  const priorityOptions = priorities.length
    ? priorities
    : ["normal", "high", "urgent"].map((code) => ({ code, label: labelTaskType(code) }));

  const listedOpen = (tasksQuery.data ?? []).find(
    (row) => row.roomId === target?.roomId && OPEN_TASK.has(row.status),
  );
  const openTask = listedOpen
    ? {
        id: listedOpen.id,
        type: listedOpen.taskType,
        priority: listedOpen.priority,
        status: listedOpen.status,
      }
    : target?.openTaskId && target.openTaskStatus && OPEN_TASK.has(target.openTaskStatus)
      ? {
          id: target.openTaskId,
          type: target.openTaskType ?? "cleaning",
          priority: target.openTaskPriority ?? "normal",
          status: target.openTaskStatus,
        }
      : null;

  useEffect(() => {
    if (!open) return;
    setNotes("");
    setPriority("normal");
    setTaskType(typeOptions[0]?.code ?? "departure_cleaning");
  }, [open, target?.roomId]);

  function refreshHk() {
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: ["hk-rack"] });
    void queryClient.invalidateQueries({ queryKey: ["hk-tasks"] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          restaurantId,
          roomId: target!.roomId,
          taskType: taskType as never,
          priority: priority as never,
          notes,
        },
      }),
    onSuccess: () => {
      toast.success(`Cleaning task created for Room ${target?.roomNumber}.`);
      refreshHk();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const startMutation = useMutation({
    mutationFn: () =>
      update({
        data: { restaurantId, taskId: openTask!.id, action: "start" },
      }),
    onSuccess: () => {
      toast.success(`Cleaning started for Room ${target?.roomNumber}.`);
      refreshHk();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  if (!target) return null;

  const occupancyChip =
    target.occupancy === "occupied" ? "Occupied" : target.occupancy === "vacant" ? "Vacant" : "";
  const statusChip = hkChip(target.housekeepingStatus);
  const canStart = openTask != null && openTask.status !== "in_progress";

  return (
    <FoActionModal
      open={open}
      onOpenChange={onOpenChange}
      action="Housekeeping Task"
      guestName={`Room ${target.roomNumber}`}
      confirmation={occupancyChip}
      roomLabel={statusChip ?? occupancyChip ?? "Room"}
      size="small"
      confirmLabel="Create Task"
      confirmDisabled={!target.roomId}
      pending={createMutation.isPending}
      hideConfirm={Boolean(openTask)}
      onConfirm={() => createMutation.mutate()}
      footerLeft={
        openTask && canStart ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]"
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate()}
          >
            Start Cleaning
          </Button>
        ) : null
      }
      testId="fo-hk-task-modal"
    >
      <div className="space-y-3">
        {target.occupancy === "occupied" && target.guestName ? (
          <p className="text-sm text-[#251605]">Current guest: {target.guestName}</p>
        ) : target.occupancy === "vacant" ? (
          <p className="text-sm text-[#6B5E4E]">Vacant</p>
        ) : null}

        {openTask ? (
          <section className="rounded-lg border border-[#E8DFD0] bg-white p-3">
            <p className="text-sm font-medium text-[#251605]">An active cleaning task already exists for this room.</p>
            <p className="mt-1 text-sm capitalize text-[#251605]">
              {labelTaskType(openTask.type)} · {labelTaskType(openTask.priority)} ·{" "}
              {openTask.status.replaceAll("_", " ")}
            </p>
          </section>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Task Type</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger className={FO_ACTION_SELECT}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((row) => (
                    <SelectItem key={row.code} value={row.code}>
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className={FO_ACTION_SELECT}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((row) => (
                    <SelectItem key={row.code} value={row.code} className="capitalize">
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fo-hk-task-notes">Notes</Label>
              <Textarea
                id="fo-hk-task-notes"
                className={FO_ACTION_CONTROL}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
          </>
        )}
      </div>
    </FoActionModal>
  );
}
