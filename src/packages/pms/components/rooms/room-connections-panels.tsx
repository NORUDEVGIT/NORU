import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, DoorOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  CONNECTING_REVIEW_HELP,
  CONNECTING_REVIEW_TITLE,
  CROSS_BUILDING_LINK_WARNING,
  ROOM_CONNECTIONS_EMPTY,
  ROOM_CONNECTIONS_HELP,
  ROOM_CONNECTIONS_TITLE,
  ROOM_LINK_DIFFERENT_BUILDINGS,
  ROOM_LINK_KIND_LABELS,
  ROOM_LINK_KIND_VALUES,
  connectingReadinessWarning,
  connectingReviewCountRows,
  connectingRoomCount,
  connectingRoomCountLabel,
  connectionRoomLabel,
  removeConnectionConfirmText,
  roomConnectionWarnings,
  roomTypeConnectingHint,
  sameBuilding,
  type ConnectingReview,
  type ConnectionRoom,
  type RoomConnectionKind,
} from "@/packages/pms/lib/room-connections";
import {
  addRoomConnection,
  listRoomConnections,
  removeRoomConnection,
  type RoomConnectionView,
} from "@/packages/pms/lib/room-connections.functions";
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
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

import { AccessibilityHintNote } from "./room-accessibility-panels";
import { PmsSelect } from "./room-inventory-shared";

function candidateOptionLabel(source: ConnectionRoom, room: ConnectionRoom): string {
  const label = connectionRoomLabel(room);
  return sameBuilding(source, room) === false ? `${label} · Different building` : label;
}

export type RoomConnectionsViewProps = {
  room: ConnectionRoom | null;
  connections: RoomConnectionView[];
  candidates: ConnectionRoom[];
  loading?: boolean;
  failed?: boolean;
  canEdit?: boolean;
  pending?: boolean;
  error?: string | null;
  onAdd?: (targetId: string, kind: RoomConnectionKind) => void;
  onRemove?: (connection: RoomConnectionView) => void;
};

export function RoomConnectionsView({
  room,
  connections,
  candidates,
  loading = false,
  failed = false,
  canEdit = true,
  pending = false,
  error = null,
  onAdd,
  onRemove,
}: RoomConnectionsViewProps) {
  const [adding, setAdding] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [kind, setKind] = useState<RoomConnectionKind>("connecting");
  const target = candidates.find((candidate) => candidate.id === targetId) ?? null;
  const blocked =
    room && target && sameBuilding(room, target) === false ? ROOM_LINK_DIFFERENT_BUILDINGS : null;
  const warnings = room && target && !blocked ? roomConnectionWarnings(room, target, kind) : [];

  const reset = () => {
    setAdding(false);
    setTargetId("");
    setKind("connecting");
  };

  return (
    <section
      className="grid gap-2 rounded-lg border border-[#DDD4C5] bg-white p-3 text-xs"
      data-testid="room-connections"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-[#251605]">{ROOM_CONNECTIONS_TITLE}</h4>
          <p className="text-[11px] text-[#756A5B]">{ROOM_CONNECTIONS_HELP}</p>
        </div>
        {canEdit && !adding && !loading && !failed && room ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 border-[#DDD4C5] text-xs"
            data-testid="room-connections-add"
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1 size-3.5" aria-hidden />
            Add connection
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-[#756A5B]">Loading room connections…</p>
      ) : failed || !room ? (
        <p className="text-[#756A5B]">Room connections could not be loaded.</p>
      ) : connections.length === 0 ? (
        <p className="text-[#756A5B]">{ROOM_CONNECTIONS_EMPTY}</p>
      ) : (
        <ul className="grid gap-1.5" data-testid="room-connections-list">
          {connections.map((connection) => (
            <li
              key={connection.id}
              className="grid gap-1 rounded-md border border-[#E8E1D7] bg-[#FBF9F5] px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[#3D352B]">
                  <DoorOpen className="size-3.5 shrink-0 text-[#8A641A]" aria-hidden />
                  {connectionRoomLabel(connection.partner)} ·{" "}
                  <span className="font-semibold">{ROOM_LINK_KIND_LABELS[connection.kind]}</span>
                </span>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-[#8A3B2E]"
                    disabled={pending}
                    aria-label={`Remove connection with Room ${connection.partner.roomNumber}`}
                    onClick={() => onRemove?.(connection)}
                  >
                    <Trash2 className="mr-1 size-3.5" aria-hidden />
                    Remove
                  </Button>
                ) : null}
              </div>
              {connection.crossBuilding ? (
                <AccessibilityHintNote
                  hint={{ tone: "warning", message: CROSS_BUILDING_LINK_WARNING }}
                  testId="room-connection-cross-building"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {adding && room ? (
        <div
          className="grid gap-2 rounded-md border border-[#E6DFD3] bg-[#FBF9F5] p-2.5"
          data-testid="room-connections-picker"
        >
          <PmsSelect
            label="Target room"
            value={targetId}
            onChange={setTargetId}
            placeholder={candidates.length === 0 ? "No other active rooms" : "Choose a room"}
            disabled={candidates.length === 0 || pending}
            options={candidates.map(
              (candidate) =>
                [candidate.id, candidateOptionLabel(room, candidate)] as [string, string],
            )}
          />
          <div className="grid gap-1">
            <span className="text-xs font-semibold text-[#5F554B]">Relationship type</span>
            <div
              className="inline-flex w-fit rounded-md border border-[#DDD4C5] bg-white p-0.5"
              role="radiogroup"
            >
              {ROOM_LINK_KIND_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  disabled={pending}
                  onClick={() => setKind(value)}
                  className={cn(
                    "rounded px-3 py-1 text-xs font-medium",
                    kind === value ? "bg-[#251605] text-white" : "text-[#5F554B]",
                  )}
                >
                  {ROOM_LINK_KIND_LABELS[value]}
                </button>
              ))}
            </div>
          </div>
          {blocked ? (
            <p
              role="alert"
              className="text-[11px] font-medium text-destructive"
              data-testid="room-connections-blocked"
            >
              {blocked}
            </p>
          ) : null}
          {warnings.map((warning) => (
            <AccessibilityHintNote key={warning} hint={{ tone: "warning", message: warning }} />
          ))}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-[#DDD4C5]"
              disabled={pending}
              onClick={reset}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={!target || Boolean(blocked) || pending}
              data-testid="room-connections-confirm-add"
              onClick={() => {
                if (!target) return;
                onAdd?.(target.id, kind);
                reset();
              }}
            >
              {pending ? "Saving…" : "Add connection"}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-[11px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Saves through the dedicated add / remove actions, never through the room form. */
export function RoomConnectionsSection({
  restaurantId,
  roomId,
  open,
}: {
  restaurantId: string;
  roomId: string | null;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchConnections = useServerFn(listRoomConnections);
  const submitAdd = useServerFn(addRoomConnection);
  const submitRemove = useServerFn(removeRoomConnection);
  const [confirming, setConfirming] = useState<RoomConnectionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["room-connections", restaurantId, roomId],
    enabled: open && Boolean(roomId),
    queryFn: () => fetchConnections({ data: { restaurantId, roomId: roomId! } }),
  });

  const refresh = () =>
    Promise.all(
      [
        ["room-connections", restaurantId],
        ["room-board-rooms", restaurantId],
        ["rooms-dashboard", restaurantId],
        ["pms-card2-rooms", restaurantId],
        ["pms-connecting-review", restaurantId],
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );

  const addMutation = useMutation({
    mutationFn: async (input: { otherRoomId: string; kind: RoomConnectionKind }) => {
      const result = await submitAdd({ data: { restaurantId, roomId: roomId!, ...input } });
      if (!result.ok) throw new Error(result.message);
      return result.warnings;
    },
    onMutate: () => setError(null),
    onSuccess: async (warnings) => {
      toast.success("Connection added.");
      for (const warning of warnings) toast.warning(warning);
      await refresh();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not save the connection."),
  });

  const removeMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const result = await submitRemove({ data: { restaurantId, roomId: roomId!, linkId } });
      if (!result.ok) throw new Error(result.message);
    },
    onMutate: () => setError(null),
    onSuccess: async () => {
      toast.success("Connection removed.");
      await refresh();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not remove the connection."),
  });

  const data = query.data?.ok ? query.data : null;

  return (
    <>
      <RoomConnectionsView
        room={data?.room ?? null}
        connections={data?.connections ?? []}
        candidates={data?.candidates ?? []}
        loading={query.isLoading}
        failed={query.isError || query.data?.ok === false}
        pending={addMutation.isPending || removeMutation.isPending}
        error={error}
        onAdd={(otherRoomId, kind) => addMutation.mutate({ otherRoomId, kind })}
        onRemove={setConfirming}
      />
      <AlertDialog open={confirming !== null} onOpenChange={(next) => !next && setConfirming(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove connection?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming && data
                ? removeConnectionConfirmText(
                    confirming.kind,
                    data.room.roomNumber,
                    confirming.partner.roomNumber,
                  )
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connection</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) removeMutation.mutate(confirming.id);
                setConfirming(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function RoomTypeConnectingRooms({
  containsConnectingRooms,
  rooms,
}: {
  containsConnectingRooms: boolean;
  rooms: ReadonlyArray<{ active: boolean; hasConnectingLink?: boolean }>;
}) {
  const count = connectingRoomCount(rooms);
  return (
    <div className="grid gap-1.5" data-testid="room-type-connecting-rooms">
      <p className="text-[11px] font-medium text-[#251605]">{connectingRoomCountLabel(count)}</p>
      <AccessibilityHintNote
        hint={roomTypeConnectingHint(containsConnectingRooms, count.connected)}
        testId="room-type-connecting-mismatch"
      />
    </div>
  );
}

/**
 * `connectingRuleOn` follows the rule as shown on screen, so the readiness
 * warning reacts before the rule is saved.
 */
export function ConnectingReviewPanel({
  review,
  connectingRuleOn,
  loading = false,
  failed = false,
}: {
  review: ConnectingReview | null;
  connectingRuleOn: boolean;
  loading?: boolean;
  failed?: boolean;
}) {
  const readiness = review
    ? connectingReadinessWarning(connectingRuleOn, review.counts.connectingPairs)
    : null;
  const groups = useMemo(() => review?.groups ?? [], [review]);
  return (
    <section
      className="rounded-xl border border-[#E6DFD3] bg-[#FBF9F5] p-4"
      data-testid="connecting-review"
    >
      <h3 className="text-sm font-semibold text-[#251605]">{CONNECTING_REVIEW_TITLE}</h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{CONNECTING_REVIEW_HELP}</p>
      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading connecting room review…</p>
      ) : failed || !review ? (
        <p className="mt-3 text-xs text-muted-foreground">
          The connecting room review could not be loaded.
        </p>
      ) : (
        <>
          {readiness ? (
            <p
              role="alert"
              data-testid="connecting-readiness-warning"
              className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {readiness}
            </p>
          ) : null}
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {connectingReviewCountRows(review).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[#EDE6D8] bg-white px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="text-base font-semibold text-[#251605]">{value}</dd>
              </div>
            ))}
          </dl>
          {groups.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No connecting room mismatches to review.
            </p>
          ) : (
            <div className="mt-3 space-y-2" data-testid="connecting-review-list">
              {groups.map((group) => (
                <details
                  key={group.category}
                  className="rounded-lg border border-[#EDE6D8] bg-white px-3 py-2 text-xs"
                >
                  <summary className="cursor-pointer font-medium text-[#251605]">
                    {group.label} ({group.items.length})
                  </summary>
                  {group.category === "cross_building_links" ? (
                    <p className="mt-2 text-[11px] text-amber-800">{CROSS_BUILDING_LINK_WARNING}</p>
                  ) : null}
                  <ul className="mt-2 grid gap-1 text-[#3D352B] sm:grid-cols-2">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
