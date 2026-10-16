import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { CanonicalPhoneInput } from "@/packages/pms/components/guests/canonical-phone-input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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
  type GroupMemberStatus,
} from "@/packages/pms/lib/guest-group-detail-workspace";
import { GUEST_PROFILE_DETAIL_PATH, guestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";

const ALL = "all";

type GroupMemberRow = {
  id: string;
  linkId: string;
  guestId: string;
  guestName: string;
  email: string | null;
  phone: string | null;
  role?: string;
  memberStatus: GroupMemberStatus;
  specialRequests: string | null;
  createdAt: string;
  reservationId: string | null;
  confirmationNumber?: string | null;
  roomId?: string | null;
  roomNumber?: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
};

export function GuestGroupMembersView({
  restaurantId,
  groupId,
  cancelled = false,
}: {
  restaurantId: string;
  groupId: string;
  cancelled?: boolean;
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

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [selectedMember, setSelectedMember] = useState<GroupMemberRow | null>(null);

  // Add Member Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<"link" | "create">("link");
  const [guestQuery, setGuestQuery] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Import Modal State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importResults, setImportResults] = useState<Array<{ row: number; result: string; error: string | null }>>([]);

  const membersQuery = useQuery({
    queryKey: ["group-members", restaurantId, groupId],
    queryFn: async () => {
      const res = await load({ data: { restaurantId, groupId } });
      return (res ?? []).map((m) => ({
        ...m,
        linkId: m.id,
        role: "member",
        arrivalDate: null,
        departureDate: null,
      })) as GroupMemberRow[];
    },
  });

  const guestsQuery = useQuery({
    queryKey: ["group-guest-search", restaurantId, guestQuery],
    queryFn: () => searchGuests({ data: { restaurantId, q: guestQuery } }),
    enabled: addModalOpen && addMode === "link" && Boolean(guestQuery.trim()),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["group-members", restaurantId, groupId] });
    void queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, groupId] });
    void queryClient.invalidateQueries({ queryKey: ["group-rooming", restaurantId, groupId] });
  }

  const addMutation = useMutation({
    mutationFn: () => addExisting({ data: { restaurantId, groupId, guestId: selectedGuestId } }),
    onSuccess: () => {
      toast.success("Member linked to group.");
      setSelectedGuestId("");
      setAddModalOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createGuest({
        data: {
          restaurantId,
          groupId,
          firstName,
          lastName,
          email: newEmail,
          phone: newPhone,
        },
      }),
    onSuccess: () => {
      toast.success("Guest registered and added to group.");
      setFirstName("");
      setLastName("");
      setNewEmail("");
      setNewPhone("");
      setAddModalOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: (variables: { linkId: string; status: GroupMemberStatus }) =>
      update({ data: { restaurantId, groupId, ...variables } }),
    onSuccess: () => {
      toast.success("Member status updated.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (linkId: string) => remove({ data: { restaurantId, groupId, linkId } }),
    onSuccess: () => {
      toast.success("Member removed from group.");
      if (selectedMember) setSelectedMember(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      preview({
        data: {
          restaurantId,
          groupId,
          csv: csvText,
          filename: "members.csv",
        },
      }),
    onSuccess: (result) => {
      setImportResults(result.rows);
      toast.info(`Previewed ${result.rows.length} rows.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      commit({
        data: {
          restaurantId,
          groupId,
          csv: csvText,
          filename: "members.csv",
        },
      }),
    onSuccess: (result) => {
      toast.success(`Imported ${result.imported} members.`);
      setImportModalOpen(false);
      setCsvText("");
      setImportResults([]);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const allMembers = membersQuery.data ?? [];
  const expectedCount = allMembers.filter((m) => m.memberStatus === "expected").length;
  const confirmedCount = allMembers.filter((m) => m.memberStatus === "confirmed").length;
  const cancelledCount = allMembers.filter((m) => m.memberStatus === "cancelled").length;

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMembers.filter((m) => {
      if (statusFilter !== ALL && m.memberStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        m.guestName.toLowerCase().includes(q) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.phone && m.phone.toLowerCase().includes(q)) ||
        (m.confirmationNumber && m.confirmationNumber.toLowerCase().includes(q)) ||
        (m.roomNumber && m.roomNumber.toLowerCase().includes(q))
      );
    });
  }, [allMembers, search, statusFilter]);

  return (
    <div className="space-y-6" data-testid="group-members-view">
      {/* Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-[#251605]">Group Members</h2>
          <p className="text-xs text-[#756A5B]">
            Guests linked to this group stay via group membership. Status changes apply to the group relationship.
          </p>
        </div>
        {!cancelled ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCsvText("");
                setImportResults([]);
                setImportModalOpen(true);
              }}
              className="gap-1.5 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
              data-testid="import-members-button"
            >
              <Upload className="size-3.5" />
              Import Members
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setAddModalOpen(true)}
              className="gap-1.5 bg-[#C89933] text-white hover:bg-[#8A641A] shadow-sm"
              data-testid="add-member-button"
            >
              <Plus className="size-3.5" />
              Add Member
            </Button>
          </div>
        ) : null}
      </div>

      {/* Summary Band */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="members-summary-band">
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 text-left shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Total Members</span>
          <p className="mt-1 font-display text-xl font-bold text-[#251605]">{allMembers.length}</p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 text-left shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Expected</span>
          <p className="mt-1 font-display text-xl font-bold text-amber-700">{expectedCount}</p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 text-left shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Confirmed</span>
          <p className="mt-1 font-display text-xl font-bold text-emerald-700">{confirmedCount}</p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 text-left shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-red-700">Cancelled</span>
          <p className="mt-1 font-display text-xl font-bold text-red-700">{cancelledCount}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#756A5B]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search member, email, phone, room…"
            className="h-9 border-[#DDD4C5] pl-9 text-xs focus-visible:ring-[#8A641A]"
            data-testid="members-search-input"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[130px] border-[#DDD4C5] text-xs" data-testid="members-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Statuses</SelectItem>
            <SelectItem value="expected">Expected</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        {search || statusFilter !== ALL ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatusFilter(ALL);
            }}
            className="h-9 gap-1 text-xs text-[#756A5B] hover:text-[#251605]"
          >
            <X className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </div>

      {/* Members Table */}
      <div className="overflow-hidden rounded-2xl border border-[#DDD4C5] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="group-members-table">
            <thead>
              <tr className="border-b border-[#DDD4C5] bg-[#F7F4EE] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                <th className="px-4 py-3">Guest Member</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Member Status</th>
                <th className="px-4 py-3">Reservation</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Stay Dates</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD4C5]/60">
              {membersQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-[#756A5B]">
                    No group members found.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr
                    key={member.linkId}
                    onClick={() => setSelectedMember(member)}
                    className="cursor-pointer transition-colors hover:bg-[#F7F4EE]/60"
                    data-testid={`member-row-${member.linkId}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#251605]">{member.guestName}</div>
                      <div className="text-[11px] text-[#756A5B]">Role: {member.role || "member"}</div>
                    </td>
                    <td className="px-4 py-3 text-[#756A5B]">
                      {member.email ? <div>{member.email}</div> : null}
                      {member.phone ? <div className="text-[11px]">{member.phone}</div> : null}
                      {!member.email && !member.phone ? "—" : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          member.memberStatus === "confirmed"
                            ? "default"
                            : member.memberStatus === "expected"
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {GROUP_MEMBER_STATUS_LABELS[member.memberStatus] ?? member.memberStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[#756A5B]">
                      {member.confirmationNumber ? (
                        <span className="font-mono text-emerald-700">{member.confirmationNumber}</span>
                      ) : (
                        <span className="text-[#756A5B] italic">No reservation</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#756A5B]">
                      {member.roomNumber ? (
                        <span className="font-medium text-[#251605]">Room {member.roomNumber}</span>
                      ) : (
                        <span className="text-amber-700">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#756A5B]">
                      {member.arrivalDate && member.departureDate
                        ? `${member.arrivalDate} → ${member.departureDate}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {!cancelled ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 text-[#756A5B] hover:text-[#251605]"
                              aria-label="Member options"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                updateMutation.mutate({
                                  linkId: member.linkId,
                                  status: "confirmed",
                                })
                              }
                            >
                              Mark Confirmed
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                updateMutation.mutate({
                                  linkId: member.linkId,
                                  status: "expected",
                                })
                              }
                            >
                              Mark Expected
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                updateMutation.mutate({
                                  linkId: member.linkId,
                                  status: "cancelled",
                                })
                              }
                            >
                              Mark Cancelled
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-700"
                              onClick={() => removeMutation.mutate(member.linkId)}
                            >
                              <Trash2 className="mr-2 size-3.5" />
                              Remove Member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member Quick View Drawer */}
      <Sheet open={Boolean(selectedMember)} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-l border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-2xl sm:max-w-md"
          data-testid="member-drawer"
        >
          {selectedMember ? (
            <>
              <SheetHeader className="border-b border-[#DDD4C5] bg-white px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SheetTitle className="font-display text-lg text-[#251605]">
                      {selectedMember.guestName}
                    </SheetTitle>
                    <p className="text-xs text-[#756A5B]">Group Member Details</p>
                  </div>
                  <Badge variant={selectedMember.memberStatus === "confirmed" ? "default" : "outline"}>
                    {GROUP_MEMBER_STATUS_LABELS[selectedMember.memberStatus]}
                  </Badge>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
                  <h4 className="font-semibold uppercase tracking-wider text-[#756A5B] text-[10px]">
                    Membership & Status
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[#756A5B]">Role in Group:</span>
                      <span className="font-medium text-[#251605]">{selectedMember.role || "Member"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#756A5B]">Relationship Status:</span>
                      <span className="font-medium text-[#251605]">
                        {GROUP_MEMBER_STATUS_LABELS[selectedMember.memberStatus]}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
                  <h4 className="font-semibold uppercase tracking-wider text-[#756A5B] text-[10px]">
                    Reservation & Room Assignment
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[#756A5B]">Confirmation:</span>
                      <span className="font-mono font-medium text-[#251605]">
                        {selectedMember.confirmationNumber ?? "Not linked"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#756A5B]">Assigned Room:</span>
                      <span className="font-medium text-[#251605]">
                        {selectedMember.roomNumber ? `Room ${selectedMember.roomNumber}` : "Unassigned"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#756A5B]">Stay Dates:</span>
                      <span className="text-[#251605]">
                        {selectedMember.arrivalDate && selectedMember.departureDate
                          ? `${selectedMember.arrivalDate} → ${selectedMember.departureDate}`
                          : "Not set"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
                  <h4 className="font-semibold uppercase tracking-wider text-[#756A5B] text-[10px]">
                    Contact Information
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Mail className="size-3.5 text-[#756A5B]" />
                      <span className="text-[#251605]">{selectedMember.email || "No email"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="size-3.5 text-[#756A5B]" />
                      <span className="text-[#251605]">{selectedMember.phone || "No phone"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <Link
                    to={GUEST_PROFILE_DETAIL_PATH}
                    params={{ guestId: selectedMember.guestId }}
                    search={guestProfileSearch({ type: "individual" })}
                    className="w-full"
                  >
                    <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 border-[#DDD4C5] text-[#251605]">
                      <ExternalLink className="size-3.5" />
                      Open Guest Profile
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Add / Link Member Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Add Group Member</DialogTitle>
            <DialogDescription className="text-xs text-[#756A5B]">
              Link an existing guest profile or register a new traveler for this group stay.
            </DialogDescription>
          </DialogHeader>

          <div className="flex border-b border-[#DDD4C5] mb-4">
            <button
              type="button"
              onClick={() => setAddMode("link")}
              className={`flex-1 pb-2 text-xs font-medium border-b-2 ${
                addMode === "link"
                  ? "border-[#C89933] text-[#251605]"
                  : "border-transparent text-[#756A5B]"
              }`}
            >
              Link Existing Guest
            </button>
            <button
              type="button"
              onClick={() => setAddMode("create")}
              className={`flex-1 pb-2 text-xs font-medium border-b-2 ${
                addMode === "create"
                  ? "border-[#C89933] text-[#251605]"
                  : "border-transparent text-[#756A5B]"
              }`}
            >
              Register New Traveler
            </button>
          </div>

          {addMode === "link" ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-[#756A5B]">Search Guest Profile</Label>
                <Input
                  value={guestQuery}
                  onChange={(e) => setGuestQuery(e.target.value)}
                  placeholder="Type name, email, or phone…"
                  className="mt-1 text-xs"
                />
              </div>

              {guestsQuery.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : (guestsQuery.data ?? []).length > 0 ? (
                <div className="max-h-48 overflow-y-auto divide-y divide-[#DDD4C5]/60 rounded-xl border border-[#DDD4C5]">
                  {(guestsQuery.data ?? []).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedGuestId(g.id)}
                      className={`w-full p-2.5 text-left text-xs transition-colors flex items-center justify-between ${
                        selectedGuestId === g.id ? "bg-[#C89933]/15 font-medium" : "hover:bg-[#F7F4EE]"
                      }`}
                    >
                      <div>
                        <p className="text-[#251605]">{g.name}</p>
                        <p className="text-[11px] text-[#756A5B]">{[g.email, g.phone].filter(Boolean).join(" · ")}</p>
                      </div>
                      {selectedGuestId === g.id ? <CheckCircle2 className="size-4 text-[#8A641A]" /> : null}
                    </button>
                  ))}
                </div>
              ) : guestQuery.trim() ? (
                <p className="text-xs text-[#756A5B] text-center py-4">No matching guest found.</p>
              ) : null}

              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setAddModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!selectedGuestId || addMutation.isPending}
                  onClick={() => addMutation.mutate()}
                  className="bg-[#C89933] text-white hover:bg-[#8A641A]"
                >
                  Link Member
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-[#756A5B]">First Name *</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-[#756A5B]">Last Name *</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 text-xs" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-[#756A5B]">Email</Label>
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="mt-1 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-[#756A5B]">Phone</Label>
                <div className="mt-1">
                  <CanonicalPhoneInput
                    value={newPhone}
                    onChange={(phone) => setNewPhone(phone)}
                    placeholder="e.g. 911 234 567"
                    size="sm"
                  />
                </div>
              </div>

              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setAddModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!firstName.trim() || !lastName.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                  className="bg-[#C89933] text-white hover:bg-[#8A641A]"
                >
                  Register & Link
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Members Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Import Group Members</DialogTitle>
            <DialogDescription className="text-xs text-[#756A5B]">
              Paste CSV text formatted as: <code>first_name,last_name,email,phone</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="first_name,last_name,email,phone&#10;Alice,Smith,alice@example.com,+1234567890"
              rows={5}
              className="text-xs font-mono"
            />

            {importResults.length > 0 ? (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-[#DDD4C5] p-3 text-xs space-y-1 bg-[#F7F4EE]">
                <p className="font-medium text-[#251605] mb-1">Preview Breakdown:</p>
                {importResults.map((r) => (
                  <div key={r.row} className="flex justify-between text-[11px]">
                    <span>Row {r.row}:</span>
                    <span className={r.error ? "text-red-700" : "text-emerald-700"}>
                      {r.result} {r.error ? `(${r.error})` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <DialogFooter className="mt-4 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setImportModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!csvText.trim() || previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
              >
                Preview CSV
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!csvText.trim() || commitMutation.isPending}
                onClick={() => commitMutation.mutate()}
                className="bg-[#C89933] text-white hover:bg-[#8A641A]"
              >
                Commit Import
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
