/**
 * Phase 8H4 — Standalone POS cashier shifts.
 *
 * Till-session management only: open a drawer with a starting float, close it
 * with a counted amount, and see what happened. Every figure shown here is
 * computed by the server; the browser never works out expected cash or
 * variance. Uses `pos_cashier_shifts` only — never Restaurant Management or
 * PMS cashier shifts.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useMoney, useRestaurantTime } from "@/core/state/restaurant-context";
import {
  closePosShift,
  getPosShiftState,
  listPosShifts,
  openPosShift,
} from "@/lib/standalone-pos.functions";
import { STANDALONE_POS_ROLES } from "@/core/lib/module-access";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { ErrorNotice, PosHeader, ReadOnlyNotice } from "./pos-shared";

type CloseResult = {
  openingFloat: number;
  cashTakings: number;
  cashRefunds: number;
  expectedCash: number;
  closingCash: number;
  variance: number;
};

export function StandalonePosShifts({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const canRunShift = (STANDALONE_POS_ROLES as readonly string[]).includes(membership.role);
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const qc = useQueryClient();

  const stateFn = useServerFn(getPosShiftState);
  const historyFn = useServerFn(listPosShifts);
  const openFn = useServerFn(openPosShift);
  const closeFn = useServerFn(closePosShift);

  const state = useQuery({
    queryKey: ["pos-shift-state", restaurantId],
    queryFn: () => stateFn({ data: { restaurantId } }),
  });
  const history = useQuery({
    queryKey: ["pos-shift-history", restaurantId],
    queryFn: () => historyFn({ data: { restaurantId, limit: 25 } }),
  });

  const [registerId, setRegisterId] = useState("");
  const [float, setFloat] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [closingFor, setClosingFor] = useState<string | null>(null);
  const [counted, setCounted] = useState("0");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<CloseResult | null>(null);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["pos-shift-state", restaurantId] }),
      qc.invalidateQueries({ queryKey: ["pos-shift-history", restaurantId] }),
      qc.invalidateQueries({ queryKey: ["pos-registers", restaurantId] }),
      qc.invalidateQueries({ queryKey: ["pos-overview", restaurantId] }),
      qc.invalidateQueries({ queryKey: ["pos-readiness", restaurantId] }),
    ]);
  }

  const openShift = useMutation({
    mutationFn: (input: { registerId: string; openingFloat: number }) =>
      openFn({ data: { restaurantId, ...input } }),
    onSuccess: async () => {
      setError(null);
      setFloat("0");
      await refresh();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "That shift could not be opened."),
  });

  const closeShift = useMutation({
    mutationFn: (input: { shiftId: string; closingCash: number; notes: string | null }) =>
      closeFn({ data: { restaurantId, ...input } }) as Promise<CloseResult & { ok: true }>,
    onSuccess: async (res) => {
      setError(null);
      setClosingFor(null);
      setCounted("0");
      setNotes("");
      setResult({
        openingFloat: res.openingFloat,
        cashTakings: res.cashTakings,
        cashRefunds: res.cashRefunds,
        expectedCash: res.expectedCash,
        closingCash: res.closingCash,
        variance: res.variance,
      });
      await refresh();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "That shift could not be closed."),
  });

  const s = state.data;
  const myShifts = s?.myShifts ?? [];
  const registers = s?.registers ?? [];
  const available = registers.filter((r) => r.active && !r.openShiftId);
  const takenByOthers = registers.filter((r) => r.openShiftId && !r.openShiftMine);

  return (
    <div className="space-y-6">
      <PosHeader
        title="Registers & Shifts"
        crumb="Registers & Shifts"
        propertyName={membership.restaurant.name}
        description="Open a till with a starting cash amount, and close it by counting the drawer. One shift can be open per register at a time."
        actions={
          <Button variant="outline" asChild>
            <Link to="/restaurant/pos/registers">Manage registers</Link>
          </Button>
        }
      />

      {canRunShift ? null : (
        <ReadOnlyNotice>
          Your role can see shifts here but not open or close them.
        </ReadOnlyNotice>
      )}
      <ErrorNotice message={error} />

      {/* Current state */}
      <section className="space-y-3">
        <h2 className="font-display text-xl">Right now</h2>
        {state.isLoading ? (
          <div className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">Loading…</div>
        ) : myShifts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {myShifts.map((shift) => (
              <div key={shift.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Your open shift</p>
                <p className="mt-1 font-display text-xl">{shift.registerName}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Opened by</dt>
                  <dd>{shift.openedBy}</dd>
                  <dt className="text-muted-foreground">Opened at</dt>
                  <dd>{dateTime(shift.openedAt)}</dd>
                  <dt className="text-muted-foreground">Business date</dt>
                  <dd>{shift.businessDate}</dd>
                  <dt className="text-muted-foreground">Opening float</dt>
                  <dd>{money(shift.openingFloat)}</dd>
                  <dt className="text-muted-foreground">Cash takings</dt>
                  <dd>{money(shift.cashTakings)}</dd>
                  <dt className="text-muted-foreground">Expected cash</dt>
                  <dd className="font-medium">{money(shift.expectedCash)}</dd>
                </dl>
                {canRunShift ? (
                  <Button
                    className="mt-4"
                    onClick={() => {
                      setResult(null);
                      setCounted(String(shift.expectedCash));
                      setClosingFor(shift.id);
                    }}
                  >
                    Close shift
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              You don't have an open shift.{" "}
              {registers.length === 0
                ? "There are no registers yet."
                : available.length === 0
                ? "Every active register already has a shift open."
                : "Pick a register and enter the cash you're starting with."}
            </p>
            {canRunShift && available.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="shift-register">Register</Label>
                  <Select value={registerId} onValueChange={setRegisterId}>
                    <SelectTrigger id="shift-register" className="w-56">
                      <SelectValue placeholder="Choose a register" />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shift-float">Opening float</Label>
                  <Input
                    id="shift-float"
                    inputMode="decimal"
                    className="w-40"
                    value={float}
                    onChange={(e) => setFloat(e.target.value)}
                  />
                </div>
                <Button
                  disabled={openShift.isPending || !registerId}
                  onClick={() => {
                    const value = Number(float);
                    if (!Number.isFinite(value) || value < 0) {
                      setError("Enter the opening float as a number of 0 or more.");
                      return;
                    }
                    openShift.mutate({ registerId, openingFloat: value });
                  }}
                >
                  {openShift.isPending ? "Opening…" : "Open shift"}
                </Button>
              </div>
            ) : null}
            {takenByOthers.length > 0 ? (
              <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                {takenByOthers.map((r) => (
                  <li key={r.id}>
                    {r.name} — unavailable, {r.openShiftBy} has a shift open on it.
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      {result ? (
        <section className="rounded-2xl border border-border bg-muted/40 p-4">
          <h2 className="font-display text-lg">Shift closed</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Opening float</dt>
              <dd>{money(result.openingFloat)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cash takings</dt>
              <dd>{money(result.cashTakings)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cash refunds</dt>
              <dd>{money(result.cashRefunds)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Expected cash</dt>
              <dd>{money(result.expectedCash)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Counted cash</dt>
              <dd>{money(result.closingCash)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Difference</dt>
              <dd className={result.variance === 0 ? "" : "font-medium text-destructive"}>
                {money(result.variance)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {/* History */}
      <section className="space-y-3">
        <h2 className="font-display text-xl">Recent shifts</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Register</th>
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3">Closed</th>
                <th className="px-4 py-3 text-right">Float</th>
                <th className="px-4 py-3 text-right">Expected</th>
                <th className="px-4 py-3 text-right">Counted</th>
                <th className="px-4 py-3 text-right">Difference</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : (history.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-muted-foreground">
                    No shifts yet.
                  </td>
                </tr>
              ) : (
                (history.data ?? []).map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{h.registerName}</td>
                    <td className="px-4 py-3">{h.openedBy}</td>
                    <td className="px-4 py-3 text-muted-foreground">{dateTime(h.openedAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {h.closedAt ? `${dateTime(h.closedAt)}${h.closedBy ? ` · ${h.closedBy}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{money(h.openingFloat)}</td>
                    <td className="px-4 py-3 text-right">
                      {h.expectedCash === null ? "—" : money(h.expectedCash)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {h.closingCash === null ? "—" : money(h.closingCash)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {h.variance === null ? "—" : money(h.variance)}
                    </td>
                    <td className="px-4 py-3">{h.status === "open" ? "Open" : "Closed"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Closed shifts can't be edited here. A correction needs a proper audited adjustment, which
          isn't built yet.
        </p>
      </section>

      <Dialog open={closingFor !== null} onOpenChange={(v) => (v ? null : setClosingFor(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close shift</DialogTitle>
            <DialogDescription>
              Count the drawer and enter the amount you found. The expected amount and the difference
              are worked out by the system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="counted-cash">Counted cash</Label>
              <Input
                id="counted-cash"
                inputMode="decimal"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="close-notes">Notes (optional)</Label>
              <Input id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <ErrorNotice message={closeShift.isError ? error : null} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosingFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={closeShift.isPending}
              onClick={() => {
                const value = Number(counted);
                if (!Number.isFinite(value) || value < 0) {
                  setError("Enter the counted cash as a number of 0 or more.");
                  return;
                }
                closeShift.mutate({
                  shiftId: closingFor!,
                  closingCash: value,
                  notes: notes.trim() ? notes.trim() : null,
                });
              }}
            >
              {closeShift.isPending ? "Closing…" : "Close shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
