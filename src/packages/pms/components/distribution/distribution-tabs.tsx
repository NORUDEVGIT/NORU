import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  NoruStatusChip,
  SettingsEmptyState,
  type NoruStatusTone,
} from "@/packages/pms/components/settings/pms-card6-integration-bits";
import {
  getDistributionOverview,
  saveDirectBookingSettings,
  saveRateMapping,
  saveRoomMapping,
  setChannelStatus,
} from "@/packages/pms/lib/distribution.functions";

export function useDistribution(restaurantId: string) {
  const fetchOverview = useServerFn(getDistributionOverview);
  return useQuery({
    queryKey: ["distribution", restaurantId],
    queryFn: () => fetchOverview({ data: { restaurantId } }),
  });
}

type Overview = NonNullable<ReturnType<typeof useDistribution>["data"]>;

function channelTone(status: string): NoruStatusTone {
  if (status === "active") return "connected";
  if (status === "inactive") return "disabled";
  return "pending";
}

function logTone(status: string): NoruStatusTone {
  const value = status.toLowerCase();
  if (/(fail|error)/.test(value)) return "error";
  if (/(disabled|inactive|cancel)/.test(value)) return "disabled";
  if (/(ok|success|active|pass|info)/.test(value)) return "connected";
  return "pending";
}

function formatStaffTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CompactKpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <article className="rounded-xl border border-[#E6E1D8] bg-white px-3 py-2">
      <p className="text-[11px] text-[#7A6A55]">{label}</p>
      <p className="font-display text-lg leading-tight text-[#251605]">{value}</p>
      {hint ? <p className="text-[11px] text-[#7A6A55]">{hint}</p> : null}
    </article>
  );
}

/* ---------------------------------------------------------------- overview */

export function DistributionOverviewTab({ data }: { data: Overview }) {
  const direct = data.channels.find((c) => c.code === "DIRECT");
  const bookingUrl =
    typeof window !== "undefined" && data.settings.slug
      ? `${window.location.origin}/stay/${data.settings.slug}`
      : `/stay/${data.settings.slug}`;

  const connected = data.channels.filter((channel) => channel.status === "active").length;
  const activeMappings = [...data.roomMappings, ...data.rateMappings].filter(
    (row) => row.active && row.externalCode?.trim(),
  ).length;
  const syncFailed = data.logs.some((row) => logTone(row.status) === "error");
  const syncTone: NoruStatusTone =
    data.logs.length === 0 ? "pending" : syncFailed ? "error" : "connected";
  const noActivity =
    data.channels.length === 0 &&
    data.logs.length === 0 &&
    data.directBookings === 0 &&
    activeMappings === 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <CompactKpi
          label="Connected channels"
          value={connected}
          hint={`${data.channels.length} total`}
        />
        <CompactKpi label="Active mappings" value={activeMappings} />
        <CompactKpi
          label="Direct booking"
          value={data.settings.enabled ? "On" : "Off"}
          hint={
            direct
              ? `${data.directBookings} booking${data.directBookings === 1 ? "" : "s"}`
              : undefined
          }
        />
        <article className="rounded-xl border border-[#E6E1D8] bg-white px-3 py-2">
          <p className="text-[11px] text-[#7A6A55]">Sync health</p>
          <div className="mt-1">
            <NoruStatusChip tone={syncTone} />
          </div>
        </article>
      </div>

      {noActivity ? (
        <SettingsEmptyState
          title="No distribution activity yet"
          body="Connected channels, mappings and sync events will appear here."
        />
      ) : null}

      <div className="rounded-xl border border-[#E6E1D8] bg-white p-3">
        <h2 className="text-sm font-semibold text-[#251605]">Your public booking page</h2>
        <p className="mt-0.5 text-xs text-[#7A6A55]">
          Share this link so guests can book rooms directly, with no commission.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
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
          <Button asChild className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90">
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

export function DistributionChannelsTab({
  data,
  restaurantId,
  omitChannelList = false,
}: {
  data: Overview;
  restaurantId: string;
  omitChannelList?: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveDirectBookingSettings);

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

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#E6E1D8] bg-white p-3">
        <h2 className="text-sm font-semibold text-[#251605]">Direct booking settings</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E6E1D8] px-3 py-2 sm:col-span-2">
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
              rows={2}
              className="min-h-0"
              maxLength={500}
            />
          </div>
        </div>
        <div className="mt-3">
          <Button
            size="sm"
            onClick={() => settingsMutation.mutate()}
            disabled={settingsMutation.isPending}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            Save settings
          </Button>
        </div>
      </div>

      {omitChannelList ? null : (
        <DistributionChannelTable data={data} restaurantId={restaurantId} />
      )}
    </div>
  );
}

export function DistributionChannelTable({
  data,
  restaurantId,
}: {
  data: Overview;
  restaurantId: string;
}) {
  const queryClient = useQueryClient();
  const setStatus = useServerFn(setChannelStatus);
  const statusMutation = useMutation({
    mutationFn: (input: { channelId: string; status: "active" | "inactive" }) =>
      setStatus({ data: { restaurantId, ...input } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["distribution", restaurantId] });
    },
  });

  if (data.channels.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-[#E6E1D8]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Channel</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.channels.map((channel) => (
            <TableRow key={channel.id}>
              <TableCell>
                <p className="text-sm font-medium text-[#251605]">{channel.name}</p>
                <p className="text-xs text-[#7A6A55]">{channel.code}</p>
              </TableCell>
              <TableCell className="text-sm text-[#5C5346]">
                {channel.channelType === "direct" ? "Direct" : "OTA"}
              </TableCell>
              <TableCell>
                <NoruStatusChip tone={channelTone(channel.status)} />
              </TableCell>
              <TableCell>
                {channel.channelType === "direct" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`${channel.name} actions`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={statusMutation.isPending}
                        onSelect={() =>
                          statusMutation.mutate({
                            channelId: channel.id,
                            status: channel.status === "active" ? "inactive" : "active",
                          })
                        }
                      >
                        {channel.status === "active" ? "Deactivate" : "Activate"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
  const saved = code ?? "";
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const dirty = value !== saved;
  return (
    <TableRow>
      <TableCell className="text-sm font-medium text-[#251605]">{label}</TableCell>
      <TableCell>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="External code"
          className="h-8 max-w-56"
        />
      </TableCell>
      <TableCell>
        <NoruStatusChip tone={mapped ? "mapped" : "not_mapped"} />
      </TableCell>
      <TableCell>
        {dirty ? (
          <Button
            size="sm"
            disabled={pending}
            className="h-8 bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => onSave(value, true)}
          >
            Save
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function MappingTable({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E6E1D8] bg-white">
      <div className="border-b border-[#E6E1D8] px-3 py-2">
        <h2 className="text-sm font-semibold text-[#251605]">{title}</h2>
      </div>
      {empty ? (
        <div className="p-3">
          <SettingsEmptyState title={empty} body="Add them in Rooms & Inventory or Rates, then map them here." />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NORU item</TableHead>
              <TableHead>External code</TableHead>
              <TableHead>Mapping status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{children}</TableBody>
        </Table>
      )}
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

  if (!channel) {
    return <SettingsEmptyState title="Add a channel first" body="Room mappings need a distribution channel." />;
  }

  return (
    <MappingTable
      title={`Room type mapping — ${channel.name}`}
      empty={data.roomTypes.length === 0 ? "No room types yet" : null}
    >
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
    </MappingTable>
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

  if (!channel) {
    return <SettingsEmptyState title="Add a channel first" body="Rate mappings need a distribution channel." />;
  }

  return (
    <MappingTable
      title={`Rate plan mapping — ${channel.name}`}
      empty={data.ratePlans.length === 0 ? "No rate plans yet" : null}
    >
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
    </MappingTable>
  );
}

/* -------------------------------------------------------------------- logs */

export function DistributionLogsTab({ data }: { data: Overview }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E6E1D8] bg-white">
      <div className="border-b border-[#E6E1D8] px-3 py-2">
        <h2 className="text-sm font-semibold text-[#251605]">Activity log</h2>
      </div>
      {data.logs.length === 0 ? (
        <div className="p-3">
          <SettingsEmptyState
            title="No activity yet"
            body="Channel changes, mapping saves and sync events will be listed here."
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.logs.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs text-[#5C5346]">
                  {formatStaffTime(row.createdAt)}
                </TableCell>
                <TableCell className="text-sm text-[#251605]">
                  {row.eventType.replace(/_/g, " ")}
                </TableCell>
                <TableCell className="text-sm text-[#7A6A55]">—</TableCell>
                <TableCell>
                  <NoruStatusChip tone={logTone(row.status)} />
                </TableCell>
                <TableCell className="max-w-[16rem] truncate text-xs text-[#5C5346]">
                  {row.message ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
