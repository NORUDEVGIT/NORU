import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, CalendarCheck, CircleDollarSign, Minus, Percent, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { FolioSearchFolioStatusBadge } from "@/packages/pms/components/cashiering/folio-bits";
import { CARD } from "@/packages/pms/components/cashiering/folio-workspace-panels";
import {
  listChargeableGuestServices,
  postFolioEntry,
  postFolioServiceCharge,
  previewFolioCharge,
  previewFolioServiceCharge,
  servicePostBlockReason,
  type ChargeableGuestService,
  type ChargePricingUnit,
  type FolioChargePreview,
  type FolioChargePreviewLine,
  type FolioServiceChargePreview,
} from "@/packages/pms/lib/cashiering.functions";
import { stayNights } from "@/packages/pms/lib/folio-workspace";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

export interface PostChargeFolio {
  id: string;
  folioNumber: string;
  guestName: string;
  status: "open" | "closed";
  currency: string;
  roomNumber: string | null;
  roomTypeName: string | null;
  confirmationNumber: string | null;
  reservationId: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
}

type ChargeSource = "service" | "manual";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function parseAmount(raw: string): number | null {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function lineLabel(line: FolioChargePreviewLine): string {
  if (line.chargeType !== "percentage") return line.name || line.code;
  const rate = Number.isInteger(line.rate) ? String(line.rate) : String(line.rate);
  return `${line.name || line.code} ${rate}%`;
}

function roomLine(folio: PostChargeFolio): string {
  const parts = [folio.roomNumber, folio.roomTypeName].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function pricingUnitLabel(unit: string | null): string {
  switch (unit as ChargePricingUnit | null) {
    case "per_service":
      return "Per service";
    case "per_person":
      return "Per person";
    case "per_room":
      return "Per room";
    case "per_night":
      return "Per night";
    case "per_item":
      return "Per item";
    default:
      return "—";
  }
}

function catalogueUnitPrice(
  item: ChargeableGuestService | null,
  money: (value: number) => string,
): string {
  if (!item || item.unitAmount == null) return "—";
  if (!item.currencyMatches && item.currency) return `${item.currency} ${item.unitAmount.toFixed(2)}`;
  return money(item.unitAmount);
}

function defaultQuantity(item: ChargeableGuestService, folio: PostChargeFolio): number {
  if (item.pricingUnit === "per_night") {
    const nights = stayNights(folio.arrivalDate, folio.departureDate);
    return Math.min(99, Math.max(1, nights ?? 1));
  }
  return 1;
}

export function PostChargeDialog({
  restaurantId,
  folio,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  folio: PostChargeFolio;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const [source, setSource] = useState<ChargeSource>("service");
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [serviceTypeId, setServiceTypeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [postingAt, setPostingAt] = useState(() => new Date().toISOString());
  const [attempted, setAttempted] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const parsed = parseAmount(amount);
  const debouncedAmount = useDebounced(parsed, 300);
  const debouncedQuantity = useDebounced(quantity, 300);
  const closed = folio.status !== "open";
  const descriptionError =
    description.trim() === ""
      ? "Description is required."
      : description.trim().length > 200
        ? "Description must be 200 characters or fewer."
        : null;
  const amountError =
    parsed == null ? (amount.trim() === "" ? "Amount is required." : "Amount must be greater than zero.") : null;
  const quantityError =
    !Number.isInteger(quantity) || quantity < 1 || quantity > 99
      ? "Quantity must be a whole number from 1 to 99."
      : null;
  const showDescriptionError = (attempted || descriptionTouched) && descriptionError;
  const showAmountError = (attempted || amountTouched) && amountError;

  useEffect(() => {
    if (!open) return;
    setSource("service");
    setSearch("");
    setDepartmentId(null);
    setServiceTypeId(null);
    setQuantity(1);
    setDescription("");
    setAmount("");
    setIdempotencyKey(crypto.randomUUID());
    setPostingAt(new Date().toISOString());
    setAttempted(false);
    setDescriptionTouched(false);
    setAmountTouched(false);
    setFormError(null);
  }, [open]);

  const fetchServices = useServerFn(listChargeableGuestServices);
  const servicesQuery = useQuery({
    queryKey: ["chargeable-guest-services", restaurantId, folio.id],
    queryFn: () => fetchServices({ data: { restaurantId, folioId: folio.id } }),
    enabled: open && source === "service",
    retry: false,
  });
  const services = (servicesQuery.data ?? []) as ChargeableGuestService[];
  const selected = services.find((item) => item.serviceTypeId === serviceTypeId) ?? null;
  const blockReason = selected ? servicePostBlockReason(selected) : null;
  const quantityEditable = selected?.quantityMode === "editable";

  const departments = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of services) {
      if (!names.has(item.departmentId)) names.set(item.departmentId, item.departmentName || item.departmentCode);
    }
    return [...names.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [services]);

  useEffect(() => {
    if (departments.length === 1 && departmentId == null) setDepartmentId(departments[0].id);
  }, [departments, departmentId]);

  const serviceOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return services.filter((item) => {
      if (departmentId && item.departmentId !== departmentId) return false;
      if (!term) return true;
      return item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term);
    });
  }, [departmentId, search, services]);

  const fetchPreview = useServerFn(previewFolioCharge);
  const manualPreviewQuery = useQuery({
    queryKey: ["folio-charge-preview", restaurantId, folio.id, debouncedAmount],
    queryFn: () =>
      fetchPreview({
        data: { restaurantId, folioId: folio.id, amount: debouncedAmount ?? 0 },
      }),
    enabled: open && source === "manual" && !closed && debouncedAmount != null,
    retry: false,
  });

  const fetchServicePreview = useServerFn(previewFolioServiceCharge);
  const servicePreviewQuery = useQuery({
    queryKey: [
      "folio-service-charge-preview",
      restaurantId,
      folio.id,
      serviceTypeId,
      debouncedQuantity,
    ],
    queryFn: () =>
      fetchServicePreview({
        data: {
          restaurantId,
          folioId: folio.id,
          serviceTypeId: serviceTypeId ?? "",
          quantity: debouncedQuantity,
        },
      }),
    enabled:
      open &&
      source === "service" &&
      !closed &&
      serviceTypeId != null &&
      blockReason == null &&
      quantityError == null &&
      debouncedQuantity >= 1,
    retry: false,
  });

  const manualPreview = manualPreviewQuery.data as FolioChargePreview | undefined;
  const servicePreview = servicePreviewQuery.data as FolioServiceChargePreview | undefined;
  const activeQuery = source === "service" ? servicePreviewQuery : manualPreviewQuery;
  const preview = source === "service" ? servicePreview : manualPreview;
  const previewReady =
    source === "manual"
      ? parsed != null &&
        parsed === debouncedAmount &&
        manualPreview != null &&
        !manualPreviewQuery.isFetching &&
        !manualPreviewQuery.isError
      : selected != null &&
        quantityError == null &&
        quantity === debouncedQuantity &&
        servicePreview != null &&
        !servicePreviewQuery.isFetching &&
        !servicePreviewQuery.isError;

  const postManual = useServerFn(postFolioEntry);
  const postService = useServerFn(postFolioServiceCharge);
  const mutation = useMutation({
    mutationFn: () =>
      source === "service"
        ? postService({
            data: {
              restaurantId,
              folioId: folio.id,
              serviceTypeId: selected?.serviceTypeId ?? "",
              quantity,
              description: description.trim(),
              idempotencyKey,
            },
          })
        : postManual({
            data: {
              restaurantId,
              folioId: folio.id,
              type: "charge",
              amount: parsed ?? 0,
              description: description.trim(),
              idempotencyKey,
            },
          }),
    onSuccess: (result) => {
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      toast.success(`Charge posted to ${folio.folioNumber}.`);
      onDone();
      onClose();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  function chooseSource(next: ChargeSource) {
    if (next === source) return;
    setSource(next);
    setSearch("");
    setDepartmentId(null);
    setServiceTypeId(null);
    setQuantity(1);
    setDescription("");
    setAmount("");
    setIdempotencyKey(crypto.randomUUID());
    setAttempted(false);
    setDescriptionTouched(false);
    setAmountTouched(false);
    setFormError(null);
  }

  function chooseService(item: ChargeableGuestService) {
    setServiceTypeId(item.serviceTypeId);
    setQuantity(defaultQuantity(item, folio));
    setDescription(item.name);
    setDescriptionTouched(false);
    setFormError(null);
  }

  function chooseDepartment(next: string) {
    setDepartmentId(next);
    if (selected && selected.departmentId !== next) {
      setServiceTypeId(null);
      setQuantity(1);
      setDescription("");
      setDescriptionTouched(false);
    }
    setFormError(null);
  }

  function clearFields() {
    setSearch("");
    setDepartmentId(departments.length === 1 ? departments[0].id : null);
    setServiceTypeId(null);
    setQuantity(1);
    setDescription("");
    setAmount("");
    setIdempotencyKey(crypto.randomUUID());
    setAttempted(false);
    setDescriptionTouched(false);
    setAmountTouched(false);
    setFormError(null);
  }

  const serviceInvalid =
    source === "service" && (selected == null || Boolean(quantityError) || Boolean(blockReason));
  const manualInvalid = source === "manual" && Boolean(amountError);
  const blocked =
    closed || Boolean(descriptionError) || serviceInvalid || manualInvalid || !previewReady || mutation.isPending;

  function submit() {
    setAttempted(true);
    setFormError(null);
    if (blocked) return;
    mutation.mutate();
  }

  const headerStay = [folio.roomNumber ? `Room ${folio.roomNumber}` : null, folio.confirmationNumber]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent
        className="flex max-h-[88vh] w-[calc(100%-1.5rem)] max-w-[1000px] flex-col gap-0 overflow-hidden border-[#E8E1D7] bg-[#F7F4EE] p-0 sm:max-w-[1000px] sm:rounded-xl"
        data-testid="post-charge-dialog"
      >
        <header className="flex items-start gap-3 border-b border-[#E8E1D7] bg-card px-4 py-3 pr-12">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#C89933]/12 text-[#8a6a1f]">
            <Receipt className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base font-semibold leading-tight">Post Charge</DialogTitle>
              <FolioSearchFolioStatusBadge status={folio.status} />
            </div>
            <DialogDescription className="mt-0.5 truncate text-xs text-muted-foreground">
              {folio.folioNumber} · {folio.guestName}
              {headerStay ? ` · ${headerStay}` : ""}
            </DialogDescription>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className={cn(CARD, "space-y-4 bg-card p-4")}>
              <h3 className="text-sm font-semibold">Charge Details</h3>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Charge source
                </p>
                <div className="mt-2 inline-flex rounded-lg border border-[#E8E1D7] bg-[#F7F4EE] p-0.5" role="group">
                  <button
                    type="button"
                    className={cn(
                      "h-8 rounded-md px-3 text-sm",
                      source === "service" ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
                    )}
                    aria-pressed={source === "service"}
                    onClick={() => chooseSource("service")}
                  >
                    Service
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "h-8 rounded-md px-3 text-sm",
                      source === "manual" ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
                    )}
                    aria-pressed={source === "manual"}
                    onClick={() => chooseSource("manual")}
                  >
                    Manual
                  </button>
                </div>
              </div>

              {source === "service" ? (
                <ServiceFields
                  search={search}
                  onSearch={setSearch}
                  departments={departments}
                  departmentId={departmentId}
                  onDepartment={chooseDepartment}
                  serviceOptions={serviceOptions}
                  loading={servicesQuery.isLoading}
                  error={servicesQuery.isError ? (servicesQuery.error as Error).message : null}
                  empty={servicesQuery.isSuccess && services.length === 0}
                  selected={selected}
                  blockReason={blockReason}
                  quantity={quantity}
                  quantityEditable={quantityEditable}
                  quantityError={attempted && quantityError ? quantityError : null}
                  onSelect={chooseService}
                  onQuantity={(next) => {
                    setQuantity(next);
                    setFormError(null);
                  }}
                  unitPrice={
                    previewReady && servicePreview
                      ? money(servicePreview.unitAmount)
                      : catalogueUnitPrice(selected, money)
                  }
                  subtotal={previewReady && servicePreview ? money(servicePreview.enteredAmount) : "—"}
                />
              ) : (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Charge Type
                  </p>
                  <p className="mt-1 text-sm font-medium">Manual Charge</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="post-charge-description">Description</Label>
                <Input
                  id="post-charge-description"
                  value={description}
                  maxLength={200}
                  placeholder={source === "service" ? "Folio wording" : "Laundry service"}
                  onBlur={() => setDescriptionTouched(true)}
                  onChange={(event) => setDescription(event.target.value)}
                  aria-invalid={showDescriptionError ? true : undefined}
                />
                <p className="text-[11px] text-muted-foreground">
                  {source === "service"
                    ? "Wording stored on the folio line. The service name in Settings stays on the snapshot."
                    : "Describe the charge for the folio."}
                </p>
                {showDescriptionError ? <p className="text-xs text-destructive">{descriptionError}</p> : null}
              </div>

              {source === "manual" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="post-charge-amount">Charge Amount</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                      {folio.currency}
                    </span>
                    <Input
                      id="post-charge-amount"
                      inputMode="decimal"
                      className="pl-14"
                      value={amount}
                      placeholder="0.00"
                      onBlur={() => setAmountTouched(true)}
                      onChange={(event) => setAmount(event.target.value)}
                      aria-invalid={showAmountError ? true : undefined}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Amount entered. Inclusive taxes are split out of this amount when Settings say so.
                  </p>
                  {showAmountError ? <p className="text-xs text-destructive">{amountError}</p> : null}
                </div>
              ) : null}

              <dl className="grid gap-3 border-t border-[#E8E1D7] pt-3 sm:grid-cols-2">
                <ContextField icon={Receipt} label="Folio" value={`${folio.folioNumber} · ${folio.guestName}`} />
                <ContextField icon={BedDouble} label="Room" value={roomLine(folio)} />
                <div className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <CalendarCheck className="size-3.5" />
                    Reservation
                  </dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">
                    {folio.reservationId && folio.confirmationNumber ? (
                      <Link
                        to="/restaurant/pms/reservations/$reservationId"
                        params={{ reservationId: folio.reservationId }}
                        className="text-[#8a6a1f] hover:text-[#251605]"
                      >
                        {folio.confirmationNumber}
                      </Link>
                    ) : (
                      folio.confirmationNumber ?? "—"
                    )}
                  </dd>
                </div>
                <ContextField icon={CircleDollarSign} label="Posting now" value={dateTime(postingAt)} />
              </dl>
            </section>

            <aside className={cn(CARD, "bg-card p-4")} data-testid="post-charge-summary">
              <h3 className="text-sm font-semibold">Charge Summary</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <SummaryLine label="Folio" value={folio.folioNumber} />
                <SummaryLine label="Guest" value={folio.guestName} />
                <SummaryLine label="Room" value={folio.roomNumber ?? "—"} />
                {source === "service" && selected ? (
                  <SummaryLine label="Department" value={selected.departmentName || "—"} />
                ) : null}
              </dl>
              <div className="mt-4 border-t border-[#E8E1D7] pt-3">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Percent className="size-3.5" />
                  Tax & Service
                </p>
                <div className="mt-2 space-y-1.5 text-sm">
                  {closed ? (
                    <p className="text-xs text-destructive">
                      This folio is closed. Nothing more can be posted to it.
                    </p>
                  ) : source === "manual" && parsed == null ? (
                    <p className="text-xs text-muted-foreground">Enter an amount to preview tax and service.</p>
                  ) : source === "service" && blockReason ? (
                    <p className="text-xs text-destructive">{blockReason}</p>
                  ) : source === "service" && selected == null ? (
                    <p className="text-xs text-muted-foreground">Choose a guest service to preview tax and service.</p>
                  ) : activeQuery.isError ? (
                    <p className="text-xs text-destructive">{(activeQuery.error as Error).message}</p>
                  ) : !previewReady || !preview ? (
                    <p className="text-xs text-muted-foreground">Updating preview…</p>
                  ) : preview.taxLines.length === 0 && preview.serviceLines.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tax or service charge applies.</p>
                  ) : (
                    <>
                      {preview.taxLines.map((line) => (
                        <SummaryLine
                          key={`tax-${line.code}-${line.calculation}`}
                          label={lineLabel(line)}
                          value={money(line.amount)}
                          tone="tax"
                        />
                      ))}
                      {preview.serviceLines.map((line) => (
                        <SummaryLine
                          key={`svc-${line.code}`}
                          label={lineLabel(line)}
                          value={money(line.amount)}
                          tone="service"
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
              <dl className="mt-4 space-y-2 border-t border-[#E8E1D7] pt-3 text-sm">
                <SummaryLine label="Net Charge" value={previewReady && preview ? money(preview.netAmount) : "—"} />
                <SummaryLine
                  label="Tax"
                  value={
                    previewReady && preview
                      ? money(preview.taxLines.reduce((sum, line) => sum + line.amount, 0))
                      : "—"
                  }
                  tone="tax"
                />
                <SummaryLine
                  label="Service Charge"
                  value={
                    previewReady && preview
                      ? money(preview.serviceLines.reduce((sum, line) => sum + line.amount, 0))
                      : "—"
                  }
                  tone="service"
                />
              </dl>
              <div className="mt-3 flex items-baseline justify-between border-t border-[#E8E1D7] pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide">Total</span>
                <span className="font-display text-lg font-semibold tabular-nums">
                  {previewReady && preview ? money(preview.total) : "—"}
                </span>
              </div>
            </aside>
          </div>
          {formError ? <p className="mt-3 text-sm text-destructive">{formError}</p> : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E8E1D7] bg-card px-4 py-3">
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={clearFields}>
            Clear
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
            disabled={blocked}
            onClick={submit}
            data-testid="post-charge-submit"
          >
            Post Charge
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ServiceFields({
  search,
  onSearch,
  departments,
  departmentId,
  onDepartment,
  serviceOptions,
  loading,
  error,
  empty,
  selected,
  blockReason,
  quantity,
  quantityEditable,
  quantityError,
  onSelect,
  onQuantity,
  unitPrice,
  subtotal,
}: {
  search: string;
  onSearch: (value: string) => void;
  departments: Array<{ id: string; name: string }>;
  departmentId: string | null;
  onDepartment: (departmentId: string) => void;
  serviceOptions: ChargeableGuestService[];
  loading: boolean;
  error: string | null;
  empty: boolean;
  selected: ChargeableGuestService | null;
  blockReason: string | null;
  quantity: number;
  quantityEditable: boolean;
  quantityError: string | null;
  onSelect: (item: ChargeableGuestService) => void;
  onQuantity: (quantity: number) => void;
  unitPrice: string;
  subtotal: string;
}) {
  const options =
    selected && !serviceOptions.some((item) => item.serviceTypeId === selected.serviceTypeId)
      ? [selected, ...serviceOptions]
      : serviceOptions;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="post-charge-department">Department</Label>
        <Select
          value={departmentId ?? undefined}
          disabled={loading || Boolean(error) || empty}
          onValueChange={onDepartment}
        >
          <SelectTrigger id="post-charge-department">
            <SelectValue placeholder={loading ? "Loading departments…" : "Select a department"} />
          </SelectTrigger>
          <SelectContent>
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="post-charge-service-search">Find a service</Label>
        <Input
          id="post-charge-service-search"
          value={search}
          placeholder="Search name or code"
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="post-charge-service">Service</Label>
        <Select
          value={selected?.serviceTypeId}
          disabled={!departmentId || loading || Boolean(error) || empty}
          onValueChange={(serviceTypeId) => {
            const item = options.find((row) => row.serviceTypeId === serviceTypeId);
            if (item) onSelect(item);
          }}
        >
          <SelectTrigger id="post-charge-service">
            <SelectValue placeholder={departmentId ? "Select a service" : "Select a department first"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((item) => (
              <SelectItem key={item.serviceTypeId} value={item.serviceTypeId}>
                {item.name} ({item.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading ? <p className="text-xs text-muted-foreground">Loading guest services…</p> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {empty ? (
          <p className="text-xs text-muted-foreground">
            No services have a billing department yet. Mark one on Guest & Services → Department, or post a manual
            charge.
          </p>
        ) : null}
        {!empty && departmentId && options.length === 0 ? (
          <p className="text-xs text-muted-foreground">No services match that search.</p>
        ) : null}
        {blockReason ? <p className="text-xs text-destructive">{blockReason}</p> : null}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <ReadOnlyField label="Pricing unit" value={selected ? pricingUnitLabel(selected.pricingUnit) : "—"} />
        <div className="space-y-1.5">
          <Label htmlFor="post-charge-quantity">Quantity</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!quantityEditable || quantity <= 1}
              onClick={() => onQuantity(Math.max(1, quantity - 1))}
            >
              <Minus className="size-3.5" />
            </Button>
            <Input
              id="post-charge-quantity"
              inputMode="numeric"
              className="h-8 w-16 text-center"
              value={String(quantity)}
              readOnly={!quantityEditable}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next)) onQuantity(next);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!quantityEditable || quantity >= 99}
              onClick={() => onQuantity(Math.min(99, quantity + 1))}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
          {quantityError ? <p className="text-xs text-destructive">{quantityError}</p> : null}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Unit price</p>
          <p className="mt-1 truncate text-sm font-medium" data-testid="service-unit-price">
            {unitPrice}
          </p>
        </div>
        <ReadOnlyField label="Subtotal" value={subtotal} />
      </dl>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

function ContextField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "tax" | "service";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums",
          tone === "tax" && "text-blue-700",
          tone === "service" && "text-violet-700",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
