import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { invalidateFrontOfficeOwnerReads } from "@/packages/pms/lib/fo-freshness";
import {
  PMS_OP_DATE,
  PMS_OP_INPUT,
  PMS_OP_PLACEHOLDER,
} from "@/packages/pms/lib/pms-operational-surface";
import {
  createMaintenanceRequest,
  getRoomRestrictionPolicy,
  listMaintenanceRequests,
  setRoomRestriction,
} from "@/packages/pms/lib/housekeeping.functions";
import {
  OOO_MAINTENANCE_TICKET_MESSAGE,
  outOfOrderNeedsMaintenanceTicket,
  staffRestrictionError,
} from "@/packages/pms/lib/room-restriction-policy";
import type { HotelRoom } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { formatRoomTypeName, statusPhrase } from "./room-board-utils";
import { localToday } from "./room-detail-format";
import { dateLabel } from "./room-inventory-utils";

export type RoomRestrictionMode = "available" | "out_of_order" | "out_of_service";

export interface RoomRestrictionTarget {
  room: HotelRoom;
  status: RoomRestrictionMode;
}

const REASON_MAX = 400;

const TYPE_OPTIONS: Array<{
  value: "out_of_order" | "out_of_service";
  title: string;
  code: string;
  description: string;
}> = [
  {
    value: "out_of_order",
    title: "Out of Order",
    code: "OOO",
    description: "The room cannot be used until it is repaired. It leaves sellable availability.",
  },
  {
    value: "out_of_service",
    title: "Out of Service",
    code: "OOS",
    description: "The room is temporarily withheld from use, for example during minor work.",
  },
];

/**
 * Controlled modal for Out of Order / Out of Service and Return to Service.
 * It calls the canonical room restriction service and adds no business rules of its own.
 */
export function RoomRestrictionDialog({
  restaurantId,
  target,
  onClose,
}: {
  restaurantId: string;
  target: RoomRestrictionTarget | null;
  onClose: () => void;
}) {
  const restrictRoom = useServerFn(setRoomRestriction);
  const fetchPolicy = useServerFn(getRoomRestrictionPolicy);
  const createRequest = useServerFn(createMaintenanceRequest);
  const fetchMaintenance = useServerFn(listMaintenanceRequests);
  const queryClient = useQueryClient();
  const today = useMemo(localToday, []);

  const [type, setType] = useState<"out_of_order" | "out_of_service">("out_of_order");
  const [reason, setReason] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [maintenanceRef, setMaintenanceRef] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [returnInstead, setReturnInstead] = useState(false);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [requestCategory, setRequestCategory] = useState("plumbing");
  const [requestPriority, setRequestPriority] = useState("normal");
  const [requestDescription, setRequestDescription] = useState("");

  const room = target?.room ?? null;
  const returning = target?.status === "available" || returnInstead;

  useEffect(() => {
    if (!target) return;
    setReturnInstead(false);
    setCreatingRequest(false);
    setRequestDescription("");
    setType(target.status === "out_of_service" ? "out_of_service" : "out_of_order");
    setReason(target.room.restrictionReason ?? "");
    setExpectedReturn(target.room.restrictionExpectedReturn?.slice(0, 10) ?? "");
    setMaintenanceRef("");
    setConfirmed(false);
    setTouched(false);
  }, [target]);

  const maintenanceQuery = useQuery({
    queryKey: ["room-restriction-maintenance", restaurantId],
    queryFn: () => fetchMaintenance({ data: { restaurantId } }),
    enabled: Boolean(target) && !returning,
    retry: false,
  });
  const policyQuery = useQuery({
    queryKey: ["room-restriction-policy", restaurantId],
    queryFn: () => fetchPolicy({ data: { restaurantId } }),
    enabled: Boolean(target) && !returning,
    retry: false,
    staleTime: 60_000,
  });
  const openRequests = useMemo(
    () =>
      (maintenanceQuery.data ?? []).filter(
        (request) =>
          request.roomId === room?.id &&
          (request.status === "open" || request.status === "in_progress"),
      ),
    [maintenanceQuery.data, room?.id],
  );
  const selectedRequest = openRequests.find((request) => request.id === maintenanceRef) ?? null;
  const linkedRequestId =
    selectedRequest?.id ?? (maintenanceRef && !maintenanceQuery.isSuccess ? maintenanceRef : null);
  const ticketRequired = outOfOrderNeedsMaintenanceTicket(
    returning ? "available" : type,
    policyQuery.data?.oooMaintenanceTicketRequired === true,
  );
  const oooRulePending = !returning && type === "out_of_order" && policyQuery.isLoading;
  const oooRuleUnavailable = !returning && type === "out_of_order" && policyQuery.isError;

  const trimmedReason = reason.trim();
  const returnInPast = expectedReturn !== "" && expectedReturn < today;
  const issues: string[] = [];
  if (!returning) {
    if (!trimmedReason) issues.push("Enter the reason for this restriction.");
    if (returnInPast) issues.push("Expected return cannot be before today.");
    if (oooRuleUnavailable) {
      issues.push(
        "The Out of Order maintenance rule could not be loaded. Try again before confirming.",
      );
    }
    if (ticketRequired && !linkedRequestId) issues.push(OOO_MAINTENANCE_TICKET_MESSAGE);
    if (!confirmed) issues.push("Confirm the restriction to continue.");
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Choose a room.");
      return restrictRoom({
        data: {
          restaurantId,
          roomId: target.room.id,
          status: returning ? "available" : type,
          reason: returning ? undefined : trimmedReason,
          expectedReturn: returning ? null : expectedReturn || null,
          maintenanceRequestId:
            !returning && type === "out_of_order" ? (linkedRequestId ?? null) : null,
        },
      });
    },
    onSuccess: async () => {
      toast.success(
        returning
          ? `Room ${room?.roomNumber ?? ""} returned to service.`
          : `Room ${room?.roomNumber ?? ""} set ${type === "out_of_order" ? "Out of Order" : "Out of Service"}.`,
      );
      onClose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["room-board-rooms", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["rooms-dashboard", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["room-inventory-history", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["room-detail-hk-history", restaurantId] }),
      ]);
      invalidateFrontOfficeOwnerReads(queryClient);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!room) throw new Error("Choose a room.");
      const description = requestDescription.trim();
      if (!description) throw new Error("Describe the maintenance request.");
      return createRequest({
        data: {
          restaurantId,
          roomId: room.id,
          category: requestCategory as
            "plumbing" | "electrical" | "furniture" | "equipment" | "other",
          priority: requestPriority as "normal" | "high" | "urgent",
          description,
        },
      });
    },
    onSuccess: async (created) => {
      setMaintenanceRef(created.id);
      setCreatingRequest(false);
      setRequestDescription("");
      toast.success("Maintenance request created and linked.");
      await queryClient.invalidateQueries({
        queryKey: ["room-restriction-maintenance", restaurantId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["room-inventory-maintenance", restaurantId],
      });
    },
  });

  function submit() {
    setTouched(true);
    if (issues.length > 0) return;
    mutation.mutate();
  }

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) =>
        !open && !mutation.isPending && !createMutation.isPending && onClose()
      }
    >
      <DialogContent
        data-testid="room-restriction-dialog"
        className="z-[100] max-h-[90vh] w-[min(94vw,560px)] max-w-none gap-0 overflow-hidden rounded-xl border-[#DDD4C5] bg-[#FBF7F1] p-0"
      >
        <DialogHeader className="space-y-0.5 border-b border-[#2E1F10] bg-[#1F140A] px-5 py-3.5 text-left">
          <DialogTitle className="font-display text-sm font-semibold text-white">
            {creatingRequest
              ? `New maintenance request · Room ${room?.roomNumber ?? ""}`
              : returning
                ? `Return Room ${room?.roomNumber ?? ""} to Service`
                : `Set Room ${room?.roomNumber ?? ""} Out of Order / Out of Service`}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#C4B6A0]">
            {room ? formatRoomTypeName(room.roomTypeName) : ""}
            {room?.building ? ` · ${room.building}` : ""}
            {room?.floor ? ` · Floor ${room.floor}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] space-y-4 overflow-y-auto px-5 py-4">
          {creatingRequest ? (
            <div className="space-y-3" data-testid="room-restriction-create-request">
              <p className="text-xs leading-5 text-[#5C5346]">
                This request is logged for Room {room?.roomNumber}. After it is saved, it is
                selected on the Out of Order form.
              </p>
              <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
                Category
                <select
                  value={requestCategory}
                  onChange={(event) => setRequestCategory(event.target.value)}
                  className={cn(PMS_OP_INPUT, "appearance-none")}
                >
                  <option value="plumbing">Plumbing</option>
                  <option value="electrical">Electrical</option>
                  <option value="furniture">Furniture</option>
                  <option value="equipment">Equipment</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
                Priority
                <select
                  value={requestPriority}
                  onChange={(event) => setRequestPriority(event.target.value)}
                  className={cn(PMS_OP_INPUT, "appearance-none")}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
                Description
                <Textarea
                  value={requestDescription}
                  onChange={(event) => setRequestDescription(event.target.value)}
                  maxLength={1000}
                  placeholder="What needs to be repaired?"
                  data-testid="room-restriction-request-description"
                  className={cn(PMS_OP_INPUT, PMS_OP_PLACEHOLDER, "min-h-20 resize-none")}
                />
              </label>
              {createMutation.isError ? (
                <p className="text-xs text-destructive" role="alert">
                  {createMutation.error instanceof Error
                    ? createMutation.error.message
                    : "Could not create the maintenance request."}
                </p>
              ) : null}
            </div>
          ) : returning ? (
            <div className="space-y-3 text-sm text-[#251605]">
              <p>
                The room will be available for sale again, subject to its housekeeping and
                maintenance status.
              </p>
              {target?.status !== "available" ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-[#8A641A] underline-offset-2 hover:underline"
                  onClick={() => setReturnInstead(false)}
                >
                  Set Out of Order or Out of Service instead
                </button>
              ) : null}
              <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 rounded-lg border border-[#DDD4C5] bg-white p-3 text-xs">
                <dt className="font-medium text-[#756A5B]">Current status</dt>
                <dd className="font-semibold">{statusPhrase(room?.status)}</dd>
                <dt className="font-medium text-[#756A5B]">Reason</dt>
                <dd className="font-semibold">{room?.restrictionReason || "—"}</dd>
                <dt className="font-medium text-[#756A5B]">Expected return</dt>
                <dd className="font-semibold">{dateLabel(room?.restrictionExpectedReturn)}</dd>
              </dl>
            </div>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-[#5F554B]">Restriction type</legend>
                <div
                  className="grid gap-2 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label="Restriction type"
                >
                  {TYPE_OPTIONS.map((option) => {
                    const active = type === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        data-testid={`room-restriction-type-${option.value}`}
                        onClick={() => setType(option.value)}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
                          active
                            ? "border-[#C89933] bg-[#FBF1D9]"
                            : "border-[#DDD4C5] bg-white hover:border-[#C89933]/70",
                        )}
                      >
                        <span className="flex items-center justify-between text-sm font-semibold text-[#251605]">
                          {option.title}
                          <span className="rounded bg-[#251605]/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide">
                            {option.code}
                          </span>
                        </span>
                        <span className="mt-1 block text-[11px] leading-4 text-[#756A5B]">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
                Reason <span className="sr-only">(required)</span>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={REASON_MAX}
                  placeholder="What is wrong with the room?"
                  data-testid="room-restriction-reason"
                  className={cn(PMS_OP_INPUT, PMS_OP_PLACEHOLDER, "min-h-20 resize-none")}
                />
                <span className="text-right text-[10px] font-normal text-[#756A5B]">
                  {reason.length}/{REASON_MAX}
                </span>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
                  Start date
                  <input
                    type="date"
                    value={today}
                    readOnly
                    disabled
                    aria-describedby="room-restriction-start-hint"
                    className={cn(PMS_OP_INPUT, PMS_OP_DATE)}
                  />
                  <span
                    id="room-restriction-start-hint"
                    className="text-[10px] font-normal text-[#756A5B]"
                  >
                    Takes effect immediately.
                  </span>
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
                  End date / expected return
                  <input
                    type="date"
                    value={expectedReturn}
                    min={today}
                    onChange={(event) => setExpectedReturn(event.target.value)}
                    data-testid="room-restriction-expected-return"
                    className={cn(PMS_OP_INPUT, PMS_OP_DATE)}
                  />
                  <span className="text-[10px] font-normal text-[#756A5B]">
                    Optional unless property setup requires it.
                  </span>
                </label>
              </div>

              <div className="space-y-2" data-testid="room-restriction-maintenance">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#5F554B]">
                    Maintenance request
                    {ticketRequired ? (
                      <span className="text-destructive"> · required for Out of Order</span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#8A641A] underline-offset-2 hover:underline"
                    data-testid="room-restriction-create-request-button"
                    onClick={() => {
                      setCreatingRequest(true);
                      createMutation.reset();
                    }}
                  >
                    Create maintenance request
                  </button>
                </div>
                {type === "out_of_service" ? (
                  <p className="text-[11px] leading-4 text-[#756A5B]">
                    Out of Service does not require a maintenance request. You can still link one.
                  </p>
                ) : ticketRequired ? (
                  <p className="text-[11px] leading-4 text-[#5C5346]" role="status">
                    {OOO_MAINTENANCE_TICKET_MESSAGE}
                  </p>
                ) : policyQuery.data ? (
                  <p className="text-[11px] leading-4 text-[#756A5B]">
                    This property does not require a maintenance request for Out of Order.
                  </p>
                ) : null}
                {oooRuleUnavailable ? (
                  <p className="text-xs text-destructive" role="alert">
                    The Out of Order maintenance rule could not be loaded. Try again before
                    confirming.
                  </p>
                ) : null}
                {maintenanceQuery.isLoading || oooRulePending ? (
                  <p className="text-xs text-[#756A5B]">Loading maintenance requests…</p>
                ) : maintenanceQuery.isError ? (
                  <p className="text-xs text-destructive">
                    Open maintenance requests could not be loaded.
                  </p>
                ) : openRequests.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[#DDD4C5] bg-white px-3 py-2.5 text-xs text-[#756A5B]">
                    No open maintenance requests for this room.
                  </p>
                ) : (
                  <div
                    className="space-y-1.5"
                    role="radiogroup"
                    aria-label="Open maintenance requests"
                  >
                    {type !== "out_of_order" || !ticketRequired ? (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={maintenanceRef === ""}
                        onClick={() => setMaintenanceRef("")}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-left text-xs",
                          maintenanceRef === ""
                            ? "border-[#C89933] bg-[#FBF1D9] font-semibold text-[#251605]"
                            : "border-[#DDD4C5] bg-white text-[#5C5346]",
                        )}
                      >
                        No linked request
                      </button>
                    ) : null}
                    {openRequests.map((request) => {
                      const selected = maintenanceRef === request.id;
                      return (
                        <button
                          key={request.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          data-testid="room-restriction-request-option"
                          onClick={() => setMaintenanceRef(request.id)}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-left",
                            selected
                              ? "border-[#C89933] bg-[#FBF1D9]"
                              : "border-[#DDD4C5] bg-white hover:border-[#C89933]/70",
                          )}
                        >
                          <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[#251605]">
                            {statusPhrase(request.category)}
                            <span className="font-medium text-[#756A5B]">
                              {statusPhrase(request.status)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-[#5C5346]">
                            {request.description}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-[#756A5B]">
                            {statusPhrase(request.priority)} priority ·{" "}
                            {dateLabel(request.createdAt)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-[#DDD4C5] bg-white p-3 text-xs text-[#251605]">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  data-testid="room-restriction-confirm"
                  className="mt-0.5 size-4 accent-[#C89933]"
                />
                <span>
                  I confirm Room {room?.roomNumber} will be set{" "}
                  <strong>{type === "out_of_order" ? "Out of Order" : "Out of Service"}</strong> and
                  removed from use. This is separate from a room block, which holds inventory for a
                  dated period.
                </span>
              </label>
              {room && room.status !== "available" ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-[#8A641A] underline-offset-2 hover:underline"
                  onClick={() => setReturnInstead(true)}
                >
                  This room is already {statusPhrase(room.status)}. Return it to service instead.
                </button>
              ) : null}
            </>
          )}

          {touched && issues.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-destructive" role="alert">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
          {mutation.isError ? (
            <p className="text-xs text-destructive" role="alert">
              {staffRestrictionError(
                mutation.error instanceof Error
                  ? mutation.error.message
                  : "Could not update the room.",
              )}
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-row justify-end gap-2 border-t border-[#E8DFD0] bg-white px-5 py-3 sm:space-x-0">
          {creatingRequest ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-9 border-[#DDD4C5]"
                disabled={createMutation.isPending}
                onClick={() => setCreatingRequest(false)}
              >
                Back
              </Button>
              <Button
                type="button"
                className={SHELL_PRIMARY_BUTTON}
                disabled={createMutation.isPending || !requestDescription.trim()}
                data-testid="room-restriction-save-request"
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Saving…" : "Save request"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-9 border-[#DDD4C5]"
                disabled={mutation.isPending}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={SHELL_PRIMARY_BUTTON}
                disabled={
                  mutation.isPending ||
                  oooRulePending ||
                  oooRuleUnavailable ||
                  (ticketRequired && !linkedRequestId)
                }
                onClick={submit}
                data-testid="room-restriction-submit"
              >
                {mutation.isPending
                  ? "Saving…"
                  : returning
                    ? "Return to Service"
                    : `Confirm ${type === "out_of_order" ? "Out of Order" : "Out of Service"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
