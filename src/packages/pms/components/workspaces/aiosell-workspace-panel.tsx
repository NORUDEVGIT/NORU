import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  getAiosellWorkspace,
  runAiosellReconciliation,
  saveAiosellConnection,
  saveAiosellRateMapping,
  saveAiosellRoomMapping,
  setAiosellRateMappingState,
  setAiosellRoomMappingState,
  activateAiosellBookingComChannel,
  validateAiosellConnection,
} from "@/packages/pms/lib/aiosell-workspace.functions";
import {
  AIOSELL_STALE_FETCH_WARNING,
  AIOSELL_WINDOW_COPY,
} from "@/packages/pms/lib/distribution/aiosell-workspace";

type Environment = "sandbox" | "production";

const cardClass = "rounded-xl border border-[#E6E1D8] bg-white p-3";

function formatStaffTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function aiosellTone(value: string): NoruStatusTone {
  const tone = value.toLowerCase();
  if (tone.includes("error") || tone.includes("fail") || tone === "attention") return "error";
  if (tone === "not_ready" || tone === "not_configured" || tone === "missing" || tone === "never") {
    return "pending";
  }
  if (tone === "inactive" || tone === "disabled") return "disabled";
  if (/(ready|active|connected|configured|success|enabled)/.test(tone)) return "connected";
  return "pending";
}

function AiosellRateEditor({
  rate,
  onSave,
  onToggle,
}: {
  rate: {
    ratePlanId: string;
    name: string;
    roomTypeName: string;
    roomCode: string;
    rateplanCode: string;
    active: boolean;
    error: string | null;
  };
  onSave: (roomCode: string, rateplanCode: string) => void;
  onToggle: () => void;
}) {
  const [roomCode, setRoomCode] = useState(rate.roomCode);
  const [rateplanCode, setRateplanCode] = useState(rate.rateplanCode);
  useEffect(() => {
    setRoomCode(rate.roomCode);
    setRateplanCode(rate.rateplanCode);
  }, [rate.roomCode, rate.rateplanCode]);
  const dirty = roomCode !== rate.roomCode || rateplanCode !== rate.rateplanCode;
  const tone: NoruStatusTone = rate.error
    ? "error"
    : rate.rateplanCode
      ? rate.active
        ? "mapped"
        : "disabled"
      : "not_mapped";
  return (
    <TableRow>
      <TableCell className="text-sm text-[#251605]">
        <p className="font-medium">{rate.name}</p>
        <p className="text-xs text-[#7A6A55]">{rate.roomTypeName}</p>
        {rate.error ? <p className="text-xs text-[#8C3B2A]">{rate.error}</p> : null}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Input
            className="h-8"
            value={roomCode}
            aria-label={`Room code for ${rate.name}`}
            onChange={(event) => setRoomCode(event.target.value)}
          />
          <Input
            className="h-8"
            value={rateplanCode}
            aria-label={`Rate code for ${rate.name}`}
            onChange={(event) => setRateplanCode(event.target.value)}
          />
        </div>
      </TableCell>
      <TableCell>
        <NoruStatusChip tone={tone} />
      </TableCell>
      <TableCell className="space-x-1">
        {dirty ? (
          <Button
            type="button"
            size="sm"
            className="h-8 bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => onSave(roomCode.trim(), rateplanCode.trim())}
          >
            Save
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={onToggle}>
          {rate.active ? "Deactivate" : "Activate"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function AiosellWorkspacePanel({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getAiosellWorkspace);
  const saveConnection = useServerFn(saveAiosellConnection);
  const validate = useServerFn(validateAiosellConnection);
  const saveRoom = useServerFn(saveAiosellRoomMapping);
  const setRoom = useServerFn(setAiosellRoomMappingState);
  const saveRate = useServerFn(saveAiosellRateMapping);
  const setRate = useServerFn(setAiosellRateMappingState);
  const reconcile = useServerFn(runAiosellReconciliation);
  const activateBooking = useServerFn(activateAiosellBookingComChannel);
  const [environment, setEnvironment] = useState<Environment>("sandbox");
  const [partnerSlug, setPartnerSlug] = useState("");
  const [hotelCode, setHotelCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof reconcile>> | null>(null);

  const queryKey = ["aiosell-workspace", restaurantId, environment];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId, environment } }),
    retry: false,
  });
  const view = query.data;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      saveConnection({
        data: {
          restaurantId,
          environment,
          partnerSlug: partnerSlug || view?.partnerSlug || "",
          hotelCode: hotelCode || view?.hotelCode || "",
        },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Aiosell connection saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const validateMutation = useMutation({
    mutationFn: () => validate({ data: { restaurantId, environment } }),
    onSuccess: async (result) => {
      await refresh();
      toast[result.ok ? "success" : "error"](
        result.ok ? "Connection validated." : (result.error ?? "Validation failed."),
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => reconcile({ data: { restaurantId, environment, startDate, endDate } }),
    onSuccess: async (result) => {
      setSummary(result);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bookingChannel = useMutation({
    mutationFn: () => activateBooking({ data: { restaurantId, environment } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Booking.com channel activated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading || !view) {
    return <p className="text-sm text-muted-foreground">Loading Aiosell…</p>;
  }

  return (
    <div className="space-y-3">
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#251605]">Connection</h2>
          <NoruStatusChip tone={aiosellTone(view.connectionState)} />
        </div>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-[#5C5346] sm:grid-cols-2">
          <div>Provider: {view.provider}</div>
          <div>Environment: {view.environment}</div>
          <div>Partner slug: {view.partnerSlug || "Not set"}</div>
          <div>Hotel code: {view.hotelCode || "Not set"}</div>
          <div className="flex items-center gap-1.5">
            Credentials <NoruStatusChip tone={aiosellTone(view.credentialStatus)} />
          </div>
          <div>Last validated: {formatStaffTime(view.lastValidatedAt)}</div>
          <div className="sm:col-span-2">Last error: {view.lastError ?? "None"}</div>
        </dl>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Label className="space-y-1 text-xs">
            Environment
            <Select
              value={environment}
              onValueChange={(value) => setEnvironment(value as Environment)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-1 text-xs">
            Partner slug
            <Input
              value={partnerSlug || view.partnerSlug}
              onChange={(event) => setPartnerSlug(event.target.value)}
            />
          </Label>
          <Label className="space-y-1 text-xs">
            External hotel code
            <Input
              value={hotelCode || view.hotelCode}
              onChange={(event) => setHotelCode(event.target.value)}
            />
          </Label>
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            Save metadata
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending}
          >
            Validate connection
          </Button>
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#251605]">Readiness</h2>
          <NoruStatusChip tone={aiosellTone(view.readiness.level)} />
        </div>
        <ul className="mt-2 space-y-1 text-xs text-[#5C5346]">
          {view.readiness.reasons.length === 0 ? <li>Required checks passed.</li> : null}
          {view.readiness.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#E6E1D8] bg-white">
        <div className="border-b border-[#E6E1D8] px-3 py-2">
          <h2 className="text-sm font-semibold text-[#251605]">Room mappings</h2>
        </div>
        {view.rooms.length === 0 ? (
          <div className="p-3">
            <SettingsEmptyState title="No room types" body="Room types from inventory show up here for Aiosell codes." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NORU item</TableHead>
                <TableHead>External code</TableHead>
                <TableHead>Mapping status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.rooms.map((room) => (
                <TableRow key={room.roomTypeId}>
                  <TableCell className="text-sm text-[#251605]">
                    <p className="font-medium">{room.name}</p>
                    {room.code ? <p className="text-xs text-[#7A6A55]">{room.code}</p> : null}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8 max-w-48"
                      defaultValue={room.roomCode}
                      aria-label={`Aiosell room code for ${room.name}`}
                      onBlur={(event) => {
                        const roomCode = event.target.value.trim();
                        if (!roomCode || roomCode === room.roomCode) return;
                        void saveRoom({
                          data: { restaurantId, environment, roomTypeId: room.roomTypeId, roomCode },
                        }).then(refresh);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <NoruStatusChip
                      tone={room.roomCode ? (room.active ? "mapped" : "disabled") : "not_mapped"}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() =>
                        setRoom({
                          data: {
                            restaurantId,
                            environment,
                            roomTypeId: room.roomTypeId,
                            active: !room.active,
                          },
                        }).then(refresh)
                      }
                    >
                      {room.active ? "Deactivate" : "Activate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#E6E1D8] bg-white">
        <div className="border-b border-[#E6E1D8] px-3 py-2">
          <h2 className="text-sm font-semibold text-[#251605]">Rate mappings</h2>
        </div>
        {view.rates.length === 0 ? (
          <div className="p-3">
            <SettingsEmptyState title="No rate plans" body="Rate plans show up here once they exist for this property." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NORU item</TableHead>
                <TableHead>External code</TableHead>
                <TableHead>Mapping status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.rates.map((rate) => (
                <AiosellRateEditor
                  key={rate.ratePlanId}
                  rate={rate}
                  onSave={(roomCode, rateplanCode) => {
                    void saveRate({
                      data: {
                        restaurantId,
                        environment,
                        ratePlanId: rate.ratePlanId,
                        roomCode,
                        rateplanCode,
                      },
                    })
                      .then(refresh)
                      .catch((error: Error) => toast.error(error.message));
                  }}
                  onToggle={() =>
                    setRate({
                      data: {
                        restaurantId,
                        environment,
                        ratePlanId: rate.ratePlanId,
                        active: !rate.active,
                      },
                    }).then(refresh)
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#251605]">Connected channels</h2>
          {view.channels.some(
            (channel) => channel.code === "booking.com" && channel.enabled,
          ) ? null : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => bookingChannel.mutate()}
              disabled={bookingChannel.isPending}
            >
              Add Booking.com
            </Button>
          )}
        </div>
        {view.channels.length === 0 ? (
          <div className="mt-2">
            <SettingsEmptyState
              title="No connected OTA channels"
              body="No connected OTA channel records for this environment."
            />
          </div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {view.channels.map((channel) => (
              <li key={channel.code} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-[#251605]">{channel.code}</span>
                <NoruStatusChip tone={channel.enabled ? "connected" : "disabled"} />
                <span className="text-xs text-[#7A6A55]">
                  {channel.operations.join(", ") || "No operations stored"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#E6E1D8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6E1D8] px-3 py-2">
          <h2 className="text-sm font-semibold text-[#251605]">Sync status</h2>
          <NoruStatusChip
            tone={
              view.sync.latestError
                ? "error"
                : view.sync.recent.some((event) => aiosellTone(event.status) === "connected")
                  ? "connected"
                  : "pending"
            }
          />
        </div>
        <dl className="grid gap-x-4 gap-y-1 px-3 py-2 text-xs text-[#5C5346] sm:grid-cols-2">
          <div>Last validation: {formatStaffTime(view.sync.lastValidation?.createdAt)}</div>
          <div>Last outbound ARI: {formatStaffTime(view.sync.lastAri?.createdAt)}</div>
          <div>Last inbound reservation: {formatStaffTime(view.sync.lastInbound?.createdAt)}</div>
          <div>Last reconciliation: {formatStaffTime(view.sync.lastReconciliation?.createdAt)}</div>
          <div>Last no-show notification: {formatStaffTime(view.sync.lastNoShow?.createdAt)}</div>
          <div>
            Latest error: {view.sync.latestError?.message ?? view.sync.latestError?.operation ?? "None"}
          </div>
        </dl>
        {view.sync.recent.length === 0 ? null : (
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
              {view.sync.recent.map((event) => (
                <TableRow key={`${event.createdAt}-${event.operation}`}>
                  <TableCell className="whitespace-nowrap text-xs text-[#5C5346]">
                    {formatStaffTime(event.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-[#251605]">{event.operation}</TableCell>
                  <TableCell className="text-sm text-[#5C5346]">Aiosell</TableCell>
                  <TableCell>
                    <NoruStatusChip tone={aiosellTone(event.status)} />
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate text-xs text-[#5C5346]">
                    {event.message ?? event.bookingId ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="text-sm font-semibold text-[#251605]">Reconciliation</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            aria-label="Reconciliation start date"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            aria-label="Reconciliation end date"
          />
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => reconcileMutation.mutate()}
            disabled={reconcileMutation.isPending}
          >
            Run reconciliation
          </Button>
        </div>
        {summary ? (
          <dl className="mt-3 grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
            <div>Fetched {summary.totals.fetched}</div>
            <div>Created {summary.totals.created}</div>
            <div>Modified {summary.totals.modified}</div>
            <div>Cancelled {summary.totals.cancelled}</div>
            <div>Unchanged {summary.totals.unchanged}</div>
            <div>Conflicts {summary.totals.conflicts}</div>
            <div>Failed {summary.totals.failed}</div>
            {summary.runError ? <div>Run error {summary.runError}</div> : null}
          </dl>
        ) : null}
        {summary?.items.length ? (
          <ul className="mt-2 text-sm">
            {summary.items.map((item) => (
              <li key={`${item.bookingId}-${item.code}`}>
                {item.bookingId ?? "Booking"} · {item.channel ?? "Channel"} · {item.code}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <details className="rounded-xl border border-[#E6E1D8] bg-white px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-[#251605]">
          Technical details
        </summary>
        <div className="mt-2 space-y-2 text-xs leading-relaxed text-[#5C5346]">
          <p>{view.productionActivation.message}</p>
          <p>{AIOSELL_WINDOW_COPY}</p>
          <p>{AIOSELL_STALE_FETCH_WARNING}</p>
          <p>
            Webhook: {view.webhook.ready ? view.webhook.url : "Public base URL is not configured."}
          </p>
        </div>
      </details>
    </div>
  );
}
