import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Connection</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>Provider: {view.provider}</div>
          <div>Environment: {view.environment}</div>
          <div>Partner slug: {view.partnerSlug || "Not set"}</div>
          <div>Hotel code: {view.hotelCode || "Not set"}</div>
          <div>State: {view.connectionState}</div>
          <div>Credentials: {view.credentialStatus}</div>
          <div>Last validated: {view.lastValidatedAt ?? "Never"}</div>
          <div>Last error: {view.lastError ?? "None"}</div>
        </dl>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            Save metadata
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending}
          >
            Validate connection
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Readiness</h2>
        <p className="mt-1 text-sm capitalize">{view.readiness.level.replaceAll("_", " ")}</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
          {view.readiness.reasons.length === 0 ? <li>Required checks passed.</li> : null}
          {view.readiness.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm">{view.productionActivation.message}</p>
        <p className="mt-2 text-sm text-muted-foreground">{view.staleFetchWarning}</p>
        <p className="mt-2 text-sm">
          Webhook: {view.webhook.ready ? view.webhook.url : "Public base URL is not configured."}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Room mappings</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {view.rooms.map((room) => (
            <li key={room.roomTypeId} className="flex flex-wrap items-center gap-2">
              <span>
                {room.name}
                {room.code ? ` (${room.code})` : ""}
              </span>
              <Input
                className="max-w-48"
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
              <span>{room.active ? "Active" : "Inactive"}</span>
              <span>{room.ready ? "Ready" : "Not ready"}</span>
              <Button
                type="button"
                variant="outline"
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
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Rate mappings</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {view.rates.map((rate) => (
            <li key={rate.ratePlanId} className="space-y-1">
              <div>
                {rate.name} · {rate.roomTypeName} · {rate.active ? "Active" : "Inactive"}
                {rate.error ? ` · ${rate.error}` : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="max-w-40"
                  defaultValue={rate.roomCode}
                  aria-label={`Room code for ${rate.name}`}
                  id={`${rate.ratePlanId}-room`}
                />
                <Input
                  className="max-w-40"
                  defaultValue={rate.rateplanCode}
                  aria-label={`Rate code for ${rate.name}`}
                  id={`${rate.ratePlanId}-rate`}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const roomCode =
                      (
                        document.getElementById(
                          `${rate.ratePlanId}-room`,
                        ) as HTMLInputElement | null
                      )?.value.trim() ?? "";
                    const rateplanCode =
                      (
                        document.getElementById(
                          `${rate.ratePlanId}-rate`,
                        ) as HTMLInputElement | null
                      )?.value.trim() ?? "";
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
                >
                  Save rate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setRate({
                      data: {
                        restaurantId,
                        environment,
                        ratePlanId: rate.ratePlanId,
                        active: !rate.active,
                      },
                    }).then(refresh)
                  }
                >
                  {rate.active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Connected channels</h2>
        {view.channels.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No connected OTA channel records for this environment.
          </p>
        ) : (
          <ul className="mt-2 text-sm">
            {view.channels.map((channel) => (
              <li key={channel.code}>
                {channel.code} · {channel.enabled ? "Enabled" : "Inactive"} ·{" "}
                {channel.operations.join(", ") || "No operations stored"}
              </li>
            ))}
          </ul>
        )}
        {view.channels.some(
          (channel) => channel.code === "booking.com" && channel.enabled,
        ) ? null : (
          <Button
            className="mt-3"
            type="button"
            variant="outline"
            onClick={() => bookingChannel.mutate()}
            disabled={bookingChannel.isPending}
          >
            Add Booking.com
          </Button>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Sync status</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>Last validation: {view.sync.lastValidation?.createdAt ?? "None"}</li>
          <li>Last outbound ARI: {view.sync.lastAri?.createdAt ?? "None"}</li>
          <li>Last inbound reservation: {view.sync.lastInbound?.createdAt ?? "None"}</li>
          <li>Last reconciliation: {view.sync.lastReconciliation?.createdAt ?? "None"}</li>
          <li>Last no-show notification: {view.sync.lastNoShow?.createdAt ?? "None"}</li>
          <li>
            Latest error:{" "}
            {view.sync.latestError?.message ?? view.sync.latestError?.operation ?? "None"}
          </li>
        </ul>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {view.sync.recent.map((event) => (
            <li key={`${event.createdAt}-${event.operation}`}>
              {event.createdAt} · {event.operation} · {event.status}
              {event.bookingId ? ` · ${event.bookingId}` : ""}
              {event.message ? ` · ${event.message}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Reconciliation</h2>
        <p className="mt-2 text-sm text-muted-foreground">{AIOSELL_WINDOW_COPY}</p>
        <p className="mt-2 text-sm text-muted-foreground">{AIOSELL_STALE_FETCH_WARNING}</p>
        <div className="mt-3 flex flex-wrap gap-2">
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
    </div>
  );
}
