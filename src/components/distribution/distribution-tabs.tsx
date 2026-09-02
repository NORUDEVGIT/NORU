import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/bookings/reservation-bits";
import { cn } from "@/lib/utils";
import {
  getDistributionOverview,
  saveDirectBookingSettings,
  saveRateMapping,
  saveRoomMapping,
  setChannelStatus,
} from "@/lib/distribution.functions";

export function useDistribution(restaurantId: string) {
  const fetchOverview = useServerFn(getDistributionOverview);
  return useQuery({
    queryKey: ["distribution", restaurantId],
    queryFn: () => fetchOverview({ data: { restaurantId } }),
  });
}

type Overview = NonNullable<ReturnType<typeof useDistribution>["data"]>;

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-success",
    inactive: "bg-muted text-muted-foreground",
    not_connected: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  };
  const label = status === "not_connected" ? "Not Connected" : status === "active" ? "Active" : "Inactive";
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", map[status] ?? "bg-muted")}>{label}</span>
  );
}

/* ---------------------------------------------------------------- overview */

export function DistributionOverviewTab({ data }: { data: Overview }) {
  const direct = data.channels.find((c) => c.code === "DIRECT");
  const bookingUrl =
    typeof window !== "undefined" && data.settings.slug
      ? `${window.location.origin}/stay/${data.settings.slug}`
      : `/stay/${data.settings.slug}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Channels" value={data.channels.length} />
        <StatCard label="Direct bookings" value={data.directBookings} hint="Reservations from your booking page" />
        <StatCard
          label="Direct booking"
          value={data.settings.enabled ? "On" : "Off"}
          hint={direct ? `Channel ${direct.status === "active" ? "active" : direct.status}` : undefined}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Your public booking page</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Share this link so guests can book rooms directly, with no commission.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={bookingUrl} className="font-mono text-xs" />
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(bookingUrl);
              toast.success("Booking link copied");
            }}
          >
            Copy link
          </Button>
          <Button asChild>
            <a href={bookingUrl} target="_blank" rel="noreferrer">
              Open page
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- channels */

export function DistributionChannelsTab({ data, restaurantId }: { data: Overview; restaurantId: string }) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveDirectBookingSettings);
  const setStatus = useServerFn(setChannelStatus);

  const [enabled, setEnabled] = useState(data.settings.enabled);
  const [email, setEmail] = useState(data.settings.contactEmail ?? "");
  const [phone, setPhone] = useState(data.settings.contactPhone ?? "");
  const [message, setMessage] = useState(data.settings.bookingMessage ?? "");

  useEffect(() => {
    setEnabled(data.settings.enabled);
    setEmail(data.settings.contactEmail ?? "");
    setPhone(data.settings.contactPhone ?? "");
    setMessage(data.settings.bookingMessage ?? "");
  }, [data.settings]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["distribution", restaurantId] });

  const settingsMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          enabled,
          contactEmail: email,
          contactPhone: phone,
          bookingMessage: message,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Direct booking settings saved");
      void invalidate();
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: { channelId: string; status: "active" | "inactive" }) =>
      setStatus({ data: { restaurantId, ...input } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      void invalidate();
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Direct booking settings</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Accept direct bookings</p>
              <p className="text-xs text-muted-foreground">Turning this off hides your public booking page.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div>
            <Label htmlFor="booking-email">Booking contact email</Label>
            <Input id="booking-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="booking-phone">Booking contact phone</Label>
            <Input id="booking-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="booking-message">Message shown to guests</Label>
            <Textarea
              id="booking-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}>
            Save settings
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Channels</h2>
        <div className="mt-3 space-y-2">
          {data.channels.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.code} · {c.channelType === "direct" ? "Direct" : "OTA"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={c.status} />
                {c.channelType === "direct" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({
                        channelId: c.id,
                        status: c.status === "active" ? "inactive" : "active",
                      })
                    }
                  >
                    {c.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {data.channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channels yet.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- mappings */

function MappingRow({
  label,
  mapped,
  code,
  onSave,
  pending,
}: {
  label: string;
  mapped: boolean;
  code: string | null;
  onSave: (code: string, active: boolean) => void;
  pending: boolean;
}) {
  const [value, setValue] = useState(code ?? "");
  useEffect(() => setValue(code ?? ""), [code]);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
      <p className="min-w-40 flex-1 text-sm font-medium">{label}</p>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="External code (optional)"
        className="w-56"
      />
      <span className="text-xs text-muted-foreground">{mapped ? "Mapped" : "Not mapped"}</span>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => onSave(value, true)}>
        Save
      </Button>
    </div>
  );
}

export function RoomMappingTab({ data, restaurantId }: { data: Overview; restaurantId: string }) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveRoomMapping);
  const channel = useMemo(() => data.channels.find((c) => c.code === "DIRECT") ?? data.channels[0], [data.channels]);

  const mutation = useMutation({
    mutationFn: (input: { roomTypeId: string; externalCode: string; active: boolean }) =>
      save({ data: { restaurantId, channelId: channel!.id, ...input } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Mapping saved");
      void queryClient.invalidateQueries({ queryKey: ["distribution", restaurantId] });
    },
  });

  if (!channel) return <p className="text-sm text-muted-foreground">Add a channel first.</p>;

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Room type mapping — {channel.name}</h2>
      {data.roomTypes.map((t) => {
        const mapping = data.roomMappings.find((m) => m.channelId === channel.id && m.roomTypeId === t.id);
        return (
          <MappingRow
            key={t.id}
            label={t.name}
            mapped={!!mapping}
            code={mapping?.externalCode ?? null}
            pending={mutation.isPending}
            onSave={(externalCode, active) => mutation.mutate({ roomTypeId: t.id, externalCode, active })}
          />
        );
      })}
      {data.roomTypes.length === 0 ? <p className="text-sm text-muted-foreground">No room types yet.</p> : null}
    </div>
  );
}

export function RateMappingTab({ data, restaurantId }: { data: Overview; restaurantId: string }) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveRateMapping);
  const channel = useMemo(() => data.channels.find((c) => c.code === "DIRECT") ?? data.channels[0], [data.channels]);

  const mutation = useMutation({
    mutationFn: (input: { ratePlanId: string; externalCode: string; active: boolean }) =>
      save({ data: { restaurantId, channelId: channel!.id, ...input } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Mapping saved");
      void queryClient.invalidateQueries({ queryKey: ["distribution", restaurantId] });
    },
  });

  if (!channel) return <p className="text-sm text-muted-foreground">Add a channel first.</p>;

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Rate plan mapping — {channel.name}</h2>
      {data.ratePlans.map((p) => {
        const mapping = data.rateMappings.find((m) => m.channelId === channel.id && m.ratePlanId === p.id);
        return (
          <MappingRow
            key={p.id}
            label={p.name}
            mapped={!!mapping}
            code={mapping?.externalCode ?? null}
            pending={mutation.isPending}
            onSave={(externalCode, active) => mutation.mutate({ ratePlanId: p.id, externalCode, active })}
          />
        );
      })}
      {data.ratePlans.length === 0 ? <p className="text-sm text-muted-foreground">No rate plans yet.</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- logs */

export function DistributionLogsTab({ data }: { data: Overview }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Activity log</h2>
      <div className="mt-3 space-y-2">
        {data.logs.map((l) => (
          <div key={l.id} className="rounded-xl border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{l.eventType.replace(/_/g, " ")}</p>
              <span className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{l.message ?? "—"}</p>
          </div>
        ))}
        {data.logs.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : null}
      </div>
    </div>
  );
}
