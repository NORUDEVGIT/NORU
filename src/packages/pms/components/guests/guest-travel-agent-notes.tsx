import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  addTravelAgentNote,
  archiveTravelAgentNote,
  listTravelAgentNotes,
  updateTravelAgentNote,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import {
  COMPANY_NOTE_CATEGORIES,
  COMPANY_NOTE_VISIBILITIES,
  type CompanyNoteCategory,
  type CompanyNoteVisibility,
} from "@/packages/pms/lib/guest-company-detail-workspace";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

export function GuestTravelAgentNotes({
  restaurantId,
  agencyId,
}: {
  restaurantId: string;
  agencyId: string;
}) {
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();
  const load = useServerFn(listTravelAgentNotes);
  const addNote = useServerFn(addTravelAgentNote);
  const saveNote = useServerFn(updateTravelAgentNote);
  const archiveNote = useServerFn(archiveTravelAgentNote);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [draft, setDraft] = useState("");
  const [draftCategory, setDraftCategory] = useState<CompanyNoteCategory>("general");
  const [draftVisibility, setDraftVisibility] = useState<CompanyNoteVisibility>("internal");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const query = useQuery({
    queryKey: ["travel-agent-notes", restaurantId, agencyId, q, category, visibility],
    queryFn: () => load({ data: { restaurantId, agencyId, q, category, visibility } }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["travel-agent-notes", restaurantId, agencyId] });
    void queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, agencyId] });
  }

  const add = useMutation({
    mutationFn: () => addNote({ data: { restaurantId, agencyId, note: draft, category: draftCategory, visibility: draftVisibility } }),
    onSuccess: () => {
      setDraft("");
      toast.success("Note added.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: () => saveNote({ data: { restaurantId, agencyId, noteId: editingId!, note: editText } }),
    onSuccess: () => {
      setEditingId(null);
      toast.success("Note updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const archive = useMutation({
    mutationFn: (noteId: string) => archiveNote({ data: { restaurantId, agencyId, noteId } }),
    onSuccess: () => {
      toast.success("Note archived.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4" data-testid="travel-agent-notes">
      <div>
        <h2 className="font-display text-xl">Notes</h2>
        <p className="text-sm text-muted-foreground">Structured notes live on travel agency history.</p>
      </div>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <Label htmlFor="ta-note-draft">Add note</Label>
        <Textarea id="ta-note-draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={draftCategory} onValueChange={(value) => setDraftCategory(value as CompanyNoteCategory)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMPANY_NOTE_CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={draftVisibility} onValueChange={(value) => setDraftVisibility(value as CompanyNoteVisibility)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMPANY_NOTE_VISIBILITIES.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" disabled={!draft.trim() || add.isPending} onClick={() => add.mutate()}>Add Note</Button>
      </section>
      <div className="grid gap-3 md:grid-cols-3">
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search notes or author" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {COMPANY_NOTE_CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={visibility} onValueChange={setVisibility}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All visibility</SelectItem>
            {COMPANY_NOTE_VISIBILITIES.map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(query.data?.items ?? []).map((row) => (
        <article key={row.noteId} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{row.category}</Badge>
            <Badge variant="secondary">{row.visibility}</Badge>
            <span className="text-xs text-muted-foreground">{dateTime(row.createdAt)} · {row.authorName}</span>
          </div>
          {editingId === row.noteId ? (
            <div className="mt-3 space-y-2">
              <Textarea value={editText} onChange={(event) => setEditText(event.target.value)} />
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={!editText.trim() || update.isPending} onClick={() => update.mutate()}>Save</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm">{row.content}</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setEditingId(row.noteId); setEditText(row.content); }}>Edit</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => archive.mutate(row.noteId)}>Archive</Button>
          </div>
        </article>
      ))}
    </div>
  );
}
