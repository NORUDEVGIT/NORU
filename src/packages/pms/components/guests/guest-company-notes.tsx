import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, MessageSquare, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  addCompanyNote,
  archiveCompanyNote,
  listCompanyNotes,
  updateCompanyNote,
} from "@/packages/pms/lib/guest-company-detail.functions";
import {
  COMPANY_NOTE_CATEGORIES,
  COMPANY_NOTE_VISIBILITIES,
  type CompanyNoteCategory,
  type CompanyNoteVisibility,
} from "@/packages/pms/lib/guest-company-detail-workspace";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

export function GuestCompanyNotes({
  restaurantId,
  companyId,
}: {
  restaurantId: string;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();
  const load = useServerFn(listCompanyNotes);
  const addNote = useServerFn(addCompanyNote);
  const saveNote = useServerFn(updateCompanyNote);
  const archiveNote = useServerFn(archiveCompanyNote);

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftCategory, setDraftCategory] = useState<CompanyNoteCategory>("general");
  const [draftVisibility, setDraftVisibility] = useState<CompanyNoteVisibility>("internal");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const query = useQuery({
    queryKey: ["company-notes", restaurantId, companyId, q, category, visibility],
    queryFn: () => load({ data: { restaurantId, companyId, q, category, visibility } }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["company-notes", restaurantId, companyId] });
    void queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
    void queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, companyId] });
  }

  const add = useMutation({
    mutationFn: () =>
      addNote({
        data: {
          restaurantId,
          companyId,
          note: draft,
          category: draftCategory,
          visibility: draftVisibility,
        },
      }),
    onSuccess: () => {
      setDraft("");
      setAddOpen(false);
      toast.success("Note added.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: () =>
      saveNote({
        data: {
          restaurantId,
          companyId,
          noteId: editingId!,
          note: editText,
        },
      }),
    onSuccess: () => {
      setEditingId(null);
      toast.success("Note updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: (noteId: string) => archiveNote({ data: { restaurantId, companyId, noteId } }),
    onSuccess: () => {
      toast.success("Note archived.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4" data-testid="company-notes">
      {/* View Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Communication & Notes</h2>
          <p className="text-xs text-[#756A5B]">
            Structured notes, special billing instructions, and operational account directives.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
          onClick={() => setAddOpen(true)}
          data-testid="company-add-note-btn"
        >
          <Plus className="mr-1.5 size-3.5" />
          Add Note
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 text-xs border-[#DDD4C5] bg-white min-w-48 flex-1"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search note content or author…"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {COMPANY_NOTE_CATEGORIES.map((item) => (
              <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={visibility} onValueChange={setVisibility}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-36">
            <SelectValue placeholder="Visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All visibility</SelectItem>
            {COMPANY_NOTE_VISIBILITIES.map((item) => (
              <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(q || category !== "all" || visibility !== "all") && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-[#756A5B] hover:text-[#251605]"
            onClick={() => { setQ(""); setCategory("all"); setVisibility("all"); }}
          >
            <RotateCcw className="mr-1 size-3" /> Clear
          </Button>
        )}
      </div>

      {/* Dense Full-Width Table / List */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white overflow-hidden shadow-sm">
        {query.isLoading ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">Loading company notes…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">
            {q || category !== "all" || visibility !== "all"
              ? "No notes match these filters."
              : "No notes added for this company yet."}
          </p>
        ) : (
          <Table>
            <TableHeader className="bg-[#FAF8F5]">
              <TableRow className="border-b border-[#DDD4C5]">
                <TableHead className="w-36 text-xs font-semibold text-[#251605]">Date & Time</TableHead>
                <TableHead className="w-28 text-xs font-semibold text-[#251605]">Category</TableHead>
                <TableHead className="w-28 text-xs font-semibold text-[#251605]">Visibility</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Note Content</TableHead>
                <TableHead className="w-36 text-xs font-semibold text-[#251605]">Author</TableHead>
                <TableHead className="w-28 text-right text-xs font-semibold text-[#251605]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#EFE9DF]/60 text-xs">
              {items.map((row) => (
                <TableRow key={row.noteId} className="hover:bg-[#FAF8F5] transition-colors">
                  <TableCell className="py-2.5 text-[#756A5B] whitespace-nowrap">
                    {dateTime(row.createdAt)}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <span className="inline-flex items-center rounded-full bg-[#FAF8F5] border border-[#DDD4C5] px-2 py-0.5 text-[10px] font-semibold capitalize text-[#251605]">
                      {row.category}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5">
                    <span className="inline-flex items-center rounded-full bg-stone-100 border border-stone-200 px-2 py-0.5 text-[10px] font-medium capitalize text-stone-600">
                      {row.visibility}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5">
                    {editingId === row.noteId ? (
                      <div className="space-y-2 py-1">
                        <Textarea
                          className="min-h-[50px] text-xs border-[#DDD4C5]"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 text-xs bg-[#8A641A] text-white hover:bg-[#725215]"
                            disabled={!editText.trim() || update.isPending}
                            onClick={() => update.mutate()}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs text-[#756A5B]"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-[#251605]">{row.content}</p>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5 text-[#756A5B] whitespace-nowrap">
                    {row.authorName}
                  </TableCell>
                  <TableCell className="py-2.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs text-[#756A5B] hover:text-[#251605]"
                        onClick={() => {
                          setEditingId(row.noteId);
                          setEditText(row.content);
                        }}
                      >
                        <Pencil className="mr-1 size-3" /> Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs text-stone-400 hover:text-red-700"
                        onClick={() => archive.mutate(row.noteId)}
                      >
                        <Archive className="mr-1 size-3" /> Archive
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add Note Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Company Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Note Content *</Label>
              <Textarea
                className="min-h-[80px] text-xs border-[#DDD4C5]"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type note details…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select
                  value={draftCategory}
                  onValueChange={(val) => setDraftCategory(val as CompanyNoteCategory)}
                >
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_NOTE_CATEGORIES.map((item) => (
                      <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Visibility</Label>
                <Select
                  value={draftVisibility}
                  onValueChange={(val) => setDraftVisibility(val as CompanyNoteVisibility)}
                >
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_NOTE_VISIBILITIES.map((item) => (
                      <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#8A641A] text-white hover:bg-[#725215]"
              disabled={!draft.trim() || add.isPending}
              onClick={() => add.mutate()}
            >
              {add.isPending ? "Adding…" : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
