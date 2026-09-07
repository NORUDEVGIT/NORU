/**
 * Phase 8H4 — Standalone POS registers.
 *
 * A register is simply a named till location in this property. It uses
 * `pos_registers` only: no Restaurant Management cashier concept, no PMS
 * cashiering, no hardware pairing. Owner/manager set them up; everyone else
 * with POS access sees the list read-only, and the server refuses writes
 * regardless of what the screen shows.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { listPosRegisters, savePosRegister } from "@/lib/standalone-pos.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { ErrorNotice, PosHeader, ReadOnlyNotice, canSetupPos } from "./pos-shared";

export type PosRegister = {
  id: string;
  name: string;
  locationLabel: string | null;
  active: boolean;
  openShiftId: string | null;
  openShiftBy: string | null;
  openShiftAt: string | null;
};

export function StandalonePosRegisters({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const canEdit = canSetupPos(membership);
  const qc = useQueryClient();

  const listFn = useServerFn(listPosRegisters);
  const saveFn = useServerFn(savePosRegister);

  const registers = useQuery({
    queryKey: ["pos-registers", restaurantId],
    queryFn: () => listFn({ data: { restaurantId } }) as Promise<PosRegister[]>,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PosRegister | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: { id?: string; name: string; locationLabel: string | null; active: boolean }) =>
      saveFn({ data: { restaurantId, ...input } }),
    onSuccess: async () => {
      setOpen(false);
      setError(null);
      await qc.invalidateQueries({ queryKey: ["pos-registers", restaurantId] });
      await qc.invalidateQueries({ queryKey: ["pos-shift-state", restaurantId] });
      await qc.invalidateQueries({ queryKey: ["pos-overview", restaurantId] });
      await qc.invalidateQueries({ queryKey: ["pos-readiness", restaurantId] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "That didn't work."),
  });

  const toggle = useMutation({
    mutationFn: (r: PosRegister) =>
      saveFn({
        data: { restaurantId, id: r.id, name: r.name, locationLabel: r.locationLabel, active: !r.active },
      }),
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ["pos-registers", restaurantId] });
      await qc.invalidateQueries({ queryKey: ["pos-shift-state", restaurantId] });
      await qc.invalidateQueries({ queryKey: ["pos-overview", restaurantId] });
      await qc.invalidateQueries({ queryKey: ["pos-readiness", restaurantId] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "That didn't work."),
  });

  function startCreate() {
    setEditing(null);
    setName("");
    setLocation("");
    setActive(true);
    setError(null);
    setOpen(true);
  }

  function startEdit(r: PosRegister) {
    setEditing(r);
    setName(r.name);
    setLocation(r.locationLabel ?? "");
    setActive(r.active);
    setError(null);
    setOpen(true);
  }

  const rows = registers.data ?? [];

  return (
    <div className="space-y-6">
      <PosHeader
        title="Registers"
        crumb="Registers"
        propertyName={membership.restaurant.name}
        description="The tills in this property. A register is just a named place where a cashier takes money — it belongs to this package alone."
        actions={
          canEdit ? (
            <Button onClick={startCreate}>
              <Plus className="mr-2 size-4" /> Add register
            </Button>
          ) : null
        }
      />

      {canEdit ? null : (
        <ReadOnlyNotice>Your role can see the registers here but not change them.</ReadOnlyNotice>
      )}
      <ErrorNotice message={error} />

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Register</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Shift</th>
              {canEdit ? <th className="px-4 py-3 text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {registers.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  No registers yet. {canEdit ? "Add one to start taking money at this till." : ""}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.locationLabel ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.active
                          ? "rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                          : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {r.active ? "Active" : "Switched off"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.openShiftId ? `Open — ${r.openShiftBy}` : "No open shift"}
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => startEdit(r)}>
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate(r)}
                        >
                          {r.active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        A register with an open cashier shift can't be switched off — close and count that shift first.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit register" : "Add register"}</DialogTitle>
            <DialogDescription>
              Give the till a name people recognise, such as “Front counter”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="register-name">Name</Label>
              <Input
                id="register-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Front counter"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="register-location">Location label</Label>
              <Input
                id="register-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Lobby"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <Label htmlFor="register-active" className="mb-0">
                Active
              </Label>
              <Switch id="register-active" checked={active} onCheckedChange={setActive} />
            </div>
            <ErrorNotice message={save.isError ? error : null} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={save.isPending || name.trim().length === 0}
              onClick={() =>
                save.mutate({
                  ...(editing ? { id: editing.id } : {}),
                  name: name.trim(),
                  locationLabel: location.trim() ? location.trim() : null,
                  active,
                })
              }
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
