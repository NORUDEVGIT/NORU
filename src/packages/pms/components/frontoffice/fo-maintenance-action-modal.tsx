import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

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
  foActionRoomChip,
} from "@/packages/pms/components/frontoffice/fo-action-modal";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { createMaintenanceRequest } from "@/packages/pms/lib/housekeeping.functions";
import { getPmsSet4Snapshot } from "@/packages/pms/lib/pms-set4-hk-inventory.functions";
import {
  resolveMaintenanceCategoriesForCreate,
  resolvePrioritiesForCreate,
} from "@/packages/pms/lib/pms-set4-hk-inventory";
import { MAINTENANCE_HREF } from "@/packages/pms/lib/front-office-room-operations";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Could not create the work order.";
}

export function FoMaintenanceActionModal({
  restaurantId,
  stay,
  roomId,
  roomNumber,
  guestName,
  confirmation,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  stay?: FrontOfficeStay | null;
  roomId?: string | null;
  roomNumber?: string | null;
  guestName?: string;
  confirmation?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resolvedRoomId = stay?.roomId ?? roomId ?? null;
  const resolvedRoomNumber = stay?.roomNumber ?? roomNumber ?? null;
  const resolvedGuest = stay?.guestName ?? guestName ?? "Vacant";
  const resolvedConfirmation = stay?.confirmationNumber ?? confirmation ?? "";
  const resetKey = stay?.id ?? resolvedRoomId ?? "";
  const queryClient = useQueryClient();
  const create = useServerFn(createMaintenanceRequest);
  const loadSet4 = useServerFn(getPmsSet4Snapshot);
  const liveCategories = ["plumbing", "electrical", "furniture", "equipment", "other"] as const;
  const livePriorities = ["normal", "high", "urgent"] as const;
  const [category, setCategory] = useState<(typeof liveCategories)[number]>("plumbing");
  const [priority, setPriority] = useState<(typeof livePriorities)[number]>("normal");
  const [description, setDescription] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  const set4 = useQuery({
    queryKey: ["pms-set4-snapshot", restaurantId],
    queryFn: () => loadSet4({ data: { restaurantId } }),
    enabled: open,
    retry: false,
  });

  const savedCategories = resolveMaintenanceCategoriesForCreate(
    set4.data?.snapshot.maintenanceCategories,
  ).filter((row) => (liveCategories as readonly string[]).includes(row.code));
  const savedPriorities = resolvePrioritiesForCreate(
    null,
    set4.data?.snapshot.maintenancePriorities,
  ).filter((row) => (livePriorities as readonly string[]).includes(row.code));
  const categoryOptions = savedCategories.length
    ? savedCategories
    : liveCategories.map((code) => ({ code, label: code }));
  const priorityOptions = savedPriorities.length
    ? savedPriorities
    : livePriorities.map((code) => ({ code, label: code }));

  useEffect(() => {
    if (open) {
      setCategory((categoryOptions[0]?.code as (typeof liveCategories)[number]) ?? "plumbing");
      setPriority((priorityOptions[0]?.code as (typeof livePriorities)[number]) ?? "normal");
      setDescription("");
      setCreatedId(null);
    }
    // Reset against the stay, not catalogue length, so option loading does not wipe a typed description.
  }, [open, resetKey]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!resolvedRoomId) throw new Error("This stay has no assigned room.");
      return create({
        data: {
          restaurantId,
          roomId: resolvedRoomId,
          category,
          priority,
          description: description.trim(),
        },
      });
    },
    onSuccess: (row) => {
      setCreatedId(row.id);
      void queryClient.invalidateQueries({ queryKey: ["front-office"] });
      void queryClient.invalidateQueries({ queryKey: ["hk-maintenance"] });
      void queryClient.invalidateQueries({ queryKey: ["hk-rack"] });
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const workOrderLabel = createdId ? `WO-${createdId.slice(0, 8).toUpperCase()}` : null;
  const canCreate = Boolean(resolvedRoomId) && description.trim().length > 0 && !createdId;

  return (
    <FoActionModal
      open={open}
      onOpenChange={onOpenChange}
      action="Maintenance"
      guestName={resolvedGuest}
      confirmation={resolvedConfirmation}
      roomLabel={foActionRoomChip(resolvedRoomNumber)}
      size="medium"
      confirmLabel="Create Work Order"
      confirmDisabled={!canCreate}
      pending={mutation.isPending}
      hideConfirm={Boolean(createdId)}
      onConfirm={() => mutation.mutate()}
    >
      {createdId && workOrderLabel ? (
        <div className="space-y-2" data-testid="fo-maintenance-success">
          <p className="text-sm font-medium text-[#251605]">Work order created · {workOrderLabel}</p>
          <Link
            to={MAINTENANCE_HREF}
            search={{ tab: "maintenance" }}
            className="text-sm font-medium text-[#C89933] hover:underline"
          >
            View in Housekeeping
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {!resolvedRoomId ? (
            <p className="text-sm font-medium text-red-800">This stay has no assigned room.</p>
          ) : null}
          <div className="space-y-1.5">
            <Label>Issue Category</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
              <SelectTrigger className={FO_ACTION_SELECT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((row) => (
                  <SelectItem key={row.code} value={row.code}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as (typeof livePriorities)[number])}
            >
              <SelectTrigger className={FO_ACTION_SELECT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map((row) => (
                  <SelectItem key={row.code} value={row.code}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fo-maintenance-description">Description</Label>
            <Textarea
              id="fo-maintenance-description"
              className={FO_ACTION_CONTROL}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="What needs attention?"
            />
          </div>
        </div>
      )}
    </FoActionModal>
  );
}
