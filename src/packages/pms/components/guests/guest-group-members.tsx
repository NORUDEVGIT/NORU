import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
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
  addGroupMember,
  confirmGroupMemberImport,
  createGroupMemberGuest,
  listGroupMembers,
  previewGroupMemberImport,
  removeGroupMember,
  searchGuestsForGroup,
  updateGroupMember,
} from "@/packages/pms/lib/guest-group-detail.functions";
import {
  GROUP_MEMBER_STATUSES,
  GROUP_MEMBER_STATUS_LABELS,
} from "@/packages/pms/lib/guest-group-detail-workspace";
import { GUEST_PROFILE_DETAIL_PATH, guestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";

export function GuestGroupMembers({
  restaurantId,
  groupId,
}: {
  restaurantId: string;
  groupId: string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listGroupMembers);
  const searchGuests = useServerFn(searchGuestsForGroup);
  const addExisting = useServerFn(addGroupMember);
  const createGuest = useServerFn(createGroupMemberGuest);
  const update = useServerFn(updateGroupMember);
  const remove = useServerFn(removeGroupMember);
  const preview = useServerFn(previewGroupMemberImport);
  const commit = useServerFn(confirmGroupMemberImport);
  const [guestQuery, setGuestQuery] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("members.csv");
  const [previewRows, setPreviewRows] = useState<Array<{ row: number; result: string; error: string | null }>>([]);

  const membersQuery = useQuery({
    queryKey: ["group-members", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
  });
  const guestsQuery = useQuery({
    queryKey: ["group-guest-search", restaurantId, guestQuery],
    queryFn: () => searchGuests({ data: { restaurantId, q: guestQuery } }),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["group-members", restaurantId, groupId] });
    void queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, groupId] });
  }

  const addMutation = useMutation({
    mutationFn: () => addExisting({ data: { restaurantId, groupId, guestId: selectedGuestId } }),
    onSuccess: () => {
      toast.success("Member added.");
      setSelectedGuestId("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createGuest({ data: { restaurantId, groupId, firstName, lastName, email, phone } }),
    onSuccess: () => {
      toast.success("Guest created and added.");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeMutation = useMutation({
    mutationFn: (linkId: string) => remove({ data: { restaurantId, groupId, linkId } }),
    onSuccess: () => {
      toast.success("Member removed from group.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const previewMutation = useMutation({
    mutationFn: () => preview({ data: { restaurantId, groupId, filename, csv } }),
    onSuccess: (result) => {
      setPreviewRows(result.rows.map((row) => ({ row: row.row, result: row.result, error: row.error })));
      toast.success("Import preview ready.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const importMutation = useMutation({
    mutationFn: () => commit({ data: { restaurantId, groupId, filename, csv } }),
    onSuccess: (result) => {
      toast.success(`Imported ${result.imported}. Matched ${result.matched}, created ${result.created}, duplicate ${result.duplicate}, failed ${result.failed}.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const members = membersQuery.data ?? [];

  return (
    <div className="space-y-6" data-testid="group-members">
      <div>
        <h2 className="font-display text-xl">Members</h2>
        <p className="text-sm text-muted-foreground">
          Members reference Guest Profiles. Removing a member unlinks them from the group only.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-medium">Add existing guest</h3>
          <Input placeholder="Search guests" value={guestQuery} onChange={(e) => setGuestQuery(e.target.value)} />
          <Select value={selectedGuestId} onValueChange={setSelectedGuestId}>
            <SelectTrigger>
              <SelectValue placeholder="Select guest" />
            </SelectTrigger>
            <SelectContent>
              {(guestsQuery.data ?? []).map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" disabled={!selectedGuestId || addMutation.isPending} onClick={() => addMutation.mutate()}>
            Add member
          </Button>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-medium">Create guest</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Button type="button" disabled={!firstName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
            Create and add
          </Button>
        </div>
      </div>
      <div className="rounded-2xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reservation</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <Link to={GUEST_PROFILE_DETAIL_PATH} params={{ guestId: member.guestId }} search={guestProfileSearch({ type: "individual" })}>
                    {member.guestName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{[member.email, member.phone].filter(Boolean).join(" · ")}</p>
                </TableCell>
                <TableCell>
                  <Select
                    value={member.memberStatus}
                    onValueChange={(value) =>
                      update({ data: { restaurantId, groupId, linkId: member.id, memberStatus: value as (typeof GROUP_MEMBER_STATUSES)[number] } }).then(invalidate)
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUP_MEMBER_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {GROUP_MEMBER_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{member.reservationId ? "Linked" : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" onClick={() => removeMutation.mutate(member.id)}>
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No members yet. The group draft can be saved without members.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="group-member-import">
        <h3 className="font-medium">Import members</h3>
        <p className="text-sm text-muted-foreground">
          CSV headers: first_name, last_name, email, phone, special_requests. Matching uses existing Guest Profiles.
        </p>
        <Label htmlFor="group-import-file">CSV</Label>
        <Input
          id="group-import-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setFilename(file.name);
            void file.text().then(setCsv);
          }}
        />
        <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} placeholder="first_name,last_name,email,phone" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!csv.trim() || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
            Preview
          </Button>
          <Button type="button" disabled={!csv.trim() || importMutation.isPending} onClick={() => importMutation.mutate()}>
            Commit import
          </Button>
        </div>
        {previewRows.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {previewRows.map((row) => (
              <Badge key={`${row.row}-${row.result}`} variant={row.result === "failed" || row.result === "duplicate" ? "secondary" : "outline"}>
                Row {row.row}: {row.result}
                {row.error ? ` — ${row.error}` : ""}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
