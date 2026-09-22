import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
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
import {
  listGroupCatalogues,
  saveGroupMaster,
  searchGroupPartners,
  searchGuestsForGroup,
} from "@/packages/pms/lib/guest-group-detail.functions";
import {
  GROUP_MASTER_COPY,
  GROUP_TOUR_OPERATOR_COPY,
  canConfirmGroup,
} from "@/packages/pms/lib/guest-group-detail-workspace";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";

type GroupFormValues = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  specialRequests: string;
  groupTypeId: string;
  marketSegmentId: string;
  sourceCodeId: string;
  companyMasterId: string;
  travelAgentMasterId: string;
  primaryContactGuestId: string;
  primaryContactName: string;
  arrivalDate: string;
  departureDate: string;
  expectedPax: string;
  expectedRooms: string;
};

const EMPTY: GroupFormValues = {
  name: "",
  email: "",
  phone: "",
  notes: "",
  specialRequests: "",
  groupTypeId: "",
  marketSegmentId: "",
  sourceCodeId: "",
  companyMasterId: "",
  travelAgentMasterId: "",
  primaryContactGuestId: "",
  primaryContactName: "",
  arrivalDate: "",
  departureDate: "",
  expectedPax: "",
  expectedRooms: "",
};

export function GuestGroupFormDialog({
  restaurantId,
  open,
  onOpenChange,
  group,
  onSaved,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    specialRequests: string | null;
    groupTypeId: string | null;
    marketSegmentId: string | null;
    sourceCodeId: string | null;
    companyMasterId: string | null;
    travelAgentMasterId: string | null;
    primaryContactGuestId: string | null;
    primaryContactName: string | null;
    arrivalDate: string | null;
    departureDate: string | null;
    expectedPax: number | null;
    expectedRooms: number | null;
    accountStatus: string;
  } | null;
  onSaved?: ((groupId: string) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveGroupMaster);
  const loadCatalogues = useServerFn(listGroupCatalogues);
  const searchPartners = useServerFn(searchGroupPartners);
  const searchGuests = useServerFn(searchGuestsForGroup);
  const [form, setForm] = useState<GroupFormValues>(EMPTY);
  const [companyQuery, setCompanyQuery] = useState("");
  const [agencyQuery, setAgencyQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(
      group
        ? {
            name: group.name,
            email: group.email ?? "",
            phone: group.phone ?? "",
            notes: group.notes ?? "",
            specialRequests: group.specialRequests ?? "",
            groupTypeId: group.groupTypeId ?? "",
            marketSegmentId: group.marketSegmentId ?? "",
            sourceCodeId: group.sourceCodeId ?? "",
            companyMasterId: group.companyMasterId ?? "",
            travelAgentMasterId: group.travelAgentMasterId ?? "",
            primaryContactGuestId: group.primaryContactGuestId ?? "",
            primaryContactName: group.primaryContactName ?? "",
            arrivalDate: group.arrivalDate ?? "",
            departureDate: group.departureDate ?? "",
            expectedPax: group.expectedPax == null ? "" : String(group.expectedPax),
            expectedRooms: group.expectedRooms == null ? "" : String(group.expectedRooms),
          }
        : EMPTY,
    );
  }, [open, group]);

  const cataloguesQuery = useQuery({
    queryKey: ["group-catalogues", restaurantId],
    queryFn: () => loadCatalogues({ data: { restaurantId } }),
    enabled: open,
  });
  const companiesQuery = useQuery({
    queryKey: ["group-partner-company", restaurantId, companyQuery],
    queryFn: () => searchPartners({ data: { restaurantId, accountType: "company", q: companyQuery } }),
    enabled: open,
  });
  const agenciesQuery = useQuery({
    queryKey: ["group-partner-agency", restaurantId, agencyQuery],
    queryFn: () => searchPartners({ data: { restaurantId, accountType: "travel_agent", q: agencyQuery } }),
    enabled: open,
  });
  const contactsQuery = useQuery({
    queryKey: ["group-contact-guests", restaurantId, contactQuery],
    queryFn: () => searchGuests({ data: { restaurantId, q: contactQuery } }),
    enabled: open,
  });

  function payload(status: "pending" | "active") {
    return {
      name: form.name,
      email: form.email,
      phone: form.phone,
      notes: form.notes,
      specialRequests: form.specialRequests,
      groupTypeId: form.groupTypeId || null,
      marketSegmentId: form.marketSegmentId || null,
      sourceCodeId: form.sourceCodeId || null,
      companyMasterId: form.companyMasterId || null,
      travelAgentMasterId: form.travelAgentMasterId || null,
      primaryContactGuestId: form.primaryContactGuestId || null,
      primaryContactName: form.primaryContactName,
      arrivalDate: form.arrivalDate || null,
      departureDate: form.departureDate || null,
      expectedPax: form.expectedPax === "" ? null : Number(form.expectedPax),
      expectedRooms: form.expectedRooms === "" ? null : Number(form.expectedRooms),
      accountStatus: status,
    };
  }

  const mutation = useMutation({
    mutationFn: async (status: "pending" | "active") => {
      if (status === "active") {
        const error = canConfirmGroup({
          name: form.name,
          groupTypeId: form.groupTypeId || null,
          arrivalDate: form.arrivalDate || null,
          departureDate: form.departureDate || null,
        });
        if (error) throw new Error(error);
      }
      return save({
        data: {
          restaurantId,
          groupId: group?.id,
          account: payload(status),
        },
      });
    },
    onSuccess: (result, status) => {
      toast.success(status === "active" ? "Group confirmed." : group ? "Group saved." : "Draft group saved.");
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      void queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId] });
      onOpenChange(false);
      onSaved?.(result.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const types = (cataloguesQuery.data?.groupTypes ?? []).filter((row) => row.active || row.id === form.groupTypeId);
  const segments = (cataloguesQuery.data?.marketSegments ?? []).filter((row) => row.active || row.id === form.marketSegmentId);
  const sources = (cataloguesQuery.data?.sourceCodes ?? []).filter((row) => row.active || row.id === form.sourceCodeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="guest-group-form">
        <DialogHeader>
          <DialogTitle>{group ? "Edit group" : "New group"}</DialogTitle>
          <DialogDescription>{GROUP_MASTER_COPY}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="group-name">Group name</Label>
            <Input id="group-name" data-testid="group-name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Group type</Label>
              <Select value={form.groupTypeId} onValueChange={(value) => setForm((prev) => ({ ...prev, groupTypeId: value }))}>
                <SelectTrigger data-testid="group-type">
                  <SelectValue placeholder={types.length ? "Select type" : "No types configured"} />
                </SelectTrigger>
                <SelectContent>
                  {types.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="group-contact-name">Primary contact</Label>
              <Input
                id="group-contact-name"
                value={form.primaryContactName}
                onChange={(e) => setForm((prev) => ({ ...prev, primaryContactName: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Market segment</Label>
              <Select value={form.marketSegmentId || "none"} onValueChange={(value) => setForm((prev) => ({ ...prev, marketSegmentId: value === "none" ? "" : value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select market segment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {segments.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select value={form.sourceCodeId || "none"} onValueChange={(value) => setForm((prev) => ({ ...prev, sourceCodeId: value === "none" ? "" : value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {sources.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="group-arrival">Arrival</Label>
              <Input id="group-arrival" type="date" value={form.arrivalDate} onChange={(e) => setForm((prev) => ({ ...prev, arrivalDate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="group-departure">Departure</Label>
              <Input id="group-departure" type="date" value={form.departureDate} onChange={(e) => setForm((prev) => ({ ...prev, departureDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="group-pax">Expected guests</Label>
              <Input id="group-pax" type="number" min={0} value={form.expectedPax} onChange={(e) => setForm((prev) => ({ ...prev, expectedPax: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="group-rooms">Expected rooms</Label>
              <Input id="group-rooms" type="number" min={0} value={form.expectedRooms} onChange={(e) => setForm((prev) => ({ ...prev, expectedRooms: e.target.value }))} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="group-email">Email</Label>
              <Input id="group-email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="group-phone">Phone</Label>
              <Input id="group-phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Company</Label>
            <Input placeholder="Search companies" value={companyQuery} onChange={(e) => setCompanyQuery(e.target.value)} />
            <Select value={form.companyMasterId || "none"} onValueChange={(value) => setForm((prev) => ({ ...prev, companyMasterId: value === "none" ? "" : value }))}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(companiesQuery.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Travel agency</Label>
            <Input placeholder="Search travel agencies" value={agencyQuery} onChange={(e) => setAgencyQuery(e.target.value)} />
            <Select value={form.travelAgentMasterId || "none"} onValueChange={(value) => setForm((prev) => ({ ...prev, travelAgentMasterId: value === "none" ? "" : value }))}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select travel agency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(agenciesQuery.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{GROUP_TOUR_OPERATOR_COPY}</p>
          </div>
          <div>
            <Label>Link existing contact</Label>
            <Input placeholder="Search guests" value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} />
            <Select
              value={form.primaryContactGuestId || "none"}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  primaryContactGuestId: value === "none" ? "" : value,
                  primaryContactName:
                    value === "none"
                      ? prev.primaryContactName
                      : (contactsQuery.data ?? []).find((row) => row.id === value)?.name ?? prev.primaryContactName,
                }))
              }
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select guest contact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(contactsQuery.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="group-notes">Notes</Label>
            <Textarea id="group-notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="group-requests">Special requests</Label>
            <Textarea id="group-requests" value={form.specialRequests} onChange={(e) => setForm((prev) => ({ ...prev, specialRequests: e.target.value }))} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => mutation.mutate("pending")} disabled={mutation.isPending}>
            Save draft
          </Button>
          <Button type="button" onClick={() => mutation.mutate("active")} disabled={mutation.isPending}>
            Confirm group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
