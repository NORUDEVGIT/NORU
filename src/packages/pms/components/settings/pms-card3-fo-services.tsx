import { useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import type { Card3FoServiceRef } from "@/packages/pms/lib/meals-card3.server";

export function PmsCard3FoServices({
  services,
  canEdit,
  pending,
  onSave,
}: {
  services: Card3FoServiceRef[];
  canEdit: boolean;
  pending: boolean;
  onSave: (input: {
    id?: string;
    name: string;
    defaultAmount: number;
    active: boolean;
    sortOrder: number;
  }) => void;
}) {
  const [draft, setDraft] = useState<{
    id?: string;
    name: string;
    defaultAmount: number;
    active: boolean;
    sortOrder: number;
  } | null>(null);

  return (
    <section
      className="space-y-3 rounded-2xl border border-[#E6E1D8] bg-white p-4"
      data-testid="card3-fo-services"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-[#251605]">Front-office services</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Services that a package can include, such as airport pickup. This list is not the guest
            request catalogue.
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="card3-fo-service-add"
            onClick={() =>
              setDraft({
                name: "",
                defaultAmount: 0,
                active: true,
                sortOrder: services.length,
              })
            }
          >
            Add service
          </Button>
        ) : null}
      </div>
      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground">No front-office services yet.</p>
      ) : (
        <ul className="space-y-2">
          {services.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.active ? "Active" : "Inactive"} · {row.defaultAmount}
                </p>
              </div>
              {canEdit ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setDraft(row)}>
                  Edit
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {draft ? (
        <form
          className="grid gap-3 rounded-xl border border-[#C89933]/60 p-3 sm:grid-cols-2"
          data-testid="card3-fo-service-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.name.trim()) return;
            onSave(draft);
            setDraft(null);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="fo-service-name">Name</Label>
            <Input
              id="fo-service-name"
              value={draft.name}
              disabled={!canEdit || pending}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fo-service-amount">Default Amount</Label>
            <Input
              id="fo-service-amount"
              type="number"
              min={0}
              step="0.01"
              value={draft.defaultAmount}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setDraft({ ...draft, defaultAmount: Number(event.target.value) || 0 })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fo-service-sort">Sort Order</Label>
            <Input
              id="fo-service-sort"
              type="number"
              min={0}
              step={1}
              value={draft.sortOrder}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  sortOrder: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                })
              }
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="fo-service-active">Active</Label>
            <Switch
              id="fo-service-active"
              checked={draft.active}
              disabled={!canEdit || pending}
              onCheckedChange={(active) => setDraft({ ...draft, active })}
            />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={!canEdit || pending || !draft.name.trim()}
            >
              {pending ? "Saving…" : "Save service"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
