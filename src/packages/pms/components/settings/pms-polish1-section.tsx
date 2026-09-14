import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { ReadinessChip } from "@/packages/pms/components/settings/pms-set1-section";
import { Set5AdminSection } from "@/packages/pms/components/settings/pms-set5-section";
import type { Set1Checklist } from "@/packages/pms/lib/pms-set1-foundation";
import { emptySet5Snapshot, type Set5Snapshot } from "@/packages/pms/lib/pms-set5-depts-guestsvc";
import {
  POLISH1_ADMIN_HREF,
  POLISH1_ADMIN_PURPOSE,
  POLISH1_HR_HREF,
  POLISH1_PAYMENTS_PURPOSE,
  POLISH1_PAYMENTS_UNAVAILABLE,
  POLISH1_PAYMENTS_WARNING,
  POLISH1_SHIFTS_UNAVAILABLE,
  POLISH1_SHIFTS_WARNING,
  type Polish1Snapshot,
  type PmsPaymentMethod,
  type PmsShiftDefinition,
} from "@/packages/pms/lib/pms-polish1-payment-admin";
import { savePmsPaymentMethod, savePmsShiftDefinition } from "@/packages/pms/lib/pms-polish1-payment-admin.functions";

function refreshPolish1(queryClient: ReturnType<typeof useQueryClient>, restaurantId: string) {
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-audit", restaurantId] });
}

function CatalogueRow({
  title,
  detail,
  active,
  canEdit,
  onEdit,
  onToggle,
}: {
  title: string;
  detail: string;
  active: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          {detail} · {active ? "Active" : "Inactive"}
        </p>
      </div>
      {canEdit ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={onToggle}>
            {active ? "Deactivate" : "Reactivate"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function Polish1PaymentMethodsSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Polish1Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePmsPaymentMethod);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PmsPaymentMethod | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [typeClass, setTypeClass] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setCode(editing?.code ?? "");
    setTypeClass(editing?.typeClass ?? "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const mutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; typeClass: string; notes: string; active: boolean }) =>
      save({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Payment method saved.");
      setOpen(false);
      refreshPolish1(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains["payment-methods"];

  return (
    <section id="payment-methods" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-polish1-payment-methods">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Payment methods</h2>
          <p className="mt-1 text-sm text-muted-foreground">{POLISH1_PAYMENTS_PURPOSE}</p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.paymentMethodsAvailable ? (
        <p className="text-sm text-muted-foreground">{POLISH1_PAYMENTS_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium text-[#251605]">Accepted tenders</h3>
            {canEdit ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                Add
              </Button>
            ) : null}
          </div>
          {snapshot.paymentMethods.length === 0 ? (
            <p className="text-sm text-[#C89933]">{POLISH1_PAYMENTS_WARNING}</p>
          ) : (
            <ul className="space-y-2">
              {snapshot.paymentMethods.map((row) => (
                <CatalogueRow
                  key={row.id}
                  title={row.name}
                  detail={[row.code, row.typeClass].filter(Boolean).join(" · ")}
                  active={row.active}
                  canEdit={canEdit}
                  onEdit={() => {
                    setEditing(row);
                    setOpen(true);
                  }}
                  onToggle={() =>
                    mutation.mutate({
                      id: row.id,
                      code: row.code,
                      name: row.name,
                      typeClass: row.typeClass,
                      notes: row.notes,
                      active: !row.active,
                    })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit payment method" : "Add payment method"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="polish1-pm-name">Name</Label>
              <Input id="polish1-pm-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="polish1-pm-code">Code</Label>
              <Input id="polish1-pm-code" value={code} onChange={(event) => setCode(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="polish1-pm-class">Type class (optional)</Label>
              <Input id="polish1-pm-class" value={typeClass} onChange={(event) => setTypeClass(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="polish1-pm-notes">Notes (optional)</Label>
              <Input id="polish1-pm-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || !code.trim() || mutation.isPending}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              onClick={() =>
                mutation.mutate({
                  ...(editing?.id ? { id: editing.id } : {}),
                  name,
                  code,
                  typeClass,
                  notes,
                  active: editing?.active ?? true,
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function Polish1AdministrationSection({
  restaurantId,
  snapshot,
  set5,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Polish1Snapshot;
  set5: Set5Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePmsShiftDefinition);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PmsShiftDefinition | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [typeClass, setTypeClass] = useState("");
  const [notes, setNotes] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setCode(editing?.code ?? "");
    setTypeClass(editing?.typeClass ?? "");
    setNotes(editing?.notes ?? "");
    setStartTime(editing?.startTime ?? "");
    setEndTime(editing?.endTime ?? "");
  }, [open, editing]);

  const mutation = useMutation({
    mutationFn: (input: {
      id?: string;
      code: string;
      name: string;
      typeClass: string;
      notes: string;
      startTime: string;
      endTime: string;
      active: boolean;
    }) => save({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Shift definition saved.");
      setOpen(false);
      refreshPolish1(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains.administration;

  return (
    <section id="administration" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-polish1-administration">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Administration</h2>
          <p className="mt-1 text-sm text-muted-foreground">{POLISH1_ADMIN_PURPOSE}</p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-3">
          <p className="font-medium text-[#251605]">Roles &amp; staff</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Day-to-day users, roles and permissions stay on the Administration module. This page is not a second staff
            manager.
          </p>
          <Button variant="outline" className="mt-3" asChild>
            <a href={POLISH1_ADMIN_HREF} data-testid="polish1-open-administration">
              Open administration
            </a>
          </Button>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="font-medium text-[#251605]">Small HR</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Employment, schedules and attendance stay in Human Resources. This is a deep-link only — not a full HRIS.
          </p>
          <Button variant="outline" className="mt-3" asChild>
            <a href={POLISH1_HR_HREF}>Open Human Resources</a>
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-[#251605]">Shifts</h3>
          {canEdit && snapshot.shiftsAvailable ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Add
            </Button>
          ) : null}
        </div>
        {!snapshot.shiftsAvailable ? (
          <p className="text-sm text-muted-foreground">{POLISH1_SHIFTS_UNAVAILABLE}</p>
        ) : snapshot.shifts.length === 0 ? (
          <p className="text-sm text-[#C89933]">{POLISH1_SHIFTS_WARNING}</p>
        ) : (
          <ul className="space-y-2">
            {snapshot.shifts.map((row) => (
              <CatalogueRow
                key={row.id}
                title={row.name}
                detail={[row.code, row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : null]
                  .filter(Boolean)
                  .join(" · ")}
                active={row.active}
                canEdit={canEdit}
                onEdit={() => {
                  setEditing(row);
                  setOpen(true);
                }}
                onToggle={() =>
                  mutation.mutate({
                    id: row.id,
                    code: row.code,
                    name: row.name,
                    typeClass: row.typeClass,
                    notes: row.notes,
                    startTime: row.startTime,
                    endTime: row.endTime,
                    active: !row.active,
                  })
                }
              />
            ))}
          </ul>
        )}
      </div>

      <Set5AdminSection
        restaurantId={restaurantId}
        snapshot={set5 ?? emptySet5Snapshot()}
        checklist={checklist}
        canEdit={canEdit}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit shift" : "Add shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="polish1-shift-name">Name</Label>
              <Input id="polish1-shift-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="polish1-shift-code">Code</Label>
              <Input id="polish1-shift-code" value={code} onChange={(event) => setCode(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="polish1-shift-start">Start (optional)</Label>
                <Input id="polish1-shift-start" value={startTime} onChange={(event) => setStartTime(event.target.value)} placeholder="07:00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="polish1-shift-end">End (optional)</Label>
                <Input id="polish1-shift-end" value={endTime} onChange={(event) => setEndTime(event.target.value)} placeholder="15:00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="polish1-shift-class">Type class (optional)</Label>
              <Input id="polish1-shift-class" value={typeClass} onChange={(event) => setTypeClass(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="polish1-shift-notes">Notes (optional)</Label>
              <Input id="polish1-shift-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || !code.trim() || mutation.isPending}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              onClick={() =>
                mutation.mutate({
                  ...(editing?.id ? { id: editing.id } : {}),
                  name,
                  code,
                  typeClass,
                  notes,
                  startTime,
                  endTime,
                  active: editing?.active ?? true,
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
