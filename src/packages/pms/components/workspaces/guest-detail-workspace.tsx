import { useEffect, useId, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Power, StickyNote } from "lucide-react";

import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { StatusBadge, VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  addGuestNote,
  getGuest,
  getGuestsAccess,
  saveGuestPreferences,
  setGuestStatus,
  setGuestVip,
  type GuestPreferences,
} from "@/packages/pms/lib/guests.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useRestaurantTime } from "@/core/state/restaurant-context";

const EVENT_LABEL: Record<string, string> = {
  created: "Guest created",
  profile_updated: "Profile updated",
  vip_changed: "VIP status changed",
  status_changed: "Guest status changed",
  preference_updated: "Preferences updated",
  note_added: "Note added",
};

export function GuestDetailWorkspace({
  membership,
  guestId,
  backTo = "guests",
}: {
  membership: RestaurantMembership;
  guestId: string;
  backTo?: "guests" | "reservations";
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const goBack = () => {
    if (backTo === "reservations") void navigate({ to: "/restaurant/pms/reservations" });
    else void navigate({ to: "/restaurant/guests" });
  };
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchGuest = useServerFn(getGuest);
  const savePrefs = useServerFn(saveGuestPreferences);
  const toggleVip = useServerFn(setGuestVip);
  const changeStatus = useServerFn(setGuestStatus);
  const addNote = useServerFn(addGuestNote);

  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [prefs, setPrefs] = useState<GuestPreferences | null>(null);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId } }),
    enabled: canManage,
    retry: false,
  });

  useEffect(() => {
    if (guestQuery.data) setPrefs(guestQuery.data.preferences);
  }, [guestQuery.data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
    void queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] });
  }

  const vipMutation = useMutation({
    mutationFn: (vip: boolean) => toggleVip({ data: { restaurantId, guestId, vip } }),
    onSuccess: () => {
      toast.success("VIP status updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      changeStatus({ data: { restaurantId, guestId, status } }),
    onSuccess: () => {
      toast.success("Guest status updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const prefsMutation = useMutation({
    mutationFn: () => savePrefs({ data: { restaurantId, guestId, preferences: prefs ?? {} } }),
    onSuccess: () => {
      toast.success("Preferences saved.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteMutation = useMutation({
    mutationFn: () => addNote({ data: { restaurantId, guestId, note } }),
    onSuccess: () => {
      toast.success("Note added to history.");
      setNote("");
      setNoteOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (accessQuery.isLoading || guestQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading guest…</p>;
  }
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Front Office</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access guest profiles for this property.
        </p>
      </div>
    );
  }
  if (guestQuery.isError || !guestQuery.data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">That guest could not be found for this property.</p>
        <Button className="mt-4" variant="outline" onClick={() => goBack()}>
          Back to guests
        </Button>
      </div>
    );
  }

  const { guest, history } = guestQuery.data;

  function setPref<K extends keyof GuestPreferences>(key: K, value: string) {
    setPrefs((prev) => ({ ...(prev ?? ({} as GuestPreferences)), [key]: value }));
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => goBack()}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {backTo === "reservations" ? "Reservations" : "Guests"}
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="font-display text-2xl">{guest.fullName}</h1>
          <div className="flex items-center gap-2">
            {guest.vipStatus ? <VipBadge /> : null}
            <StatusBadge status={guest.guestStatus} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button variant="outline" onClick={() => setNoteOpen(true)}>
            <StickyNote className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Add note</span>
          </Button>
          <Button
            variant="outline"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate(guest.guestStatus === "active" ? "inactive" : "active")}
          >
            <Power className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {guest.guestStatus === "active" ? "Deactivate" : "Reactivate"}
            </span>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Contact">
              <Row label="Phone" value={guest.phone} />
              <Row label="Email" value={guest.email} />
              <Row label="Language" value={guest.language} />
              <Row label="Nationality" value={guest.nationality} />
              <Row label="Date of birth" value={guest.dateOfBirth} />
            </Panel>
            <Panel title="Address">
              <Row label="Address line 1" value={guest.addressLine1} />
              <Row label="Address line 2" value={guest.addressLine2} />
              <Row label="City" value={guest.city} />
              <Row label="Region" value={guest.region} />
              <Row label="Country" value={guest.country} />
              <Row label="Postal code" value={guest.postalCode} />
            </Panel>
          </div>
          <Panel title="Notes">
            <p className="text-sm text-muted-foreground">{guest.notes ?? "No notes yet."}</p>
          </Panel>
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4">
            <div>
              <p className="font-medium">VIP guest</p>
              <p className="text-sm text-muted-foreground">Flag this guest for priority service.</p>
            </div>
            <Switch
              checked={guest.vipStatus}
              disabled={vipMutation.isPending}
              onCheckedChange={(v) => vipMutation.mutate(v)}
            />
          </div>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <PrefField label="Room preference" value={prefs?.roomPreference} onChange={(v) => setPref("roomPreference", v)} />
              <PrefField label="Bed preference" value={prefs?.bedPreference} onChange={(v) => setPref("bedPreference", v)} />
              <PrefField label="Floor preference" value={prefs?.floorPreference} onChange={(v) => setPref("floorPreference", v)} />
              <PrefField label="View preference" value={prefs?.viewPreference} onChange={(v) => setPref("viewPreference", v)} />
              <PrefField label="Food preference" value={prefs?.foodPreference} onChange={(v) => setPref("foodPreference", v)} />
              <PrefField
                label="Communication preference"
                value={prefs?.communicationPreference}
                onChange={(v) => setPref("communicationPreference", v)}
              />
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="guest-accessibility">Accessibility requirements</Label>
                <Textarea
                  id="guest-accessibility"
                  rows={2}
                  value={prefs?.accessibilityRequirements ?? ""}
                  onChange={(e) => setPref("accessibilityRequirements", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="guest-special-requests">Special requests</Label>
                <Textarea
                  id="guest-special-requests"
                  rows={3}
                  value={prefs?.specialRequests ?? ""}
                  onChange={(e) => setPref("specialRequests", e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => prefsMutation.mutate()} disabled={prefsMutation.isPending}>
                {prefsMutation.isPending ? "Saving…" : "Save preferences"}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{EVENT_LABEL[h.eventType] ?? h.eventType}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(h.createdAt)}</p>
                  </div>
                  {h.actorName ? (
                    <p className="mt-1 text-xs text-muted-foreground">by {h.actorName}</p>
                  ) : null}
                  {h.notes ? <p className="mt-2 text-sm">{h.notes}</p> : null}
                  {h.newValues ? (
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {Object.keys(h.newValues).map((key) => (
                        <li key={key}>
                          <span className="font-medium">{key.replace(/_/g, " ")}</span>:{" "}
                          {formatValue(h.previousValues?.[key])} → {formatValue(h.newValues?.[key])}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>

      <GuestFormDialog
        restaurantId={restaurantId}
        open={editOpen}
        onOpenChange={setEditOpen}
        guest={guest}
        onSaved={() => refresh()}
      />

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
          </DialogHeader>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => noteMutation.mutate()}
              disabled={noteMutation.isPending || note.trim() === ""}
            >
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="font-display text-lg">{title}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );
}

function PrefField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
