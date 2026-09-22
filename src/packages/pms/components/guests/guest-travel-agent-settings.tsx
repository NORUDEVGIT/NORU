import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { GuestTravelAgentDocuments } from "@/packages/pms/components/guests/guest-travel-agent-documents";
import {
  listTravelAgentAllotments,
  listTravelAgentCommissionPlans,
  listTravelAgentNotificationPrefs,
  listTravelAgentSettingsCatalogues,
  saveTravelAgentAllotment,
  saveTravelAgentCommissionPlan,
  saveTravelAgentNotificationPrefs,
  updateTravelAgentSettings,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import {
  TA_ALLOTMENT_COPY,
  TA_SETTINGS_SECTIONS,
  travelAgentSettingsSection,
  type TravelAgentSettingsSectionId,
} from "@/packages/pms/lib/guest-travel-agent-detail-workspace";
import { AGENCY_TYPE_LABELS, AGENCY_TYPES, type AgencyType } from "@/packages/pms/lib/guest-profile-travel-agency";
import { GUEST_ACCOUNT_STATUSES } from "@/packages/pms/lib/guest-profile-wave4";
import { cn } from "@/shared/lib/utils";

type Agency = Awaited<
  ReturnType<typeof import("@/packages/pms/lib/guest-travel-agent-detail.functions").getTravelAgentDetailWorkspace>
>["agency"];

export function GuestTravelAgentSettings({
  restaurantId,
  agencyId,
  agency,
}: {
  restaurantId: string;
  agencyId: string;
  agency: Agency;
}) {
  const [section, setSection] = useState<TravelAgentSettingsSectionId>("general");
  return (
    <div className="space-y-4" data-testid="travel-agent-settings">
      <div>
        <h2 className="font-display text-xl">Agency Settings</h2>
        <p className="text-sm text-muted-foreground">Configuration for this travel agency only. This is not property Settings.</p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-border pb-px" aria-label="Agency settings">
        {TA_SETTINGS_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(travelAgentSettingsSection(item.id))}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
              section === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
            )}
          >
            {item.title}
          </button>
        ))}
      </nav>
      {section === "general" || section === "rules" || section === "billing" ? (
        <GeneralSettings restaurantId={restaurantId} agencyId={agencyId} agency={agency} section={section} />
      ) : section === "commission" ? (
        <CommissionSettings restaurantId={restaurantId} agencyId={agencyId} />
      ) : section === "allotment" ? (
        <AllotmentSettings restaurantId={restaurantId} agencyId={agencyId} />
      ) : section === "notifications" ? (
        <NotificationSettings restaurantId={restaurantId} agencyId={agencyId} />
      ) : (
        <GuestTravelAgentDocuments restaurantId={restaurantId} agencyId={agencyId} />
      )}
    </div>
  );
}

function GeneralSettings({
  restaurantId,
  agencyId,
  agency,
  section,
}: {
  restaurantId: string;
  agencyId: string;
  agency: Agency;
  section: TravelAgentSettingsSectionId;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(updateTravelAgentSettings);
  const loadCatalogues = useServerFn(listTravelAgentSettingsCatalogues);
  const catalogues = useQuery({
    queryKey: ["travel-agent-settings-catalogues", restaurantId, agencyId],
    queryFn: () => loadCatalogues({ data: { restaurantId, agencyId } }),
  });
  const [form, setForm] = useState({
    code: agency.code ?? "",
    agencyType: (agency.agencyType ?? "") as AgencyType | "",
    accountStatus: agency.accountStatus,
    primaryContactName: agency.primaryContactName ?? "",
    email: agency.email ?? "",
    phone: agency.phone ?? "",
    website: agency.website ?? "",
    addressLine1: agency.addressLine1 ?? "",
    city: agency.city ?? "",
    country: agency.country ?? "",
    notes: agency.notes ?? "",
    preferredCurrency: agency.preferredCurrency ?? "",
    marketSegmentId: agency.marketSegmentId ?? "",
    bookingAccess: agency.bookingAccess,
    maxAdvanceBookingDays: agency.maxAdvanceBookingDays?.toString() ?? "",
    minStayNights: agency.minStayNights?.toString() ?? "",
    maxStayNights: agency.maxStayNights?.toString() ?? "",
    groupBookingsAllowed: agency.groupBookingsAllowed,
    paymentTerms: agency.paymentTerms ?? "",
    billingInstruction: agency.billingInstruction ?? "",
    creditLimitNote: agency.creditLimitNote ?? "",
    creditLimitAmount: agency.creditLimitAmount?.toString() ?? "",
    allowedRoomTypeIds: [] as string[],
  });
  useEffect(() => {
    if (catalogues.data?.allowedRoomTypeIds) {
      setForm((current) => ({ ...current, allowedRoomTypeIds: catalogues.data.allowedRoomTypeIds }));
    }
  }, [catalogues.data?.allowedRoomTypeIds]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          agencyId,
          code: form.code || null,
          agencyType: form.agencyType || null,
          accountStatus: form.accountStatus as "active" | "inactive" | "pending",
          primaryContactName: form.primaryContactName || null,
          email: form.email || null,
          phone: form.phone || null,
          website: form.website || null,
          addressLine1: form.addressLine1 || null,
          city: form.city || null,
          country: form.country || null,
          notes: form.notes || null,
          preferredCurrency: form.preferredCurrency || null,
          marketSegmentId: form.marketSegmentId || null,
          bookingAccess: form.bookingAccess,
          maxAdvanceBookingDays: form.maxAdvanceBookingDays ? Number(form.maxAdvanceBookingDays) : null,
          minStayNights: form.minStayNights ? Number(form.minStayNights) : null,
          maxStayNights: form.maxStayNights ? Number(form.maxStayNights) : null,
          groupBookingsAllowed: form.groupBookingsAllowed,
          paymentTerms: form.paymentTerms || null,
          billingInstruction: form.billingInstruction || null,
          creditLimitNote: form.creditLimitNote || null,
          creditLimitAmount: form.creditLimitAmount ? Number(form.creditLimitAmount) : null,
          allowedRoomTypeIds: form.allowedRoomTypeIds,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-detail", restaurantId, agencyId] });
      toast.success("Agency settings saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      {section === "general" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Agency code"><Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></Field>
          <Field label="Agency type">
            <Select value={form.agencyType} onValueChange={(value) => setForm((current) => ({ ...current, agencyType: value as AgencyType }))}>
              <SelectTrigger><SelectValue placeholder="Agency type" /></SelectTrigger>
              <SelectContent>
                {AGENCY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{AGENCY_TYPE_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.accountStatus} onValueChange={(value) => setForm((current) => ({ ...current, accountStatus: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GUEST_ACCOUNT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Primary contact"><Input value={form.primaryContactName} onChange={(event) => setForm((current) => ({ ...current, primaryContactName: event.target.value }))} /></Field>
          <Field label="Email"><Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
          <Field label="Website"><Input value={form.website} onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))} /></Field>
          <Field label="Address"><Input value={form.addressLine1} onChange={(event) => setForm((current) => ({ ...current, addressLine1: event.target.value }))} /></Field>
          <Field label="City"><Input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} /></Field>
          <Field label="Country"><Input value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} /></Field>
          <Field label="Preferred currency"><Input value={form.preferredCurrency} onChange={(event) => setForm((current) => ({ ...current, preferredCurrency: event.target.value.toUpperCase() }))} /></Field>
          <Field label="Market segment">
            <Select value={form.marketSegmentId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, marketSegmentId: value === "none" ? "" : value }))}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(catalogues.data?.marketSegments ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2"><Label>Internal notes</Label><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
        </div>
      ) : null}
      {section === "rules" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Booking access">
            <Select value={form.bookingAccess} onValueChange={(value) => setForm((current) => ({ ...current, bookingAccess: value as "open" | "restricted" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Max advance booking days"><Input type="number" value={form.maxAdvanceBookingDays} onChange={(event) => setForm((current) => ({ ...current, maxAdvanceBookingDays: event.target.value }))} /></Field>
          <Field label="Minimum stay nights"><Input type="number" value={form.minStayNights} onChange={(event) => setForm((current) => ({ ...current, minStayNights: event.target.value }))} /></Field>
          <Field label="Maximum stay nights"><Input type="number" value={form.maxStayNights} onChange={(event) => setForm((current) => ({ ...current, maxStayNights: event.target.value }))} /></Field>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <Checkbox checked={form.groupBookingsAllowed} onCheckedChange={(value) => setForm((current) => ({ ...current, groupBookingsAllowed: value === true }))} />
            Group bookings allowed
          </label>
          <div className="md:col-span-2">
            <Label>Allowed room types</Label>
            <p className="mb-2 text-xs text-muted-foreground">Leave empty to allow every room type. These rules are enforced on new agency bookings.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(catalogues.data?.roomTypes ?? []).map((row) => (
                <label key={row.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.allowedRoomTypeIds.includes(row.id)}
                    onCheckedChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        allowedRoomTypeIds:
                          value === true
                            ? [...current.allowedRoomTypeIds, row.id]
                            : current.allowedRoomTypeIds.filter((id) => id !== row.id),
                      }))
                    }
                  />
                  {row.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {section === "billing" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Payment terms"><Input value={form.paymentTerms} onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))} /></Field>
          <Field label="Numeric credit limit"><Input type="number" value={form.creditLimitAmount} onChange={(event) => setForm((current) => ({ ...current, creditLimitAmount: event.target.value }))} /></Field>
          <div className="md:col-span-2"><Label>Credit limit note</Label><Textarea value={form.creditLimitNote} onChange={(event) => setForm((current) => ({ ...current, creditLimitNote: event.target.value }))} /></div>
          <div className="md:col-span-2"><Label>Billing instructions</Label><Textarea value={form.billingInstruction} onChange={(event) => setForm((current) => ({ ...current, billingInstruction: event.target.value }))} /></div>
        </div>
      ) : null}
      <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save settings</Button>
    </div>
  );
}

function CommissionSettings({ restaurantId, agencyId }: { restaurantId: string; agencyId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(listTravelAgentCommissionPlans);
  const save = useServerFn(saveTravelAgentCommissionPlan);
  const query = useQuery({
    queryKey: ["travel-agent-commission-plans", restaurantId, agencyId],
    queryFn: () => load({ data: { restaurantId, agencyId } }),
  });
  const [form, setForm] = useState({
    commissionType: "percent" as "percent" | "fixed",
    rateValue: "",
    currency: "ETB",
    effectiveOn: "",
    expiresOn: "",
    notes: "",
  });
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          agencyId,
          commissionType: form.commissionType,
          rateValue: Number(form.rateValue),
          currency: form.currency,
          effectiveOn: form.effectiveOn,
          expiresOn: form.expiresOn || null,
          notes: form.notes || null,
          active: true,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-commission-plans", restaurantId, agencyId] });
      toast.success("Commission plan saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Plans are the source of truth for commission. Existing commission_label values are only used for backfill.
      </p>
      <ul className="space-y-2 text-sm">
        {(query.data?.items ?? []).map((row) => (
          <li key={row.id} className="rounded-xl border border-border p-3">
            {row.commissionType} · {row.rateValue} {row.currency} · {row.effectiveOn}
            {row.expiresOn ? ` – ${row.expiresOn}` : ""} {row.active ? "" : "(inactive)"}
          </li>
        ))}
      </ul>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Type">
          <Select value={form.commissionType} onValueChange={(value) => setForm((current) => ({ ...current, commissionType: value as "percent" | "fixed" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percent</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Rate / value"><Input type="number" value={form.rateValue} onChange={(event) => setForm((current) => ({ ...current, rateValue: event.target.value }))} /></Field>
        <Field label="Currency"><Input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></Field>
        <Field label="Effective on"><Input type="date" value={form.effectiveOn} onChange={(event) => setForm((current) => ({ ...current, effectiveOn: event.target.value }))} /></Field>
        <Field label="Expires on"><Input type="date" value={form.expiresOn} onChange={(event) => setForm((current) => ({ ...current, expiresOn: event.target.value }))} /></Field>
        <div className="md:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
      </div>
      <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.rateValue || !form.effectiveOn}>
        Save plan
      </Button>
    </div>
  );
}

function AllotmentSettings({ restaurantId, agencyId }: { restaurantId: string; agencyId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(listTravelAgentAllotments);
  const save = useServerFn(saveTravelAgentAllotment);
  const loadCatalogues = useServerFn(listTravelAgentSettingsCatalogues);
  const query = useQuery({
    queryKey: ["travel-agent-allotments", restaurantId, agencyId],
    queryFn: () => load({ data: { restaurantId, agencyId } }),
  });
  const catalogues = useQuery({
    queryKey: ["travel-agent-settings-catalogues", restaurantId, agencyId],
    queryFn: () => loadCatalogues({ data: { restaurantId, agencyId } }),
  });
  const [form, setForm] = useState({
    roomTypeId: "",
    allocatedQty: "",
    startDate: "",
    endDate: "",
    releaseDays: "0",
    notes: "",
  });
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          agencyId,
          roomTypeId: form.roomTypeId,
          allocatedQty: Number(form.allocatedQty),
          startDate: form.startDate,
          endDate: form.endDate,
          releaseDays: Number(form.releaseDays || 0),
          notes: form.notes || null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-allotments", restaurantId, agencyId] });
      toast.success("Allotment saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{TA_ALLOTMENT_COPY}</p>
      <ul className="space-y-2 text-sm">
        {(query.data?.items ?? []).map((row) => (
          <li key={row.id} className="rounded-xl border border-border p-3">
            {row.roomTypeName}: {row.allocatedQty} rooms · {row.startDate} – {row.endDate} · release {row.releaseDays} days
          </li>
        ))}
      </ul>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Room type">
          <Select value={form.roomTypeId} onValueChange={(value) => setForm((current) => ({ ...current, roomTypeId: value }))}>
            <SelectTrigger><SelectValue placeholder="Room type" /></SelectTrigger>
            <SelectContent>
              {(catalogues.data?.roomTypes ?? []).map((row) => (
                <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Allocated quantity"><Input type="number" value={form.allocatedQty} onChange={(event) => setForm((current) => ({ ...current, allocatedQty: event.target.value }))} /></Field>
        <Field label="Start"><Input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></Field>
        <Field label="End"><Input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></Field>
        <Field label="Release days before arrival"><Input type="number" value={form.releaseDays} onChange={(event) => setForm((current) => ({ ...current, releaseDays: event.target.value }))} /></Field>
        <div className="md:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
      </div>
      <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.roomTypeId}>
        Save allotment
      </Button>
    </div>
  );
}

function NotificationSettings({ restaurantId, agencyId }: { restaurantId: string; agencyId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(listTravelAgentNotificationPrefs);
  const save = useServerFn(saveTravelAgentNotificationPrefs);
  const query = useQuery({
    queryKey: ["travel-agent-notification-prefs", restaurantId, agencyId],
    queryFn: () => load({ data: { restaurantId, agencyId } }),
  });
  const [items, setItems] = useState(query.data?.items ?? []);
  useEffect(() => {
    if (query.data?.items) setItems(query.data.items);
  }, [query.data?.items]);
  const mutation = useMutation({
    mutationFn: () => save({ data: { restaurantId, agencyId, items } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-notification-prefs", restaurantId, agencyId] });
      toast.success("Notification preferences saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Email is sent only through the existing hotel notification channel. A send is recorded only when it succeeds.
      </p>
      {items.map((item) => (
        <label key={item.eventKey} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={item.enabled}
            onCheckedChange={(value) =>
              setItems((current) =>
                current.map((row) => (row.eventKey === item.eventKey ? { ...row, enabled: value === true } : row)),
              )
            }
          />
          {item.eventKey.replaceAll("_", " ")} (email)
        </label>
      ))}
      <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save notifications</Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
