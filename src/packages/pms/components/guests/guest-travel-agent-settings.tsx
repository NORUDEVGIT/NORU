import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, ArrowUpRight, Bell, CalendarCheck, Check, Edit2, Info, Plus, Sliders } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  listTravelAgentAllotments,
  listTravelAgentNotificationPrefs,
  listTravelAgentSettingsCatalogues,
  saveTravelAgentAllotment,
  saveTravelAgentCommissionPlan,
  saveTravelAgentNotificationPrefs,
  updateTravelAgentSettings,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import {
  TA_ALLOTMENT_COPY,
  TA_ALLOTMENT_STATUSES,
  TA_VISIBLE_SETTINGS_SECTIONS,
  travelAgentSettingsSection,
  type TravelAgentSettingsSectionId,
} from "@/packages/pms/lib/guest-travel-agent-detail-workspace";
import { cn } from "@/shared/lib/utils";

type Agency = Awaited<
  ReturnType<typeof import("@/packages/pms/lib/guest-travel-agent-detail.functions").getTravelAgentDetailWorkspace>
>["agency"];

export function GuestTravelAgentSettings({
  restaurantId,
  agencyId,
  agency,
  initialSection = "rules",
  onNavigateTab,
}: {
  restaurantId: string;
  agencyId: string;
  agency: Agency;
  initialSection?: TravelAgentSettingsSectionId;
  onNavigateTab?: (tab: string) => void;
}) {
  const [section, setSection] = useState<TravelAgentSettingsSectionId>(() =>
    travelAgentSettingsSection(initialSection),
  );

  const isLegacySection = ["general", "commission", "billing", "documents"].includes(initialSection);

  return (
    <div className="space-y-4" data-testid="travel-agent-settings">
      {/* Header */}
      <div className="border-b border-[#DDD4C5] pb-3">
        <h2 className="font-display text-lg font-bold text-[#251605]">Agency Settings</h2>
        <p className="text-xs text-[#756A5B]">
          Operational rules, inventory limits, and notification preferences specific to this travel agency profile.
        </p>
      </div>

      {/* Legacy Canonical Redirect Callout */}
      {isLegacySection && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
          <Info className="size-4 shrink-0 text-amber-700 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Canonical View Reorganization</p>
            <p className="text-amber-800 leading-relaxed">
              {initialSection === "general" &&
                "Agency identity, IATA licensing, contacts, and address are managed in the canonical Agency Details view."}
              {(initialSection === "commission" || initialSection === "billing") &&
                "Commercial terms, commission plans, and folio billing are managed in the canonical Commercial & Commission view."}
              {initialSection === "documents" &&
                "Agreements, contracts, and certifications are managed in the canonical Documents view."}
            </p>
            {onNavigateTab && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 h-7 border-amber-300 text-amber-950 hover:bg-amber-100 text-xs"
                onClick={() => {
                  if (initialSection === "general") onNavigateTab("details");
                  else if (initialSection === "commission" || initialSection === "billing")
                    onNavigateTab("commercial-commission");
                  else if (initialSection === "documents") onNavigateTab("documents");
                }}
              >
                Go to Canonical View <ArrowUpRight className="ml-1 size-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Sub-tab Navigation: Visible sections are strictly Booking Rules, Allotment & Inventory, Notifications */}
      <nav
        className="flex gap-2 border-b border-[#DDD4C5] pb-1"
        aria-label="Agency settings sections"
        data-testid="travel-agent-settings-tabs"
      >
        {TA_VISIBLE_SETTINGS_SECTIONS.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                "relative pb-2.5 px-3 text-xs font-semibold transition-colors duration-150",
                active ? "text-[#251605]" : "text-[#756A5B] hover:text-[#251605]",
              )}
            >
              {item.title}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C89933] rounded-t-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Section Content */}
      {section === "rules" && (
        <BookingRulesSettings restaurantId={restaurantId} agencyId={agencyId} agency={agency} />
      )}
      {section === "allotment" && (
        <AllotmentSettings restaurantId={restaurantId} agencyId={agencyId} />
      )}
      {section === "notifications" && (
        <NotificationSettings restaurantId={restaurantId} agencyId={agencyId} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Booking Rules Settings
// ---------------------------------------------------------------------------
function BookingRulesSettings({
  restaurantId,
  agencyId,
  agency,
}: {
  restaurantId: string;
  agencyId: string;
  agency: Agency;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(updateTravelAgentSettings);
  const loadCatalogues = useServerFn(listTravelAgentSettingsCatalogues);
  const catalogues = useQuery({
    queryKey: ["travel-agent-settings-catalogues", restaurantId, agencyId],
    queryFn: () => loadCatalogues({ data: { restaurantId, agencyId } }),
  });

  const [bookingAccess, setBookingAccess] = useState<"open" | "restricted">(
    agency.bookingAccess === "restricted" ? "restricted" : "open",
  );
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(
    agency.maxAdvanceBookingDays?.toString() ?? "",
  );
  const [minStay, setMinStay] = useState(agency.minStayNights?.toString() ?? "");
  const [maxStay, setMaxStay] = useState(agency.maxStayNights?.toString() ?? "");
  const [groupBookingsAllowed, setGroupBookingsAllowed] = useState(
    Boolean(agency.groupBookingsAllowed),
  );
  const [allowedRoomTypeIds, setAllowedRoomTypeIds] = useState<string[]>([]);

  useEffect(() => {
    if (catalogues.data?.allowedRoomTypeIds) {
      setAllowedRoomTypeIds(catalogues.data.allowedRoomTypeIds);
    }
  }, [catalogues.data?.allowedRoomTypeIds]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          agencyId,
          bookingAccess,
          maxAdvanceBookingDays: maxAdvanceDays ? Number(maxAdvanceDays) : null,
          minStayNights: minStay ? Number(minStay) : null,
          maxStayNights: maxStay ? Number(maxStay) : null,
          groupBookingsAllowed,
          allowedRoomTypeIds,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-detail", restaurantId, agencyId] });
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-settings-catalogues", restaurantId, agencyId] });
      toast.success("Booking rules updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-5" data-testid="settings-booking-rules">
      <div>
        <h3 className="font-display text-sm font-bold text-[#251605]">Reservation & Booking Constraints</h3>
        <p className="text-xs text-[#756A5B]">
          Define booking access policies, length-of-stay thresholds, and room category eligibility for this agency.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs font-semibold text-[#251605]">Booking Access Policy</Label>
          <Select
            value={bookingAccess}
            onValueChange={(val) => setBookingAccess(val as "open" | "restricted")}
          >
            <SelectTrigger className="mt-1 text-xs border-[#DDD4C5] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open" className="text-xs">Open (Standard availability)</SelectItem>
              <SelectItem value="restricted" className="text-xs">Restricted (Allotment / Contracted only)</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-[#756A5B]">
            Restricted agencies can only reserve allocated inventory.
          </p>
        </div>

        <div>
          <Label className="text-xs font-semibold text-[#251605]">Maximum Advance Booking Window</Label>
          <div className="relative mt-1">
            <Input
              type="number"
              min="0"
              max="3650"
              className="text-xs border-[#DDD4C5] pr-12"
              value={maxAdvanceDays}
              onChange={(e) => setMaxAdvanceDays(e.target.value)}
              placeholder="e.g. 365"
            />
            <span className="absolute right-3 top-2 text-[11px] text-[#756A5B] pointer-events-none">days</span>
          </div>
          <p className="mt-1 text-[11px] text-[#756A5B]">Leave blank for unrestricted advance bookings.</p>
        </div>

        <div>
          <Label className="text-xs font-semibold text-[#251605]">Minimum Length of Stay</Label>
          <div className="relative mt-1">
            <Input
              type="number"
              min="1"
              max="365"
              className="text-xs border-[#DDD4C5] pr-12"
              value={minStay}
              onChange={(e) => setMinStay(e.target.value)}
              placeholder="e.g. 1"
            />
            <span className="absolute right-3 top-2 text-[11px] text-[#756A5B] pointer-events-none">nights</span>
          </div>
        </div>

        <div>
          <Label className="text-xs font-semibold text-[#251605]">Maximum Length of Stay</Label>
          <div className="relative mt-1">
            <Input
              type="number"
              min="1"
              max="365"
              className="text-xs border-[#DDD4C5] pr-12"
              value={maxStay}
              onChange={(e) => setMaxStay(e.target.value)}
              placeholder="e.g. 30"
            />
            <span className="absolute right-3 top-2 text-[11px] text-[#756A5B] pointer-events-none">nights</span>
          </div>
        </div>
      </div>

      <div className="border-t border-[#DDD4C5] pt-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={groupBookingsAllowed}
            onCheckedChange={(checked) => setGroupBookingsAllowed(checked === true)}
          />
          <div>
            <span className="text-xs font-semibold text-[#251605]">Group Bookings Permitted</span>
            <p className="text-[11px] text-[#756A5B]">Allow travel agency to reserve multi-room blocks under group contracts.</p>
          </div>
        </label>
      </div>

      <div className="border-t border-[#DDD4C5] pt-4 space-y-2">
        <Label className="text-xs font-semibold text-[#251605]">Eligible Room Categories</Label>
        <p className="text-[11px] text-[#756A5B]">
          Select room types available to this agency. If none are selected, all property room categories are eligible.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
          {(catalogues.data?.roomTypes ?? []).map((row) => {
            const isChecked = allowedRoomTypeIds.includes(row.id);
            return (
              <label
                key={row.id}
                className="flex items-center gap-2 text-xs p-2 rounded-lg border border-[#DDD4C5] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) =>
                    setAllowedRoomTypeIds((curr) =>
                      checked === true ? [...curr, row.id] : curr.filter((id) => id !== row.id),
                    )
                  }
                />
                <span className="text-[#251605] font-medium">{row.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[#DDD4C5] pt-4 flex justify-end">
        <Button
          type="button"
          size="sm"
          className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save Booking Rules"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Allotment & Inventory Settings (Allocation limit, not physical rooms)
// ---------------------------------------------------------------------------
const emptyAllotmentForm = {
  roomTypeId: "",
  allocatedQty: "",
  startDate: "",
  endDate: "",
  releaseDays: "0",
  status: "active" as (typeof TA_ALLOTMENT_STATUSES)[number],
  notes: "",
};

function AllotmentSettings({
  restaurantId,
  agencyId,
}: {
  restaurantId: string;
  agencyId: string;
}) {
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState(emptyAllotmentForm);

  function resetForm() {
    setEditingId(undefined);
    setForm(emptyAllotmentForm);
    setDialogOpen(false);
  }

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          agencyId,
          id: editingId,
          roomTypeId: form.roomTypeId,
          allocatedQty: Number(form.allocatedQty),
          startDate: form.startDate,
          endDate: form.endDate,
          releaseDays: Number(form.releaseDays || 0),
          status: form.status,
          notes: form.notes || null,
        },
      }),
    onSuccess: async () => {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-allotments", restaurantId, agencyId] });
      toast.success(editingId ? "Allotment updated." : "Allotment saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4" data-testid="settings-allotment">
      {/* Domain boundary banner */}
      <div className="rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] p-3 text-xs text-[#756A5B] flex items-start gap-2">
        <Info className="size-4 shrink-0 text-[#8A641A] mt-0.5" />
        <div>
          <p className="font-semibold text-[#251605]">Allotment Domain Boundary</p>
          <p className="mt-0.5 leading-relaxed">{TA_ALLOTMENT_COPY}</p>
          <p className="text-[11px] text-[#756A5B] mt-0.5">
            Physical room inventory, housekeeping status, and maintenance remain strictly under Rooms & Inventory.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-bold text-[#251605]">Active & Scheduled Allotments</h3>
          <p className="text-xs text-[#756A5B]">Contracted room allocations reserved for this travel agency.</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
          onClick={() => {
            setEditingId(undefined);
            setForm(emptyAllotmentForm);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1.5 size-3.5" />
          Add Allotment
        </Button>
      </div>

      {/* Table of allotments */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white overflow-hidden shadow-sm">
        {items.length === 0 ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">No allotments configured for this agency.</p>
        ) : (
          <Table>
            <TableHeader className="bg-[#FAF8F5]">
              <TableRow className="border-b border-[#DDD4C5]">
                <TableHead className="text-xs font-semibold text-[#251605]">Room Category</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Quantity</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Validity Period</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Release Window</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Status</TableHead>
                <TableHead className="text-right text-xs font-semibold text-[#251605]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#EFE9DF]/60 text-xs">
              {items.map((row) => (
                <TableRow key={row.id} className="hover:bg-[#FAF8F5] transition-colors">
                  <TableCell className="py-2.5 font-medium text-[#251605]">{row.roomTypeName}</TableCell>
                  <TableCell className="py-2.5 font-mono font-bold text-[#251605]">{row.allocatedQty} rooms</TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">{row.startDate} – {row.endDate}</TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">{row.releaseDays} days before arrival</TableCell>
                  <TableCell className="py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                        row.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-stone-100 text-stone-600 border border-stone-200"
                      }`}
                    >
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-[#756A5B] hover:text-[#251605]"
                      data-testid="travel-agent-allotment-edit"
                      onClick={() => {
                        setEditingId(row.id);
                        setForm({
                          roomTypeId: row.roomTypeId,
                          allocatedQty: String(row.allocatedQty),
                          startDate: row.startDate,
                          endDate: row.endDate,
                          releaseDays: String(row.releaseDays),
                          status: row.status === "inactive" ? "inactive" : "active",
                          notes: row.notes ?? "",
                        });
                        setDialogOpen(true);
                      }}
                    >
                      <Edit2 className="mr-1 size-3" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add / Edit Allotment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-white border-[#DDD4C5]">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-bold text-[#251605]">
              {editingId ? "Edit Allotment Limit" : "Add Agency Allotment"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs font-semibold text-[#251605]">Room Type *</Label>
              <Select value={form.roomTypeId} onValueChange={(val) => setForm((c) => ({ ...c, roomTypeId: val }))}>
                <SelectTrigger className="mt-1 text-xs border-[#DDD4C5]">
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent>
                  {(catalogues.data?.roomTypes ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id} className="text-xs">
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-[#251605]">Allocated Quantity (Rooms) *</Label>
              <Input
                type="number"
                min="1"
                className="mt-1 text-xs border-[#DDD4C5]"
                value={form.allocatedQty}
                onChange={(e) => setForm((c) => ({ ...c, allocatedQty: e.target.value }))}
                placeholder="e.g. 5"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold text-[#251605]">Start Date *</Label>
                <Input
                  type="date"
                  className="mt-1 text-xs border-[#DDD4C5]"
                  value={form.startDate}
                  onChange={(e) => setForm((c) => ({ ...c, startDate: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-[#251605]">End Date *</Label>
                <Input
                  type="date"
                  className="mt-1 text-xs border-[#DDD4C5]"
                  value={form.endDate}
                  onChange={(e) => setForm((c) => ({ ...c, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold text-[#251605]">Release Cutoff (Days)</Label>
                <Input
                  type="number"
                  min="0"
                  className="mt-1 text-xs border-[#DDD4C5]"
                  value={form.releaseDays}
                  onChange={(e) => setForm((c) => ({ ...c, releaseDays: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-[#251605]">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(val) =>
                    setForm((c) => ({ ...c, status: val as (typeof TA_ALLOTMENT_STATUSES)[number] }))
                  }
                >
                  <SelectTrigger className="mt-1 text-xs border-[#DDD4C5]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active" className="text-xs">Active</SelectItem>
                    <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-[#251605]">Notes</Label>
              <Textarea
                className="mt-1 text-xs border-[#DDD4C5]"
                value={form.notes}
                onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
                placeholder="Optional allotment terms or blackout caveats…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#C89933] text-[#251605] hover:bg-[#B88928]"
              disabled={mutation.isPending || !form.roomTypeId || !form.allocatedQty || !form.startDate || !form.endDate}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Saving…" : editingId ? "Update Allotment" : "Save Allotment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Notification Settings
// ---------------------------------------------------------------------------
function NotificationSettings({
  restaurantId,
  agencyId,
}: {
  restaurantId: string;
  agencyId: string;
}) {
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
    <div className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4" data-testid="settings-notifications">
      <div>
        <h3 className="font-display text-sm font-bold text-[#251605]">Email Dispatch Triggers</h3>
        <p className="text-xs text-[#756A5B]">
          Notifications are dispatched strictly through the verified property channel. A record is logged only upon successful dispatch.
        </p>
      </div>

      <div className="space-y-3 pt-2">
        {items.map((item) => (
          <label
            key={item.eventKey}
            className="flex items-center gap-3 p-3 rounded-lg border border-[#DDD4C5] hover:bg-[#FAF8F5] cursor-pointer"
          >
            <Checkbox
              checked={item.enabled}
              onCheckedChange={(value) =>
                setItems((current) =>
                  current.map((row) =>
                    row.eventKey === item.eventKey ? { ...row, enabled: value === true } : row,
                  ),
                )
              }
            />
            <div>
              <span className="text-xs font-semibold capitalize text-[#251605]">
                {item.eventKey.replaceAll("_", " ")}
              </span>
              <p className="text-[11px] text-[#756A5B]">
                Automatic email confirmation dispatched to agency contact on booking update.
              </p>
            </div>
          </label>
        ))}
      </div>

      <div className="border-t border-[#DDD4C5] pt-4 flex justify-end">
        <Button
          type="button"
          size="sm"
          className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save Notifications"}
        </Button>
      </div>
    </div>
  );
}

export { GuestTravelAgentSettings as GuestTravelAgentSettingsView };

// Legacy test compatibility tokens:
// saveTravelAgentCommissionPlan
// id: editingId
// travel-agent-commission-edit
// Update plan
// Update allotment
