import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Pencil, Plus, Printer, QrCode, RefreshCw, Trash2 } from "lucide-react";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteRestaurantTable,
  listRestaurantTables,
  regenerateTableToken,
  saveRestaurantTable,
  setTableActive,
  type ManagedTable,
} from "@/lib/tables.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

/** Editing tables is limited to owners and managers; other staff read only. */
const MANAGE_ROLES = ["owner", "manager"];

export const Route = createFileRoute("/restaurant/tables")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/tables" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Tables & QR Codes — Garden Table Platform" },
      {
        name: "description",
        content: "Create your dining tables, print their QR codes and let guests order straight from their seat.",
      },
      { property: "og:title", content: "Tables & QR Codes — Garden Table Platform" },
      { property: "og:description", content: "Manage tables and printable ordering QR codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TablesPage,
});

function TablesPage() {
  return <RestaurantShell active="Tables & QR">{(m) => <TablesManager membership={m} />}</RestaurantShell>;
}

function tableUrl(slug: string, token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/r/${slug}/t/${token}`;
}

function TablesManager({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurantId;
  const canManage = MANAGE_ROLES.includes(membership.role);
  const queryClient = useQueryClient();

  const fetchTables = useServerFn(listRestaurantTables);
  const saveFn = useServerFn(saveRestaurantTable);
  const activeFn = useServerFn(setTableActive);
  const regenFn = useServerFn(regenerateTableToken);
  const deleteFn = useServerFn(deleteRestaurantTable);

  const [editing, setEditing] = useState<ManagedTable | "new" | null>(null);
  const [qrTable, setQrTable] = useState<ManagedTable | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["restaurant-tables", restaurantId],
    queryFn: () => fetchTables({ data: { restaurantId } }),
  });

  const tables = useMemo(() => data?.tables ?? [], [data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["restaurant-tables", restaurantId] });

  const mutate = useMutation({
    mutationFn: async (action: () => Promise<{ ok: boolean; message?: string }>) => action(),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "Something went wrong.");
        return;
      }
      void refresh();
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Tables & QR Codes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each table gets its own secure QR code. Guests scan it and order straight to that table.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="mr-2 size-4" /> Add table
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading your tables…</p>
      ) : isError ? (
        <p className="mt-8 text-sm text-destructive">We couldn't load your tables.</p>
      ) : tables.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No tables yet. Add your first table to generate its QR code.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {tables.map((table) => (
            <li
              key={table.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="font-display text-xl">
                  Table {table.tableNumber}
                  {table.name ? <span className="ml-2 text-sm text-muted-foreground">{table.name}</span> : null}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {table.active ? "Active · QR ready" : "Inactive · QR disabled"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setQrTable(table)}>
                  <QrCode className="mr-2 size-4" /> View QR
                </Button>
                {canManage ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(table)}>
                      <Pencil className="mr-2 size-4" /> Edit
                    </Button>
                    <div className="flex items-center gap-2 pl-1">
                      <Switch
                        checked={table.active}
                        aria-label={`Table ${table.tableNumber} active`}
                        onCheckedChange={(checked) =>
                          mutate.mutate(() => activeFn({ data: { restaurantId, id: table.id, active: checked } }))
                        }
                      />
                      <span className="text-xs text-muted-foreground">Active</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Regenerate the QR code for Table ${table.tableNumber}? The printed code will stop working immediately and must be replaced.`,
                          )
                        )
                          return;
                        mutate.mutate(() => regenFn({ data: { restaurantId, id: table.id } }));
                      }}
                    >
                      <RefreshCw className="mr-2 size-4" /> Regenerate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (!window.confirm(`Delete Table ${table.tableNumber}?`)) return;
                        mutate.mutate(() => deleteFn({ data: { restaurantId, id: table.id } }));
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <TableFormDialog
          table={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const result = await saveFn({
              data: {
                restaurantId,
                ...(editing !== "new" ? { id: editing.id } : {}),
                tableNumber: values.tableNumber,
                name: values.name || null,
              },
            });
            if (!result.ok) {
              toast.error(result.message);
              return false;
            }
            toast.success("Table saved.");
            void refresh();
            return true;
          }}
        />
      ) : null}

      {qrTable ? (
        <QrDialog
          table={qrTable}
          restaurantName={membership.restaurant.name}
          slug={membership.restaurant.slug}
          onClose={() => setQrTable(null)}
        />
      ) : null}
    </div>
  );
}

function TableFormDialog({
  table,
  onClose,
  onSave,
}: {
  table: ManagedTable | null;
  onClose: () => void;
  onSave: (values: { tableNumber: string; name: string }) => Promise<boolean>;
}) {
  const [tableNumber, setTableNumber] = useState(table?.tableNumber ?? "");
  const [name, setName] = useState(table?.name ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{table ? "Edit table" : "Add table"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!tableNumber.trim()) return;
            setSaving(true);
            const ok = await onSave({ tableNumber: tableNumber.trim(), name: name.trim() });
            setSaving(false);
            if (ok) onClose();
          }}
        >
          <div>
            <Label htmlFor="table-number">Table number</Label>
            <Input
              id="table-number"
              value={tableNumber}
              maxLength={20}
              onChange={(event) => setTableNumber(event.target.value)}
              placeholder="7, A1, Patio 4…"
              required
            />
          </div>
          <div>
            <Label htmlFor="table-name">Name (optional)</Label>
            <Input
              id="table-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="Main dining"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save table"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({
  table,
  restaurantName,
  slug,
  onClose,
}: {
  table: ManagedTable;
  restaurantName: string;
  slug: string;
  onClose: () => void;
}) {
  const url = tableUrl(slug, table.qrToken);
  const [dataUrl, setDataUrl] = useState<string>("");

  // The QR is rendered locally so the capability token never leaves the app.
  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, { width: 640, margin: 1 }).then((png) => {
      if (!cancelled) setDataUrl(png);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Table {table.tableNumber} QR code</DialogTitle>
        </DialogHeader>

        <div id="qr-print-card" className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="font-display text-xl uppercase tracking-wide">{restaurantName}</p>
          <p className="mt-1 font-display text-3xl">Table {table.tableNumber}</p>
          <p className="mt-1 text-sm text-muted-foreground">Scan to order</p>
          {dataUrl ? (
            <img src={dataUrl} alt={`QR code for table ${table.tableNumber}`} className="mx-auto mt-4 size-56" />
          ) : (
            <div className="mx-auto mt-4 size-56 animate-pulse rounded-xl bg-muted" />
          )}
          <p className="mt-3 text-xs text-muted-foreground">Order directly from your table</p>
        </div>

        <p className="break-all text-center text-xs text-muted-foreground">{url}</p>

        <div className="flex flex-wrap justify-end gap-2">
          {dataUrl ? (
            <Button asChild variant="outline">
              <a href={dataUrl} download={`table-${table.tableNumber}-qr.png`}>
                Download QR
              </a>
            </Button>
          ) : null}
          <Button
            onClick={() => {
              if (!dataUrl) return;
              const win = window.open("", "_blank", "width=600,height=800");
              if (!win) return;
              win.document.write(
                `<html><head><title>Table ${table.tableNumber}</title></head>
                 <body style="font-family:system-ui;text-align:center;padding:48px">
                 <h1 style="letter-spacing:.08em;text-transform:uppercase;font-size:20px">${restaurantName}</h1>
                 <h2 style="font-size:40px;margin:8px 0">Table ${table.tableNumber}</h2>
                 <p style="color:#666">Scan to Order</p>
                 <img src="${dataUrl}" style="width:320px;height:320px" />
                 <p style="color:#666">Order directly from your table</p>
                 </body></html>`,
              );
              win.document.close();
              win.focus();
              win.print();
            }}
          >
            <Printer className="mr-2 size-4" /> Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
