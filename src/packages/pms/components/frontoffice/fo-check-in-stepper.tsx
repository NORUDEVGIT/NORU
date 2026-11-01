import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  assignReservationRoom,
  listAssignableRooms,
} from "@/packages/pms/lib/reservations.functions";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { assignableListUi, formatRoomTypeLabel } from "@/packages/pms/lib/fo-room-assignment";
import { AssignableRoomsHint } from "@/packages/pms/components/frontoffice/assignable-rooms-hint";
import {
  RoomUnitOccupantContext,
  RoomUnitTargetSelect,
} from "@/packages/pms/components/frontoffice/room-unit-target-select";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { useMoney } from "@/core/state/property-format";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";
import {
  POLISH1_PAYMENT_METHODS_HREF,
  cashieringTenderOptions,
  emptyPolish1Snapshot,
} from "@/packages/pms/lib/pms-polish1-payment-admin";
import {
  CHECK_IN_STEPS,
  CHECK_IN_STEP_META,
  DEPOSIT_REQUIRED_BANNER,
  ID_DOCUMENT_LABELS,
  ID_DOCUMENT_TYPES,
  KEY_ACCESS_LABELS,
  KEY_ACCESS_TYPES,
  REGISTRATION_INCOMPLETE_BANNER,
  canCompleteCheckIn,
  canContinueDeposit,
  canContinueKey,
  canContinueRegistration,
  isRoomReady,
  promptPassportExpiry,
  stepRailState,
  type CheckInStepId,
  type DepositMethodChipId,
  type IdDocumentType,
  type KeyAccessType,
} from "@/packages/pms/lib/fo-check-in";
import {
  completeFoCheckIn,
  ensureCheckInFolio,
  getCheckInContext,
  postCheckInDeposit,
  recordCheckInKey,
  saveCheckInRegistration,
  waiveCheckInDeposit,
  waiveCheckInKey,
  waiveCheckInRegistration,
} from "@/packages/pms/lib/fo-check-in.functions";
import { etaTiming, GUARANTEE_HOLD_UNSUPPORTED } from "@/packages/pms/lib/fo-arrival";
import { getFrontOfficeApprovalRequirement } from "@/packages/pms/lib/fo-approvals.functions";
import { FoAuthorizationCard } from "@/packages/pms/components/frontoffice/fo-authorization-card";
import { cn } from "@/shared/lib/utils";

/* Palette: brown text, gold accents, white surfaces (matches the rest of the PMS). */
const PRIMARY_BUTTON =
  "h-10 rounded-full bg-[#C89933] px-6 font-bold text-[#251605] hover:bg-[#B98B2D] disabled:opacity-50";
const OUTLINE_BUTTON =
  "h-10 rounded-full border-[#e9dfd0] bg-white px-5 font-semibold text-[#4a2c1a] shadow-none hover:bg-[#f5ead0]";
const GHOST_BUTTON = "h-10 rounded-full px-4 font-semibold text-[#4a2c1a] hover:bg-[#f5ead0]";

const STEP_COPY: Record<CheckInStepId, { title: string; hint: string }> = {
  stay: { title: "Room", hint: "Choose the room this guest will stay in." },
  registration: { title: "Guest registration", hint: "Confirm who is checking in." },
  deposit: { title: "Deposit", hint: "Collect a deposit or waive it." },
  key: { title: "Room key", hint: "Record how the guest will get into the room." },
  complete: { title: "Review and check in", hint: "Everything below must be green to continue." },
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function FoCheckInStepper({
  restaurantId,
  stay,
  open,
  onOpenChange,
  initialStep = "stay",
  initialReservationRoomId,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialStep?: CheckInStepId;
  initialReservationRoomId?: string;
}) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const set1 = usePmsSet1Foundation(restaurantId);
  const tenders = cashieringTenderOptions({
    available: set1.data?.polish1?.paymentMethodsAvailable ?? false,
    methods: set1.data?.polish1?.paymentMethods ?? emptyPolish1Snapshot().paymentMethods,
  });
  const [step, setStep] = useState<CheckInStepId>(initialStep);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [denyMessage, setDenyMessage] = useState<string | null>(null);

  const [roomId, setRoomId] = useState(stay.roomId ?? "");
  const [reservationRoomId, setReservationRoomId] = useState("");
  const multiRoom = (stay.roomUnits?.length ?? 0) > 1;
  const selectedUnit = stay.roomUnits?.find((unit) => unit.id === reservationRoomId) ?? null;
  const targetRoomTypeId = selectedUnit?.roomTypeId ?? stay.roomTypeId;
  const targetArrival = selectedUnit?.arrivalDate ?? stay.arrivalDate;
  const targetDeparture = selectedUnit?.departureDate ?? stay.departureDate;
  const [fullName, setFullName] = useState(stay.guestName);
  const [phone, setPhone] = useState(stay.guestPhone ?? "");
  const [email, setEmail] = useState("");
  const [idType, setIdType] = useState<IdDocumentType | "">("");
  const [idNumber, setIdNumber] = useState("");
  const [idExpiry, setIdExpiry] = useState("");
  const [nationality, setNationality] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [adults, setAdults] = useState(stay.adults);
  const [children, setChildren] = useState(stay.children);
  const [regReason, setRegReason] = useState("");

  const depositKey = useRef(crypto.randomUUID());
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState("cash");
  const [depositRef, setDepositRef] = useState("");
  const [depositReason, setDepositReason] = useState("");

  const [keyType, setKeyType] = useState<KeyAccessType | "">("");
  const [keyId, setKeyId] = useState("");
  const [keyCount, setKeyCount] = useState(1);
  const [keyReason, setKeyReason] = useState("");

  useEffect(() => {
    if (!tenders.some((row) => row.code === depositMethod))
      setDepositMethod(tenders[0]?.code ?? "");
  }, [depositMethod, tenders]);

  const fetchContext = useServerFn(getCheckInContext);
  const fetchRooms = useServerFn(listAssignableRooms);
  const assign = useServerFn(assignReservationRoom);
  const saveReg = useServerFn(saveCheckInRegistration);
  const waiveReg = useServerFn(waiveCheckInRegistration);
  const ensureFolio = useServerFn(ensureCheckInFolio);
  const postDeposit = useServerFn(postCheckInDeposit);
  const waiveDep = useServerFn(waiveCheckInDeposit);
  const saveKey = useServerFn(recordCheckInKey);
  const waiveKeyFn = useServerFn(waiveCheckInKey);
  const complete = useServerFn(completeFoCheckIn);

  const contextQuery = useQuery({
    queryKey: ["fo-check-in", restaurantId, stay.id],
    queryFn: () => fetchContext({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });
  const ctx = contextQuery.data;
  const fetchApproval = useServerFn(getFrontOfficeApprovalRequirement);
  const approvalQuery = useQuery({
    queryKey: ["front-office", "approval", restaurantId, "front_office.check_in.override"],
    queryFn: () =>
      fetchApproval({ data: { restaurantId, actionKey: "front_office.check_in.override" } }),
    enabled: open,
    retry: false,
  });
  const checkInAuth = approvalQuery.data;

  const roomsQuery = useQuery({
    queryKey: [
      "front-office",
      "assignable",
      restaurantId,
      stay.id,
      targetRoomTypeId,
      targetArrival,
      targetDeparture,
      reservationRoomId,
    ],
    queryFn: () =>
      fetchRooms({
        data: {
          restaurantId,
          roomTypeId: targetRoomTypeId,
          arrival: targetArrival,
          departure: targetDeparture,
          excludeReservationId: stay.id,
        },
      }),
    enabled: open && (!multiRoom || Boolean(reservationRoomId)),
    retry: false,
  });

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setConfirmCancel(false);
    setDirty(false);
    setDenyMessage(null);
    setReservationRoomId(multiRoom ? (initialReservationRoomId ?? "") : "");
    setRoomId(multiRoom ? "" : (stay.roomId ?? ""));
    setAdults(stay.adults);
    setChildren(stay.children);
    setRegReason("");
    setDepositAmount("");
    setDepositMethod("cash");
    setDepositRef("");
    setDepositReason("");
    setKeyReason("");
  }, [
    open,
    initialStep,
    initialReservationRoomId,
    stay.id,
    stay.roomId,
    stay.adults,
    stay.children,
    multiRoom,
  ]);

  const selectedUnitId = selectedUnit?.id ?? "";
  const selectedUnitRoomId = selectedUnit?.roomId ?? "";
  useEffect(() => {
    if (!multiRoom || !selectedUnitId) return;
    setRoomId(selectedUnitRoomId);
  }, [multiRoom, selectedUnitId, selectedUnitRoomId]);

  useEffect(() => {
    if (!ctx) return;
    setFullName(ctx.guest.fullName || stay.guestName);
    setPhone(ctx.guest.phone ?? "");
    setEmail(ctx.guest.email ?? "");
    setIdType(ctx.guest.idDocumentType ?? "");
    setIdNumber(ctx.guest.idDocumentNumber ?? "");
    setIdExpiry(ctx.guest.idDocumentExpiry ?? "");
    setNationality(ctx.guest.nationality ?? "");
    setAddressLine1(ctx.guest.addressLine1 ?? "");
    setCity(ctx.guest.city ?? "");
    setCountry(ctx.guest.country ?? "");
    setAdults(ctx.stay.adults);
    setChildren(ctx.stay.children);
    if (!multiRoom && ctx.stay.roomId) setRoomId(ctx.stay.roomId);
    if (ctx.progress.keyAccessType) setKeyType(ctx.progress.keyAccessType as KeyAccessType);
    if (ctx.progress.keyIdentifier) setKeyId(ctx.progress.keyIdentifier);
    if (ctx.progress.keyCount) setKeyCount(ctx.progress.keyCount);
  }, [ctx, stay.guestName, multiRoom]);

  useEffect(() => {
    if (!open || step !== "deposit") return;
    void ensureFolio({ data: { restaurantId, reservationId: stay.id } })
      .then(() => contextQuery.refetch())
      .catch((error: unknown) => {
        if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
        else toast.error(errorText(error));
      });
    // Folio open is a Step C entry side-effect; refetch is owned by the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, restaurantId, stay.id]);

  const assignedRoom = useMemo(() => {
    if (ctx?.room && ctx.room.id === roomId) return ctx.room;
    const listed = (roomsQuery.data ?? []).find((r) => r.id === roomId);
    if (!listed) return ctx?.room ?? null;
    return {
      id: listed.id,
      roomNumber: listed.roomNumber,
      status: "available",
      housekeepingStatus: listed.housekeepingStatus,
      maintenanceStatus: null,
    };
  }, [ctx?.room, roomId, roomsQuery.data]);

  const roomGate = isRoomReady(
    assignedRoom
      ? {
          status: assignedRoom.status,
          housekeepingStatus: assignedRoom.housekeepingStatus,
          maintenanceStatus: assignedRoom.maintenanceStatus ?? null,
        }
      : roomId
        ? { status: "available", housekeepingStatus: null }
        : null,
    ctx?.housekeepingPolicy,
  );
  const registrationDraft = {
    fullName,
    phone: phone || null,
    email: email || null,
    idDocumentType: idType || null,
    idDocumentNumber: idNumber || null,
    idDocumentExpiry: idExpiry || null,
  };
  const registrationOk = canContinueRegistration(
    registrationDraft,
    ctx?.progress.registrationWaived ?? false,
  );
  const depositOk = canContinueDeposit({
    postedAmount: ctx?.folio.postedAmount ?? 0,
    waived: ctx?.progress.depositWaived ?? false,
  });
  const keyOk = canContinueKey({
    accessType: ctx?.progress.keyAccessType ?? (keyType || null),
    identifier: ctx?.progress.keyIdentifier ?? (keyId || null),
    waived: ctx?.progress.keyWaived ?? false,
  });
  const completeOk = canCompleteCheckIn({
    roomReady: roomGate.ready,
    registrationOk,
    depositOk,
    keyOk,
  });

  const currentIndex = CHECK_IN_STEPS.indexOf(step);
  const currentBlocked =
    (step === "stay" && !roomGate.ready) ||
    (step === "registration" && !registrationOk) ||
    (step === "deposit" && !depositOk) ||
    (step === "key" && !keyOk) ||
    (step === "complete" && !completeOk);

  function markDirty() {
    setDirty(true);
  }

  function requestClose() {
    if (dirty) setConfirmCancel(true);
    else onOpenChange(false);
  }

  function refreshDesk() {
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["reservation"] });
    void queryClient.invalidateQueries({ queryKey: ["fo-check-in"] });
    void queryClient.invalidateQueries({ queryKey: ["fo-arrival-qv"] });
    void queryClient.invalidateQueries({ queryKey: ["front-office", "arrivals-desk"] });
    void queryClient.invalidateQueries({ queryKey: ["rooms-dashboard"] });
  }

  const assignMut = useMutation({
    mutationFn: async () => {
      if (!roomId) throw new Error("Assign a room before continuing.");
      const currentRoomId = multiRoom
        ? (selectedUnit?.roomId ?? null)
        : (ctx?.stay.roomId ?? stay.roomId);
      if (roomId !== currentRoomId) {
        await assign({
          data: {
            restaurantId,
            reservationId: stay.id,
            roomId,
            ...(multiRoom ? { reservationRoomId } : {}),
          },
        });
      }
    },
    onSuccess: async () => {
      setDirty(false);
      await contextQuery.refetch();
      setStep("registration");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const saveRegMut = useMutation({
    mutationFn: () =>
      saveReg({
        data: {
          restaurantId,
          reservationId: stay.id,
          fullName,
          phone,
          email,
          idDocumentType: idType || null,
          idDocumentNumber: idNumber,
          idDocumentExpiry: idExpiry,
          nationality,
          addressLine1,
          city,
          country,
          adults,
          children,
        },
      }),
    onSuccess: async () => {
      setDirty(false);
      await contextQuery.refetch();
      setStep("deposit");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const waiveRegMut = useMutation({
    mutationFn: () =>
      waiveReg({ data: { restaurantId, reservationId: stay.id, reason: regReason.trim() } }),
    onSuccess: async () => {
      setRegReason("");
      setDenyMessage(null);
      await contextQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const postDepMut = useMutation({
    mutationFn: () =>
      postDeposit({
        data: {
          restaurantId,
          reservationId: stay.id,
          amount: Number(depositAmount),
          method: depositMethod,
          reference: depositRef,
          idempotencyKey: depositKey.current,
        },
      }),
    onSuccess: async () => {
      depositKey.current = crypto.randomUUID();
      setDirty(false);
      setDepositAmount("");
      setDepositRef("");
      await contextQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const waiveDepMut = useMutation({
    mutationFn: () =>
      waiveDep({ data: { restaurantId, reservationId: stay.id, reason: depositReason.trim() } }),
    onSuccess: async () => {
      setDepositReason("");
      setDenyMessage(null);
      await contextQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const saveKeyMut = useMutation({
    mutationFn: () =>
      saveKey({
        data: {
          restaurantId,
          reservationId: stay.id,
          accessType: keyType as KeyAccessType,
          identifier: keyId,
          keyCount,
        },
      }),
    onSuccess: async () => {
      setDirty(false);
      await contextQuery.refetch();
      setStep("complete");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const waiveKeyMut = useMutation({
    mutationFn: () =>
      waiveKeyFn({ data: { restaurantId, reservationId: stay.id, reason: keyReason.trim() } }),
    onSuccess: async () => {
      setKeyReason("");
      setDenyMessage(null);
      await contextQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const completeMut = useMutation({
    mutationFn: () =>
      complete({
        data: {
          restaurantId,
          reservationId: stay.id,
          ...(multiRoom ? { reservationRoomId, roomId } : {}),
        },
      }),
    onSuccess: (result) => {
      toast.success(
        `Checked in · ${result.roomNumber ? `Room ${result.roomNumber}` : stay.roomTypeName}`,
      );
      refreshDesk();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  function goBack() {
    const idx = CHECK_IN_STEPS.indexOf(step);
    if (idx > 0) setStep(CHECK_IN_STEPS[idx - 1] ?? "stay");
  }

  function onContinue() {
    if (step === "stay") {
      assignMut.mutate();
      return;
    }
    if (step === "registration") {
      saveRegMut.mutate();
      return;
    }
    if (step === "deposit") {
      if (depositOk) setStep("key");
      return;
    }
    if (step === "key") {
      if (ctx?.progress.keyWaived) {
        setStep("complete");
        return;
      }
      saveKeyMut.mutate();
    }
  }

  const continueDisabled =
    (step === "stay" &&
      (!roomGate.ready || assignMut.isPending || (multiRoom && !reservationRoomId))) ||
    (step === "registration" && (!registrationOk || saveRegMut.isPending)) ||
    (step === "deposit" && !depositOk) ||
    (step === "key" && ((!keyOk && !ctx?.progress.keyWaived) || saveKeyMut.isPending)) ||
    (step === "complete" && (!completeOk || completeMut.isPending));

  const guestLabel = ctx?.stay.guestName ?? stay.guestName;
  const confirmation = ctx?.stay.confirmationNumber ?? stay.confirmationNumber;
  const dates = `${formatStayDate(stay.arrivalDate)} → ${formatStayDate(stay.departureDate)}`;
  const rooms = roomsQuery.data ?? [];
  const roomsState = assignableListUi({
    isPending: roomsQuery.isPending,
    isError: roomsQuery.isError,
    rooms: roomsQuery.data,
  });
  const roomTypeLabel = formatRoomTypeLabel(stay.roomTypeName, stay.roomTypeCode);
  const copy = STEP_COPY[step];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogContent
          data-testid="fo-check-in-stepper"
          className="z-[70] flex h-[90vh] max-h-[860px] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border-[#e9dfd0] bg-[#fbfbfb] p-0 sm:max-w-5xl"
        >
          {/* Header: who is checking in, and where they are in the flow. */}
          <DialogHeader className="shrink-0 space-y-4 border-b border-[#e9dfd0] bg-white px-6 py-5 pr-14 text-left">
            <div>
              <DialogTitle className="font-display text-xl font-semibold text-[#4a2c1a]">
                Check in {guestLabel}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-[#7A6B58]">
                {confirmation} · {dates} · {roomTypeLabel}
              </DialogDescription>
            </div>

            <nav aria-label="Check-in steps">
              <ol className="flex items-center">
                {CHECK_IN_STEP_META.map((meta, index) => {
                  const state = stepRailState(index, currentIndex, currentBlocked);
                  const isLast = index === CHECK_IN_STEP_META.length - 1;
                  return (
                    <li key={meta.id} className={cn("flex items-center", !isLast && "flex-1")}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                            state === "done" && "bg-[#4a2c1a] text-white",
                            state === "current" && "bg-[#C89933] text-[#251605]",
                            state === "blocked" &&
                              "bg-destructive/10 text-destructive ring-1 ring-destructive/40",
                            state === "locked" && "bg-[#f1ede6] text-[#7A6B58]",
                          )}
                        >
                          {state === "done" ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            state === "current"
                              ? "font-bold text-[#4a2c1a]"
                              : "hidden font-medium text-[#7A6B58] md:inline",
                          )}
                        >
                          {meta.label}
                        </span>
                      </span>
                      {!isLast ? (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mx-3 h-px flex-1",
                            state === "done" ? "bg-[#4a2c1a]" : "bg-[#e9dfd0]",
                          )}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </nav>
          </DialogHeader>

          {/* Body: one card per step. */}
          <div className="flex min-h-0 flex-1">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {contextQuery.isLoading ? (
              <p className="text-sm text-[#7A6B58]">Loading check-in…</p>
            ) : contextQuery.isError && isPermissionDeniedMessage(contextQuery.error) ? (
              <PermissionDeniedPanel message={errorText(contextQuery.error)} />
            ) : (
              <div className="space-y-4">
                {denyMessage ? <PermissionDeniedPanel message={denyMessage} /> : null}

                <StepCard title={copy.title} hint={copy.hint}>
                  {step === "stay" ? (
                    <div className="space-y-4">
                      <RoomUnitTargetSelect
                        units={stay.roomUnits}
                        value={reservationRoomId}
                        onChange={(id) => {
                          setReservationRoomId(id);
                          markDirty();
                        }}
                      />
                      <RoomUnitOccupantContext
                        stayGuestId={stay.guestId}
                        units={stay.roomUnits}
                        selectedId={reservationRoomId}
                      />
                      {multiRoom ? (
                        <p className="text-xs text-[#7A6B58]">
                          Registration stays on the Primary Guest / Booker.
                        </p>
                      ) : null}

                      <Field label="Room">
                        <Select
                          value={roomId}
                          onValueChange={(v) => {
                            setRoomId(v);
                            markDirty();
                          }}
                          disabled={
                            roomsState.status === "loading" ||
                            roomsState.status === "error" ||
                            (multiRoom && !reservationRoomId)
                          }
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue
                              placeholder={
                                roomsState.status === "loading" ? "Loading rooms…" : "Select a room"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {rooms.map((room) => (
                              <SelectItem key={room.id} value={room.id}>
                                Room {room.roomNumber}
                                {room.housekeepingStatus ? ` · ${room.housekeepingStatus}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <AssignableRoomsHint
                          status={roomsState.status}
                          roomTypeLabel={roomTypeLabel}
                          onRetry={() => void roomsQuery.refetch()}
                          detail={
                            roomsQuery.error instanceof Error ? roomsQuery.error.message : null
                          }
                        />
                      </Field>

                      {roomGate.reason ? <Notice tone="error">{roomGate.reason}</Notice> : null}

                      {ctx?.stay.expectedArrivalAt && ctx.checkInTime
                        ? (() => {
                            const timing = etaTiming({
                              expectedArrivalAt: ctx.stay.expectedArrivalAt,
                              checkInTime: ctx.checkInTime,
                              timezone: ctx.timezone,
                            });
                            if (timing !== "early") return null;
                            return (
                              <Notice tone="warn">
                                Expected arrival is before property check-in time
                                {ctx.earlyCheckinAllowed === false
                                  ? ". Early check-in is not allowed in Settings."
                                  : ctx.earlyCheckinNeedsApproval
                                    ? ". Settings require approval — there is no approval inbox yet."
                                    : "."}
                              </Notice>
                            );
                          })()
                        : null}

                      {ctx?.rateMissing ? (
                        <Notice tone="warn">
                          This stay has no rate on file. You can still continue.
                        </Notice>
                      ) : null}

                      <p className="text-xs text-[#7A6B58]">
                        {roomTypeLabel} · {stay.adults} adult{stay.adults === 1 ? "" : "s"}
                        {stay.children ? ` · ${stay.children} child` : ""}
                      </p>
                    </div>
                  ) : null}

                  {step === "registration" ? (
                    <div className="space-y-4">
                      {!registrationOk ? (
                        <Notice tone="error">{REGISTRATION_INCOMPLETE_BANNER}</Notice>
                      ) : null}
                      {ctx?.progress.registrationWaived ? (
                        <Notice tone="success">Registration waived</Notice>
                      ) : null}

                      <Field label="Full name" required>
                        <Input
                          className="h-10"
                          value={fullName}
                          onChange={(e) => {
                            setFullName(e.target.value);
                            markDirty();
                          }}
                        />
                      </Field>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Phone">
                          <Input
                            className="h-10"
                            value={phone}
                            onChange={(e) => {
                              setPhone(e.target.value);
                              markDirty();
                            }}
                          />
                        </Field>
                        <Field label="Email">
                          <Input
                            className="h-10"
                            type="email"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              markDirty();
                            }}
                          />
                        </Field>
                      </div>
                      <p className="-mt-2 text-xs text-[#7A6B58]">
                        Add a phone or email, plus an ID type and number.
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="ID type" required>
                          <Select
                            value={idType}
                            onValueChange={(v) => {
                              setIdType(v as IdDocumentType);
                              markDirty();
                            }}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Select ID type" />
                            </SelectTrigger>
                            <SelectContent>
                              {ID_DOCUMENT_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {ID_DOCUMENT_LABELS[t]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="ID number" required>
                          <Input
                            className="h-10"
                            value={idNumber}
                            onChange={(e) => {
                              setIdNumber(e.target.value);
                              markDirty();
                            }}
                          />
                        </Field>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="ID expiry">
                          <Input
                            className="h-10"
                            type="date"
                            value={idExpiry}
                            onChange={(e) => {
                              setIdExpiry(e.target.value);
                              markDirty();
                            }}
                          />
                        </Field>
                        <Field label="Nationality">
                          <Input
                            className="h-10"
                            value={nationality}
                            onChange={(e) => {
                              setNationality(e.target.value);
                              markDirty();
                            }}
                          />
                        </Field>
                      </div>
                      {promptPassportExpiry(idType || null, idExpiry) ? (
                        <p className="-mt-2 text-xs text-[#8C6D23]">
                          Passport expiry is recommended.
                        </p>
                      ) : null}

                      <Field label="Address">
                        <Input
                          className="h-10"
                          value={addressLine1}
                          onChange={(e) => {
                            setAddressLine1(e.target.value);
                            markDirty();
                          }}
                        />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="City">
                          <Input
                            className="h-10"
                            value={city}
                            onChange={(e) => {
                              setCity(e.target.value);
                              markDirty();
                            }}
                          />
                        </Field>
                        <Field label="Country">
                          <Input
                            className="h-10"
                            value={country}
                            onChange={(e) => {
                              setCountry(e.target.value);
                              markDirty();
                            }}
                          />
                        </Field>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Adults">
                          <Input
                            className="h-10"
                            type="number"
                            min={1}
                            max={20}
                            value={adults}
                            onChange={(e) => {
                              setAdults(Math.max(1, Number(e.target.value) || 1));
                              markDirty();
                            }}
                          />
                        </Field>
                        <Field label="Children">
                          <Input
                            className="h-10"
                            type="number"
                            min={0}
                            max={20}
                            value={children}
                            onChange={(e) => {
                              setChildren(Math.max(0, Number(e.target.value) || 0));
                              markDirty();
                            }}
                          />
                        </Field>
                      </div>

                      {stay.specialRequests ? (
                        <p className="rounded-xl bg-[#faf7f1] px-3 py-2 text-sm text-[#4a2c1a]">
                          <span className="font-semibold">Special requests:</span>{" "}
                          {stay.specialRequests}
                        </p>
                      ) : null}

                      {ctx?.progress.registrationWaived ? null : (
                        <SkipStep label="Skip registration">
                          <FoAuthorizationCard
                            requirement={checkInAuth}
                            guestLine={`${stay.guestName} · ${stay.confirmationNumber}`}
                            reason={regReason}
                            onReasonChange={setRegReason}
                            pending={waiveRegMut.isPending}
                            confirmLabel="Waive registration"
                            onAuthorize={() => waiveRegMut.mutate()}
                            reasonId="reg-waiver"
                          />
                        </SkipStep>
                      )}
                    </div>
                  ) : null}

                  {step === "deposit" ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <FolioChip label="Folio open" on={ctx?.folio.open ?? false} />
                        <FolioChip label="Deposit required" on />
                        <FolioChip
                          label="Deposit posted"
                          on={(ctx?.folio.postedAmount ?? 0) > 0}
                        />
                        <FolioChip
                          label="Balance due"
                          on={(ctx?.folio.outstanding ?? 0) > 0 && !depositOk}
                        />
                      </div>
                      <p className="text-xs text-[#7A6B58]">{GUARANTEE_HOLD_UNSUPPORTED}</p>

                      {depositOk ? (
                        <Notice tone="success">
                          {ctx?.progress.depositWaived
                            ? "Deposit waived"
                            : `Deposit received${ctx?.folio.postedAmount ? ` · ${money(ctx.folio.postedAmount)}` : ""}`}
                        </Notice>
                      ) : (
                        <>
                          <Notice tone="error">{DEPOSIT_REQUIRED_BANNER}</Notice>
                          <Field label="Amount">
                            <Input
                              className="h-10"
                              type="number"
                              min={0.01}
                              step="0.01"
                              value={depositAmount}
                              onChange={(e) => {
                                setDepositAmount(e.target.value);
                                markDirty();
                              }}
                            />
                          </Field>

                          {tenders.length === 0 ? (
                            <Notice tone="warn">
                              No active payment methods. Set them up in{" "}
                              <a href={POLISH1_PAYMENT_METHODS_HREF} className="underline">
                                Payment methods
                              </a>
                              .
                            </Notice>
                          ) : (
                            <Field label="Payment method">
                              <div className="flex flex-wrap gap-2">
                                {tenders.map((tender) => (
                                  <button
                                    key={tender.code}
                                    type="button"
                                    className={cn(
                                      "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                                      depositMethod === tender.code
                                        ? "border-[#C89933] bg-[#f5ead0] text-[#4a2c1a]"
                                        : "border-[#e9dfd0] bg-white text-[#7A6B58] hover:bg-[#faf7f1]",
                                    )}
                                    onClick={() => setDepositMethod(tender.code)}
                                  >
                                    {tender.name}
                                  </button>
                                ))}
                              </div>
                            </Field>
                          )}

                          <Field label="Reference">
                            <Input
                              className="h-10"
                              value={depositRef}
                              onChange={(e) => setDepositRef(e.target.value)}
                            />
                          </Field>
                          <Button
                            type="button"
                            className={PRIMARY_BUTTON}
                            disabled={
                              !Number(depositAmount) || !depositMethod || postDepMut.isPending
                            }
                            onClick={() => postDepMut.mutate()}
                          >
                            {postDepMut.isPending ? "Posting…" : "Post deposit"}
                          </Button>
                        </>
                      )}

                      {ctx?.progress.depositWaived ? null : (
                        <SkipStep label="Waive deposit">
                          <FoAuthorizationCard
                            requirement={checkInAuth}
                            guestLine={`${stay.guestName} · ${stay.confirmationNumber}`}
                            reason={depositReason}
                            onReasonChange={setDepositReason}
                            pending={waiveDepMut.isPending}
                            confirmLabel="Waive deposit"
                            onAuthorize={() => waiveDepMut.mutate()}
                            reasonId="dep-waiver"
                          />
                        </SkipStep>
                      )}
                    </div>
                  ) : null}

                  {step === "key" ? (
                    <div className="space-y-4">
                      {ctx?.progress.keyWaived ? <Notice tone="success">Keys later</Notice> : null}

                      <Field label="Access type">
                        <Select
                          value={keyType}
                          onValueChange={(v) => {
                            setKeyType(v as KeyAccessType);
                            markDirty();
                          }}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select access type" />
                          </SelectTrigger>
                          <SelectContent>
                            {KEY_ACCESS_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {KEY_ACCESS_LABELS[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Identifier">
                          <Input
                            className="h-10"
                            value={keyId}
                            onChange={(e) => {
                              setKeyId(e.target.value);
                              markDirty();
                            }}
                          />
                        </Field>
                        <Field label="Number of keys">
                          <Input
                            className="h-10"
                            type="number"
                            min={1}
                            max={20}
                            value={keyCount}
                            onChange={(e) => setKeyCount(Math.max(1, Number(e.target.value) || 1))}
                          />
                        </Field>
                      </div>

                      <p className="text-xs text-[#7A6B58]">
                        Issued{" "}
                        {ctx?.progress.keyIssuedAt
                          ? formatStayDate(ctx.progress.keyIssuedAt.slice(0, 10))
                          : "now"}
                        {ctx?.actorName ? ` by ${ctx.actorName}` : ""}
                      </p>

                      {ctx?.progress.keyWaived ? null : (
                        <SkipStep label="Hand over keys later">
                          <FoAuthorizationCard
                            requirement={checkInAuth}
                            guestLine={`${stay.guestName} · ${stay.confirmationNumber}`}
                            reason={keyReason}
                            onReasonChange={setKeyReason}
                            pending={waiveKeyMut.isPending}
                            confirmLabel="Keys later"
                            onAuthorize={() => waiveKeyMut.mutate()}
                            reasonId="key-waiver"
                          />
                        </SkipStep>
                      )}
                    </div>
                  ) : null}

                  {step === "complete" ? (
                    <div className="space-y-2">
                      <SummaryRow label="Guest" value={guestLabel} ok={registrationOk} />
                      <SummaryRow
                        label="Reservation"
                        value={`${confirmation} · ${stay.status.replace("_", " ")}`}
                        ok={stay.status === "confirmed"}
                      />
                      <SummaryRow label="Dates" value={dates} ok />
                      <SummaryRow
                        label="Room"
                        value={
                          assignedRoom
                            ? `Room ${assignedRoom.roomNumber}${roomGate.ready ? " · ready" : ""}`
                            : stay.roomNumber
                              ? `Room ${stay.roomNumber}`
                              : "Unassigned"
                        }
                        ok={roomGate.ready}
                      />
                      <SummaryRow
                        label="Registration"
                        value={ctx?.progress.registrationWaived ? "Waived" : "Complete"}
                        ok={registrationOk}
                      />
                      <SummaryRow
                        label="Deposit"
                        value={
                          ctx?.progress.depositWaived
                            ? "Waived"
                            : ctx?.folio.postedAmount
                              ? `${money(ctx.folio.postedAmount)}${ctx.folio.postedMethod ? ` · ${ctx.folio.postedMethod}` : ""}`
                              : "Required"
                        }
                        ok={depositOk}
                      />
                      <SummaryRow
                        label="Key"
                        value={ctx?.progress.keyWaived ? "Later" : "Recorded"}
                        ok={keyOk}
                      />
                      {!completeOk ? (
                        <Notice tone="error">
                          Check-in stays disabled until every item above is green.
                        </Notice>
                      ) : null}
                    </div>
                  ) : null}
                </StepCard>
              </div>
            )}
          </div>

          <SummaryAside
            guest={guestLabel}
            confirmation={confirmation}
            dates={dates}
            nights={stay.nights}
            roomType={roomTypeLabel}
            room={
              assignedRoom
                ? `Room ${assignedRoom.roomNumber}`
                : stay.roomNumber
                  ? `Room ${stay.roomNumber}`
                  : "Unassigned"
            }
            guests={`${adults} adult${adults === 1 ? "" : "s"}${children ? ` · ${children} child${children === 1 ? "" : "ren"}` : ""}`}
            deposit={
              ctx?.progress.depositWaived
                ? "Waived"
                : ctx?.folio.postedAmount
                  ? money(ctx.folio.postedAmount)
                  : "Not paid yet"
            }
          />
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-[#e9dfd0] bg-white px-6 py-3">
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" className={GHOST_BUTTON} onClick={requestClose}>
                Cancel
              </Button>
              <span className="hidden text-xs text-[#7A6B58] sm:inline">
                Step {currentIndex + 1} of {CHECK_IN_STEPS.length}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={OUTLINE_BUTTON}
                  disabled={step === "stay"}
                  onClick={goBack}
                >
                  Back
                </Button>
                {step === "complete" ? (
                  <Button
                    type="button"
                    className={PRIMARY_BUTTON}
                    disabled={continueDisabled}
                    onClick={() => completeMut.mutate()}
                  >
                    {completeMut.isPending ? "Checking in…" : "Check in"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className={PRIMARY_BUTTON}
                    disabled={continueDisabled}
                    onClick={onContinue}
                  >
                    Continue
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave check-in?</AlertDialogTitle>
            <AlertDialogDescription>
              Unsaved changes on this step will be lost. The stay stays confirmed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCancel(false);
                onOpenChange(false);
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ----------------------------------------------------------------- pieces */

/** Read-only summary shown beside the steps, like the Create Reservation page. */
function SummaryAside({
  guest,
  confirmation,
  dates,
  nights,
  roomType,
  room,
  guests,
  deposit,
}: {
  guest: string;
  confirmation: string;
  dates: string;
  nights: number;
  roomType: string;
  room: string;
  guests: string;
  deposit: string;
}) {
  return (
    <aside className="hidden w-[260px] shrink-0 overflow-y-auto border-l border-[#e9dfd0] bg-white p-5 md:block">
      <h2 className="font-display text-base font-semibold text-[#4a2c1a]">Summary</h2>
      <p className="mb-4 text-xs text-[#7A6B58]">Updates as you move through the steps.</p>
      <dl className="space-y-4 text-sm text-[#4a2c1a]">
        <div>
          <dt className="text-xs font-bold text-[#8C6D23]">Guest</dt>
          <dd className="font-semibold">{guest}</dd>
          <dd className="text-xs text-[#7A6B58]">{confirmation}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#8C6D23]">Stay</dt>
          <dd>{dates}</dd>
          <dd className="text-xs text-[#7A6B58]">
            {nights} night{nights === 1 ? "" : "s"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#8C6D23]">Room</dt>
          <dd className="font-semibold">{room}</dd>
          <dd className="text-xs text-[#7A6B58]">{roomType}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#8C6D23]">Guests</dt>
          <dd>{guests}</dd>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-[#f5ead0] px-3 py-2.5">
          <dt className="text-sm font-semibold">Deposit</dt>
          <dd className="font-bold">{deposit}</dd>
        </div>
      </dl>
    </aside>
  );
}

function StepCard({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e9dfd0] bg-white p-5 shadow-sm">
      <header className="mb-4">
        <h2 className="font-display text-base font-semibold text-[#4a2c1a]">{title}</h2>
        <p className="text-xs text-[#7A6B58]">{hint}</p>
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px] font-medium text-[#4a2c1a]">
        {label}
        {required ? <span className="text-[#C89933]"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "warn" | "error" | "success";
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm",
        tone === "warn" && "border border-[#c9a24a] bg-[#f5ead0] text-[#4a2c1a]",
        tone === "error" && "border border-destructive/30 bg-destructive/5 text-destructive",
        tone === "success" && "bg-[#436436]/10 font-medium text-[#436436]",
      )}
    >
      {tone === "success" ? (
        <Check className="mt-0.5 size-4 shrink-0" />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{children}</span>
    </p>
  );
}

/** Keeps the waiver flow out of the way until someone needs it. */
function SkipStep({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-dashed border-[#e9dfd0] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-[#7A6B58] hover:text-[#4a2c1a]">
        {label}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function FolioChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 font-medium",
        on ? "bg-[#f5ead0] text-[#4a2c1a]" : "bg-[#f1ede6] text-[#7A6B58]",
      )}
    >
      {label}
    </span>
  );
}

function SummaryRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#efe7d8] px-3 py-2.5 text-sm">
      <span className="flex items-center gap-2 text-[#7A6B58]">
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full",
            ok ? "bg-[#436436]/15 text-[#436436]" : "bg-destructive/10 text-destructive",
          )}
        >
          {ok ? <Check className="size-3" /> : <TriangleAlert className="size-3" />}
        </span>
        {label}
      </span>
      <span className={cn("text-right font-medium", ok ? "text-[#4a2c1a]" : "text-destructive")}>
        {value}
      </span>
    </div>
  );
}