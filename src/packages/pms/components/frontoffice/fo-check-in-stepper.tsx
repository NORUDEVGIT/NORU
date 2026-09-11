import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
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
import { assignReservationRoom, listAssignableRooms } from "@/packages/pms/lib/reservations.functions";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import {
  CHECK_IN_STEPS,
  CHECK_IN_STEP_META,
  DEPOSIT_METHOD_CHIPS,
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
import { cn } from "@/shared/lib/utils";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function FoCheckInStepper({
  restaurantId,
  stay,
  open,
  onOpenChange,
  initialStep = "stay",
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialStep?: CheckInStepId;
}) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const [step, setStep] = useState<CheckInStepId>(initialStep);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [denyMessage, setDenyMessage] = useState<string | null>(null);

  const [roomId, setRoomId] = useState(stay.roomId ?? "");
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

  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<DepositMethodChipId>("cash");
  const [depositRef, setDepositRef] = useState("");
  const [depositReason, setDepositReason] = useState("");

  const [keyType, setKeyType] = useState<KeyAccessType | "">("");
  const [keyId, setKeyId] = useState("");
  const [keyCount, setKeyCount] = useState(1);
  const [keyReason, setKeyReason] = useState("");

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

  const roomsQuery = useQuery({
    queryKey: ["front-office", "assignable", restaurantId, stay.id, stay.roomTypeId, stay.arrivalDate, stay.departureDate],
    queryFn: () =>
      fetchRooms({
        data: {
          restaurantId,
          roomTypeId: stay.roomTypeId,
          arrival: stay.arrivalDate,
          departure: stay.departureDate,
          excludeReservationId: stay.id,
        },
      }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setConfirmCancel(false);
    setDirty(false);
    setDenyMessage(null);
    setRoomId(stay.roomId ?? "");
    setAdults(stay.adults);
    setChildren(stay.children);
    setRegReason("");
    setDepositAmount("");
    setDepositMethod("cash");
    setDepositRef("");
    setDepositReason("");
    setKeyReason("");
  }, [open, initialStep, stay.id, stay.roomId, stay.adults, stay.children]);

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
    if (ctx.stay.roomId) setRoomId(ctx.stay.roomId);
    if (ctx.progress.keyAccessType) setKeyType(ctx.progress.keyAccessType as KeyAccessType);
    if (ctx.progress.keyIdentifier) setKeyId(ctx.progress.keyIdentifier);
    if (ctx.progress.keyCount) setKeyCount(ctx.progress.keyCount);
  }, [ctx, stay.guestName]);

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
    };
  }, [ctx?.room, roomId, roomsQuery.data]);

  const roomGate = isRoomReady(
    assignedRoom
      ? { status: assignedRoom.status, housekeepingStatus: assignedRoom.housekeepingStatus }
      : roomId
        ? { status: "available", housekeepingStatus: null }
        : null,
  );
  const registrationDraft = {
    fullName,
    phone: phone || null,
    email: email || null,
    idDocumentType: idType || null,
    idDocumentNumber: idNumber || null,
    idDocumentExpiry: idExpiry || null,
  };
  const registrationOk = canContinueRegistration(registrationDraft, ctx?.progress.registrationWaived ?? false);
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
    void queryClient.invalidateQueries({ queryKey: ["rooms-dashboard"] });
  }

  const assignMut = useMutation({
    mutationFn: async () => {
      if (!roomId) throw new Error("Assign a room before continuing.");
      if (roomId !== (ctx?.stay.roomId ?? stay.roomId)) {
        await assign({ data: { restaurantId, reservationId: stay.id, roomId } });
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
        },
      }),
    onSuccess: async () => {
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
    mutationFn: () => complete({ data: { restaurantId, reservationId: stay.id } }),
    onSuccess: (result) => {
      toast.success(`Checked in · ${result.roomNumber ? `Room ${result.roomNumber}` : stay.roomTypeName}`);
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
    (step === "stay" && (!roomGate.ready || assignMut.isPending)) ||
    (step === "registration" && (!registrationOk || saveRegMut.isPending)) ||
    (step === "deposit" && !depositOk) ||
    (step === "key" && ((!keyOk && !ctx?.progress.keyWaived) || saveKeyMut.isPending)) ||
    (step === "complete" && (!completeOk || completeMut.isPending));

  const guestLabel = ctx?.stay.guestName ?? stay.guestName;
  const confirmation = ctx?.stay.confirmationNumber ?? stay.confirmationNumber;
  const dates = `${formatStayDate(stay.arrivalDate)} → ${formatStayDate(stay.departureDate)}`;
  const rooms = roomsQuery.data ?? [];

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <SheetContent
          side="right"
          data-testid="fo-check-in-stepper"
          className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
        >
          <SheetHeader className="shrink-0 border-b border-[#CCCCCC] px-5 py-4 text-left">
            <SheetTitle className="text-[#251605]">Check in</SheetTitle>
            <SheetDescription>
              {guestLabel} · {confirmation} · {dates}
            </SheetDescription>
          </SheetHeader>

          <nav className="sticky top-0 z-10 shrink-0 border-b border-[#CCCCCC] bg-background px-4 py-3">
            <ol className="flex flex-wrap gap-2">
              {CHECK_IN_STEP_META.map((meta, index) => {
                const state = stepRailState(index, currentIndex, currentBlocked);
                return (
                  <li key={meta.id}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                        state === "done" && "bg-[#436436]/15 text-[#436436]",
                        state === "current" && "bg-[#C89933]/20 text-[#251605] ring-1 ring-[#C89933]",
                        state === "blocked" && "bg-destructive/10 text-destructive",
                        state === "locked" && "bg-[#CCCCCC]/40 text-muted-foreground",
                      )}
                    >
                      <span className="font-semibold">{meta.letter}</span>
                      {meta.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {contextQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading check-in…</p>
            ) : contextQuery.isError && isPermissionDeniedMessage(contextQuery.error) ? (
              <PermissionDeniedPanel message={errorText(contextQuery.error)} />
            ) : (
              <>
                {denyMessage ? <PermissionDeniedPanel className="mb-4" message={denyMessage} /> : null}

                {step === "stay" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Room</Label>
                      <Select
                        value={roomId}
                        onValueChange={(v) => {
                          setRoomId(v);
                          markDirty();
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={roomsQuery.isLoading ? "Loading rooms…" : "Select a room"} />
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
                    </div>
                    {roomGate.reason ? <p className="text-sm text-destructive">{roomGate.reason}</p> : null}
                    {ctx?.rateMissing ? (
                      <p className="rounded-xl border border-[#C89933]/40 bg-[#C89933]/10 px-3 py-2 text-sm text-[#251605]">
                        This stay has no rate on file. You can still continue.
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {stay.roomTypeName} · {stay.adults} adult{stay.adults === 1 ? "" : "s"}
                      {stay.children ? ` · ${stay.children} child` : ""}
                    </p>
                  </div>
                ) : null}

                {step === "registration" ? (
                  <div className="space-y-4">
                    {!registrationOk ? (
                      <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                        {REGISTRATION_INCOMPLETE_BANNER}
                      </p>
                    ) : null}
                    {ctx?.progress.registrationWaived ? (
                      <p className="inline-flex rounded-full bg-[#C89933]/20 px-2.5 py-1 text-xs font-medium text-[#251605]">
                        Registration waived
                      </p>
                    ) : null}
                    <Field label="Full name">
                      <Input value={fullName} onChange={(e) => { setFullName(e.target.value); markDirty(); }} />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Phone">
                        <Input value={phone} onChange={(e) => { setPhone(e.target.value); markDirty(); }} />
                      </Field>
                      <Field label="Email">
                        <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); markDirty(); }} />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>ID type</Label>
                        <Select
                          value={idType}
                          onValueChange={(v) => {
                            setIdType(v as IdDocumentType);
                            markDirty();
                          }}
                        >
                          <SelectTrigger>
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
                      </div>
                      <Field label="ID number">
                        <Input value={idNumber} onChange={(e) => { setIdNumber(e.target.value); markDirty(); }} />
                      </Field>
                    </div>
                    <Field label="ID expiry">
                      <Input type="date" value={idExpiry} onChange={(e) => { setIdExpiry(e.target.value); markDirty(); }} />
                    </Field>
                    {promptPassportExpiry(idType || null, idExpiry) ? (
                      <p className="text-xs text-[#C89933]">Passport expiry is recommended.</p>
                    ) : null}
                    <Field label="Nationality">
                      <Input value={nationality} onChange={(e) => { setNationality(e.target.value); markDirty(); }} />
                    </Field>
                    <Field label="Address">
                      <Input value={addressLine1} onChange={(e) => { setAddressLine1(e.target.value); markDirty(); }} />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="City">
                        <Input value={city} onChange={(e) => { setCity(e.target.value); markDirty(); }} />
                      </Field>
                      <Field label="Country">
                        <Input value={country} onChange={(e) => { setCountry(e.target.value); markDirty(); }} />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Adults">
                        <Input
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
                      <p className="text-sm text-muted-foreground">Special requests: {stay.specialRequests}</p>
                    ) : null}
                    <div className="space-y-2 rounded-xl border border-border p-3">
                      <Label htmlFor="reg-waiver">Request waiver</Label>
                      <Textarea
                        id="reg-waiver"
                        value={regReason}
                        onChange={(e) => setRegReason(e.target.value)}
                        placeholder="Supervisor reason"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!regReason.trim() || waiveRegMut.isPending}
                        onClick={() => waiveRegMut.mutate()}
                      >
                        {waiveRegMut.isPending ? "Saving…" : "Request waiver"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {step === "deposit" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <FolioChip label="open" on={ctx?.folio.open ?? false} />
                      <FolioChip label="required" on />
                      <FolioChip label="already posted" on={(ctx?.folio.postedAmount ?? 0) > 0} />
                      <FolioChip label="outstanding" on={(ctx?.folio.outstanding ?? 0) > 0 && !depositOk} />
                    </div>
                    {depositOk ? (
                      <p className="rounded-xl bg-[#436436]/15 px-3 py-2 text-sm font-medium text-[#436436]">
                        {ctx?.progress.depositWaived
                          ? "Deposit waived"
                          : `Deposit satisfied${ctx?.folio.postedAmount ? ` · ${money(ctx.folio.postedAmount)}` : ""}`}
                      </p>
                    ) : (
                      <>
                        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                          {DEPOSIT_REQUIRED_BANNER}
                        </p>
                        <Field label="Amount">
                          <Input
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
                        <div className="flex flex-wrap gap-2">
                          {DEPOSIT_METHOD_CHIPS.map((chip) => (
                            <button
                              key={chip.id}
                              type="button"
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-sm",
                                depositMethod === chip.id
                                  ? "border-[#C89933] bg-[#C89933]/15 text-[#251605]"
                                  : "border-[#CCCCCC] text-muted-foreground",
                              )}
                              onClick={() => setDepositMethod(chip.id)}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                        <Field label="Reference">
                          <Input value={depositRef} onChange={(e) => setDepositRef(e.target.value)} />
                        </Field>
                        <Button
                          type="button"
                          className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                          disabled={!Number(depositAmount) || postDepMut.isPending}
                          onClick={() => postDepMut.mutate()}
                        >
                          {postDepMut.isPending ? "Posting…" : "Post deposit"}
                        </Button>
                      </>
                    )}
                    <div className="space-y-2 rounded-xl border border-border p-3">
                      <Label htmlFor="dep-waiver">Waive deposit</Label>
                      <Textarea
                        id="dep-waiver"
                        value={depositReason}
                        onChange={(e) => setDepositReason(e.target.value)}
                        placeholder="Supervisor reason"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!depositReason.trim() || waiveDepMut.isPending}
                        onClick={() => waiveDepMut.mutate()}
                      >
                        {waiveDepMut.isPending ? "Saving…" : "Waive deposit"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {step === "key" ? (
                  <div className="space-y-4">
                    {ctx?.progress.keyWaived ? (
                      <p className="inline-flex rounded-full bg-[#C89933]/20 px-2.5 py-1 text-xs font-medium text-[#251605]">
                        Keys later
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      <Label>Access type</Label>
                      <Select
                        value={keyType}
                        onValueChange={(v) => {
                          setKeyType(v as KeyAccessType);
                          markDirty();
                        }}
                      >
                        <SelectTrigger>
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
                    </div>
                    <Field label="Identifier">
                      <Input value={keyId} onChange={(e) => { setKeyId(e.target.value); markDirty(); }} />
                    </Field>
                    <Field label="Number of keys">
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={keyCount}
                        onChange={(e) => setKeyCount(Math.max(1, Number(e.target.value) || 1))}
                      />
                    </Field>
                    <p className="text-xs text-muted-foreground">
                      Issued at {ctx?.progress.keyIssuedAt ? formatStayDate(ctx.progress.keyIssuedAt.slice(0, 10)) : "now"}
                      {ctx?.actorName ? ` · ${ctx.actorName}` : ""}
                    </p>
                    <div className="space-y-2 rounded-xl border border-border p-3">
                      <Label htmlFor="key-waiver">Keys later</Label>
                      <Textarea
                        id="key-waiver"
                        value={keyReason}
                        onChange={(e) => setKeyReason(e.target.value)}
                        placeholder="Supervisor reason"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!keyReason.trim() || waiveKeyMut.isPending}
                        onClick={() => waiveKeyMut.mutate()}
                      >
                        {waiveKeyMut.isPending ? "Saving…" : "Keys later"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {step === "complete" ? (
                  <div className="space-y-3 text-sm">
                    <SummaryRow
                      label="Room"
                      value={assignedRoom ? `Room ${assignedRoom.roomNumber}` : stay.roomNumber ? `Room ${stay.roomNumber}` : "Unassigned"}
                      ok={roomGate.ready}
                    />
                    <SummaryRow
                      label="Registration"
                      value={ctx?.progress.registrationWaived ? "waived" : "complete"}
                      ok={registrationOk}
                    />
                    <SummaryRow
                      label="Deposit"
                      value={
                        ctx?.progress.depositWaived
                          ? "waived"
                          : ctx?.folio.postedAmount
                            ? `${money(ctx.folio.postedAmount)}${ctx.folio.postedMethod ? ` · ${ctx.folio.postedMethod}` : ""}`
                            : "required"
                      }
                      ok={depositOk}
                    />
                    <SummaryRow
                      label="Key"
                      value={ctx?.progress.keyWaived ? "waived" : "recorded"}
                      ok={keyOk}
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-[#CCCCCC] bg-background px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={requestClose}>
                Cancel
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={step === "stay"} onClick={goBack}>
                  Back
                </Button>
                {step === "complete" ? (
                  <Button
                    type="button"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                    disabled={continueDisabled}
                    onClick={() => completeMut.mutate()}
                  >
                    {completeMut.isPending ? "Checking in…" : "Complete check-in"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                    disabled={continueDisabled}
                    onClick={onContinue}
                  >
                    Continue
                  </Button>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function FolioChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-center",
        on ? "bg-[#436436]/15 text-[#436436]" : "bg-[#CCCCCC]/40 text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function SummaryRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? "font-medium text-[#436436]" : "font-medium text-destructive"}>{value}</span>
    </div>
  );
}
