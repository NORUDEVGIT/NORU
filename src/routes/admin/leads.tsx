import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/core/components/admin-shell";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { listLeads, updateLead, type AdminLeadRow } from "@/core/lib/leads.functions";
import { LEAD_STATUSES, type LeadStatus } from "@/core/lib/leads";

export const Route = createFileRoute("/admin/leads")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login" });
  },
  head: () => ({
    meta: [
      { title: "Leads — NORU Admin" },
      { name: "description", content: "Request Demo and Contact submissions." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell active="Leads">
      <LeadInbox />
    </AdminShell>
  ),
});

function LeadInbox() {
  const fetchLeads = useServerFn(listLeads);
  const saveLead = useServerFn(updateLead);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-leads"],
    queryFn: () => fetchLeads(),
    retry: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const lead = (data ?? []).find((row) => row.id === selected) ?? null;

  async function save(row: AdminLeadRow, status: LeadStatus, notes: string) {
    setSaving(true);
    setNotice(null);
    try {
      await saveLead({ data: { id: row.id, status, notes } });
      await queryClient.invalidateQueries({ queryKey: ["admin-leads"] });
      setNotice("Lead updated.");
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : "We couldn't update that lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Request Demo and Contact submissions. These records do not change package entitlements.
        </p>
      </div>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading leads…</p>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Administrator access required."}
        </p>
      ) : (data ?? []).length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No leads yet.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data ?? []).map((row) => (
                  <tr key={row.id} className={row.id === selected ? "bg-muted/60" : undefined}>
                    <td className="p-3 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        className="font-medium underline-offset-2 hover:underline"
                        onClick={() => setSelected(row.id)}
                      >
                        {row.name}
                      </button>
                    </td>
                    <td className="p-3">{row.company}</td>
                    <td className="p-3">
                      {row.source === "request_demo" ? "Request Demo" : "Contact"}
                    </td>
                    <td className="p-3 capitalize">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lead ? (
            <LeadDetail key={lead.id} lead={lead} saving={saving} onSave={save} />
          ) : (
            <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Select a lead to update its status and notes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LeadDetail({
  lead,
  saving,
  onSave,
}: {
  lead: AdminLeadRow;
  saving: boolean;
  onSave: (lead: AdminLeadRow, status: LeadStatus, notes: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [notes, setNotes] = useState(lead.notes ?? "");

  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(lead, status, notes);
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">{lead.name}</h2>
        <p className="text-sm text-muted-foreground">{lead.email}</p>
      </div>
      <dl className="space-y-1 text-sm">
        <div>
          <dt className="text-muted-foreground">Company</dt>
          <dd>{lead.company}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Phone</dt>
          <dd>{lead.phone || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Property</dt>
          <dd>{lead.propertyType}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Message</dt>
          <dd className="whitespace-pre-wrap">{lead.message || "—"}</dd>
        </div>
      </dl>
      <label className="block text-sm">
        Status
        <select
          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
          value={status}
          onChange={(event) => setStatus(event.target.value as LeadStatus)}
        >
          {LEAD_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Notes
        <Textarea
          className="mt-1"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
