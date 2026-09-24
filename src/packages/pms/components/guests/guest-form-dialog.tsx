import { cloneElement, useEffect, useId, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Plus, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { cn } from "@/shared/lib/utils";
import { ID_DOCUMENT_LABELS, ID_DOCUMENT_TYPES } from "@/packages/pms/lib/fo-check-in";
import {
  createGuest,
  createGuestDocumentUpload,
  findGuestDuplicates,
  registerGuestDocument,
  updateGuest,
  type GuestProfile,
  type GuestSummary,
} from "@/packages/pms/lib/guests.functions";
import { linkGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { guestCreateBlocked } from "@/packages/pms/lib/pms-set3-rates-guest";
import { getPmsSet3Snapshot } from "@/packages/pms/lib/pms-set3-rates-guest.functions";
import {
  GUEST_GENDER_LABELS,
  GUEST_GENDERS,
  GUEST_TITLE_LABELS,
  GUEST_TITLES,
  INDIVIDUAL_EMERGENCY_COPY,
  INDIVIDUAL_PARTIAL_CREATE_COPY,
  INDIVIDUAL_STAGED_CREATE_COPY,
  RESTRICTION_SEVERITIES,
  RESTRICTION_SEVERITY_LABELS,
  validateEmergencyContacts,
  validateRestrictionReason,
  type GuestGender,
  type GuestTitle,
  type RestrictionSeverity,
} from "@/packages/pms/lib/guest-profile-individual";
import { GUEST_STATUSES, type GuestStatus } from "@/packages/pms/lib/guests.server";
import {
  GuestFormIdentityUpload,
  attachGuestDocumentFile,
} from "@/packages/pms/components/guests/guest-form-identity-upload";
import {
  GuestFormStagedIdentity,
  type StagedIdentityFile,
} from "@/packages/pms/components/guests/guest-form-staged-identity";
import {
  GuestFormStagedLinks,
  type StagedMasterLink,
} from "@/packages/pms/components/guests/guest-form-staged-links";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import {
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_METHODS,
  PREFERRED_CONTACT_TIME_LABELS,
  PREFERRED_CONTACT_TIMES,
  type PreferredContactMethod,
  type PreferredContactTime,
} from "@/packages/pms/lib/guest-profile-overview";

type EmergencyDraft = {
  name: string;
  relationship: string;
  phone: string;
  email: string;
};

export interface GuestFormValues {
  title: GuestTitle | "";
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  gender: GuestGender | "";
  dateOfBirth: string;
  nationality: string;
  language: string;
  vipStatus: boolean;
  guestStatus: GuestStatus;
  phone: string;
  phoneAlt: string;
  email: string;
  emailAlt: string;
  preferredContactMethod: PreferredContactMethod | "";
  preferredContactTime: PreferredContactTime | "";
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  idDocumentType: "" | "passport" | "national_id" | "driving_licence" | "other";
  idDocumentNumber: string;
  idDocumentExpiry: string;
  position: string;
  department: string;
  notes: string;
  sourceOfBusiness: string;
  restricted: boolean;
  blacklisted: boolean;
  restrictionSeverity: RestrictionSeverity | "";
  restrictionReason: string;
  restrictionUntil: string;
  emergencyContacts: EmergencyDraft[];
}

const EMPTY_CONTACT: EmergencyDraft = { name: "", relationship: "", phone: "", email: "" };

const EMPTY: GuestFormValues = {
  title: "",
  firstName: "",
  middleName: "",
  lastName: "",
  preferredName: "",
  gender: "",
  dateOfBirth: "",
  nationality: "",
  language: "",
  vipStatus: false,
  guestStatus: "active",
  phone: "",
  phoneAlt: "",
  email: "",
  emailAlt: "",
  preferredContactMethod: "",
  preferredContactTime: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  country: "",
  postalCode: "",
  idDocumentType: "",
  idDocumentNumber: "",
  idDocumentExpiry: "",
  position: "",
  department: "",
  notes: "",
  sourceOfBusiness: "",
  restricted: false,
  blacklisted: false,
  restrictionSeverity: "",
  restrictionReason: "",
  restrictionUntil: "",
  emergencyContacts: [{ ...EMPTY_CONTACT }],
};

function fromProfile(guest: GuestProfile): GuestFormValues {
  const contacts =
    guest.emergencyContacts.length > 0
      ? guest.emergencyContacts.map((contact) => ({
          name: contact.name,
          relationship: contact.relationship ?? "",
          phone: contact.phone ?? "",
          email: contact.email ?? "",
        }))
      : [{ ...EMPTY_CONTACT }];
  return {
    title: guest.title ?? "",
    firstName: guest.firstName,
    middleName: guest.middleName ?? "",
    lastName: guest.lastName ?? "",
    preferredName: guest.preferredName ?? "",
    gender: guest.gender ?? "",
    dateOfBirth: guest.dateOfBirth ?? "",
    nationality: guest.nationality ?? "",
    language: guest.language ?? "",
    vipStatus: guest.vipStatus,
    guestStatus: guest.guestStatus,
    phone: guest.phone ?? "",
    phoneAlt: guest.phoneAlt ?? "",
    email: guest.email ?? "",
    emailAlt: guest.emailAlt ?? "",
    preferredContactMethod: (guest.preferredContactMethod as PreferredContactMethod | null) ?? "",
    preferredContactTime: (guest.preferredContactTime as PreferredContactTime | null) ?? "",
    addressLine1: guest.addressLine1 ?? "",
    addressLine2: guest.addressLine2 ?? "",
    city: guest.city ?? "",
    region: guest.region ?? "",
    country: guest.country ?? "",
    postalCode: guest.postalCode ?? "",
    idDocumentType: guest.idDocumentType ?? "",
    idDocumentNumber: guest.idDocumentNumber ?? "",
    idDocumentExpiry: guest.idDocumentExpiry ?? "",
    position: guest.position ?? "",
    department: guest.department ?? "",
    notes: guest.notes ?? "",
    sourceOfBusiness: guest.sourceOfBusiness ?? "",
    restricted: guest.restricted,
    blacklisted: guest.blacklisted,
    restrictionSeverity: guest.restrictionSeverity ?? "",
    restrictionReason: guest.restrictionReason ?? "",
    restrictionUntil: guest.restrictionUntil ?? "",
    emergencyContacts: contacts,
  };
}

function Section({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-border"
      data-testid={`individual-section-${id}`}
      data-open={open ? "true" : "false"}
    >
      <CollapsibleTrigger
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
        data-testid={`individual-section-${id}-toggle`}
      >
        {title}
        <ChevronDown className={cn("size-4 transition-transform", open ? "rotate-180" : "")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 border-t border-border px-3 py-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function GuestFormDialog({
  restaurantId,
  open,
  onOpenChange,
  guest,
  onSaved,
  onOpenExisting,
  onMergeRequested,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing guest. */
  guest?: GuestProfile | null;
  onSaved?: (guestId: string) => void;
  /** Called when staff choose an existing duplicate instead of creating a new guest. */
  onOpenExisting?: (guestId: string) => void;
  /** Optional Wave 2 merge entry — still requires a separate confirm dialog. */
  onMergeRequested?: (duplicateId: string) => void;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createGuest);
  const update = useServerFn(updateGuest);
  const checkDuplicates = useServerFn(findGuestDuplicates);
  const startUpload = useServerFn(createGuestDocumentUpload);
  const registerDocument = useServerFn(registerGuestDocument);
  const submitLink = useServerFn(linkGuestAccount);
  const loadRules = useServerFn(getPmsSet3Snapshot);
  const rulesQuery = useQuery({
    queryKey: ["pms-set3-snapshot", restaurantId],
    queryFn: () => loadRules({ data: { restaurantId } }),
    retry: false,
    enabled: open,
  });
  const savedRules = rulesQuery.data?.snapshot.guestRules.savedAt
    ? rulesQuery.data.snapshot.guestRules
    : null;

  const [form, setForm] = useState<GuestFormValues>(EMPTY);
  const [duplicates, setDuplicates] = useState<GuestSummary[] | null>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedIdentityFile[]>([]);
  const [stagedLinks, setStagedLinks] = useState<StagedMasterLink[]>([]);
  const [createdGuestId, setCreatedGuestId] = useState<string | null>(null);
  const [followupErrors, setFollowupErrors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setForm(guest ? fromProfile(guest) : EMPTY);
      setDuplicates(null);
      setStagedFiles([]);
      setStagedLinks([]);
      setCreatedGuestId(null);
      setFollowupErrors([]);
    }
  }, [open, guest]);

  function set<K extends keyof GuestFormValues>(key: K, value: GuestFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setContact(index: number, key: keyof EmergencyDraft, value: string) {
    setForm((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.map((contact, i) =>
        i === index ? { ...contact, [key]: value } : contact,
      ),
    }));
  }

  const payload = {
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone,
    email: form.email,
    nationality: form.nationality,
    language: form.language,
    dateOfBirth: form.dateOfBirth,
    addressLine1: form.addressLine1,
    addressLine2: form.addressLine2,
    city: form.city,
    region: form.region,
    country: form.country,
    postalCode: form.postalCode,
    idDocumentType: form.idDocumentType || null,
    idDocumentNumber: form.idDocumentNumber,
    idDocumentExpiry: form.idDocumentExpiry,
    vipStatus: form.vipStatus,
    notes: form.notes,
    title: form.title || null,
    middleName: form.middleName,
    preferredName: form.preferredName,
    gender: form.gender || null,
    phoneAlt: form.phoneAlt,
    emailAlt: form.emailAlt,
    preferredContactMethod: form.preferredContactMethod || null,
    preferredContactTime: form.preferredContactTime || null,
    position: form.position,
    department: form.department,
    sourceOfBusiness: form.sourceOfBusiness,
    guestStatus: form.guestStatus,
    restricted: form.restricted,
    blacklisted: form.blacklisted,
    restrictionSeverity: form.restrictionSeverity || null,
    restrictionReason: form.restrictionReason,
    restrictionUntil: form.restrictionUntil,
    emergencyContacts: form.emergencyContacts,
  };

  async function applyStagedFollowups(guestId: string) {
    const remainingFiles: StagedIdentityFile[] = [];
    const remainingLinks: StagedMasterLink[] = [];
    const errors: string[] = [];

    for (const item of stagedFiles) {
      const attached = await attachGuestDocumentFile({
        restaurantId,
        guestId,
        file: item.file,
        kind: item.kind,
        startUpload,
        register: registerDocument,
      });
      if (!attached.ok) {
        remainingFiles.push(item);
        errors.push(attached.message);
      }
    }

    for (const item of stagedLinks) {
      try {
        await submitLink({
          data: { restaurantId, guestId, accountId: item.masterId, role: item.role },
        });
      } catch (error) {
        remainingLinks.push(item);
        errors.push(error instanceof Error ? error.message : "Link failed.");
      }
    }

    setStagedFiles(remainingFiles);
    setStagedLinks(remainingLinks);
    setFollowupErrors(errors);
    return errors.length === 0;
  }

  const save = useMutation({
    mutationFn: async () => {
      if (guest) {
        await update({ data: { restaurantId, guestId: guest.id, guest: payload } });
        return { id: guest.id, complete: true as const };
      }
      const guestId = createdGuestId
        ? createdGuestId
        : (await create({ data: { restaurantId, guest: payload } })).id;
      setCreatedGuestId(guestId);
      const complete = await applyStagedFollowups(guestId);
      return { id: guestId, complete };
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-documents", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId] });
      if (!result.complete) {
        toast.error(INDIVIDUAL_PARTIAL_CREATE_COPY);
        return;
      }
      toast.success(guest ? "Guest updated." : "Guest created.");
      onOpenChange(false);
      onSaved?.(result.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (createdGuestId) return [] as GuestSummary[];
      if (form.firstName.trim() === "") throw new Error("First name is required.");
      const emergencyError = validateEmergencyContacts(form.emergencyContacts);
      if (emergencyError) throw new Error(emergencyError);
      const restrictionError = validateRestrictionReason(
        form.restricted,
        form.blacklisted,
        form.restrictionReason,
      );
      if (restrictionError) throw new Error(restrictionError);
      const rulesBlock = guestCreateBlocked(savedRules, form);
      if (rulesBlock) throw new Error(rulesBlock);
      const matches = await checkDuplicates({
        data: {
          restaurantId,
          email: form.email,
          phone: form.phone,
          ...(guest ? { excludeGuestId: guest.id } : {}),
        },
      });
      return matches;
    },
    onSuccess: (matches) => {
      if (matches.length > 0) {
        setDuplicates(matches);
        return;
      }
      save.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = submit.isPending || save.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="guest-form">
        <DialogHeader>
          <DialogTitle>{guest ? "Edit guest" : "New guest"}</DialogTitle>
          <DialogDescription>
            {savedRules
              ? "First name plus a phone number or email address are required after guest rules were saved."
              : "Only a first name is required — walk-in guests often have incomplete details."}
          </DialogDescription>
        </DialogHeader>

        {duplicates && duplicates.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4" /> Possible existing guest
            </p>
            <p className="text-sm text-muted-foreground">
              A guest with this email or phone already exists at this property. Nothing is merged
              automatically — open the existing guest, or continue and create a separate profile.
              Merge is optional and always asks for an explicit confirm.
            </p>
            <ul className="space-y-2">
              {duplicates.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{d.fullName}</span>{" "}
                    <span className="text-muted-foreground">
                      {[d.phone, d.email].filter(Boolean).join(" · ") || "No contact details"}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {onOpenExisting ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false);
                          onOpenExisting(d.id);
                        }}
                      >
                        Open existing guest
                      </Button>
                    ) : null}
                    {guest && onMergeRequested ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false);
                          onMergeRequested(d.id);
                        }}
                      >
                        Merge…
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDuplicates(null)}>
                Back to form
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={busy}>
                Create anyway
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3" data-testid="individual-form-sections">
          <Section id="basic" title="Basic" defaultOpen>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Title</Label>
                <Select
                  value={form.title || "__none"}
                  onValueChange={(value) => set("title", value === "__none" ? "" : (value as GuestTitle))}
                >
                  <SelectTrigger data-testid="individual-title">
                    <SelectValue placeholder="Not recorded" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not recorded</SelectItem>
                    {GUEST_TITLES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {GUEST_TITLE_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field label="First name" required>
                <Input
                  data-testid="individual-first-name"
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                />
              </Field>
              <Field label="Middle name">
                <Input
                  data-testid="individual-middle-name"
                  value={form.middleName}
                  onChange={(e) => set("middleName", e.target.value)}
                />
              </Field>
              <Field label="Last name" required={Boolean(savedRules?.requiredFields.lastName)}>
                <Input
                  data-testid="individual-last-name"
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                />
              </Field>
              <Field label="Preferred name">
                <Input
                  data-testid="individual-preferred-name"
                  value={form.preferredName}
                  onChange={(e) => set("preferredName", e.target.value)}
                />
              </Field>
              <div>
                <Label>Gender</Label>
                <Select
                  value={form.gender || "__none"}
                  onValueChange={(value) =>
                    set("gender", value === "__none" ? "" : (value as GuestGender))
                  }
                >
                  <SelectTrigger data-testid="individual-gender">
                    <SelectValue placeholder="Not recorded" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not recorded</SelectItem>
                    {GUEST_GENDERS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {GUEST_GENDER_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field label="Date of birth">
                <Input
                  type="date"
                  data-testid="individual-dob"
                  value={form.dateOfBirth}
                  onChange={(e) => set("dateOfBirth", e.target.value)}
                />
              </Field>
              <Field label="Nationality">
                <Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
              </Field>
              <Field label="Language">
                <Input value={form.language} onChange={(e) => set("language", e.target.value)} />
              </Field>
              <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <Label htmlFor="guest-vip">VIP guest</Label>
                <Switch
                  id="guest-vip"
                  checked={form.vipStatus}
                  onCheckedChange={(v) => set("vipStatus", v)}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={form.guestStatus}
                  onValueChange={(value) => set("guestStatus", value as GuestStatus)}
                >
                  <SelectTrigger data-testid="individual-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GUEST_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status === "active" ? "Active" : "Inactive"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          <Section id="contact" title="Contact">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Primary phone" required={Boolean(savedRules)}>
                <Input
                  data-testid="individual-phone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label="Alternate phone">
                <Input
                  data-testid="individual-phone-alt"
                  value={form.phoneAlt}
                  onChange={(e) => set("phoneAlt", e.target.value)}
                />
              </Field>
              <Field label="Primary email" required={Boolean(savedRules)}>
                <Input
                  type="email"
                  data-testid="individual-email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
              <Field label="Alternate email">
                <Input
                  type="email"
                  data-testid="individual-email-alt"
                  value={form.emailAlt}
                  onChange={(e) => set("emailAlt", e.target.value)}
                />
              </Field>
              <div>
                <Label>Preferred contact</Label>
                <Select
                  value={form.preferredContactMethod || "__none"}
                  onValueChange={(value) =>
                    set(
                      "preferredContactMethod",
                      value === "__none" ? "" : (value as PreferredContactMethod),
                    )
                  }
                >
                  <SelectTrigger data-testid="individual-preferred-contact">
                    <SelectValue placeholder="Not recorded" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not recorded</SelectItem>
                    {PREFERRED_CONTACT_METHODS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {PREFERRED_CONTACT_METHOD_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Preferred time</Label>
                <Select
                  value={form.preferredContactTime || "__none"}
                  onValueChange={(value) =>
                    set(
                      "preferredContactTime",
                      value === "__none" ? "" : (value as PreferredContactTime),
                    )
                  }
                >
                  <SelectTrigger data-testid="individual-preferred-time">
                    <SelectValue placeholder="Not recorded" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not recorded</SelectItem>
                    {PREFERRED_CONTACT_TIMES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {PREFERRED_CONTACT_TIME_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          <Section id="address" title="Address">
            <Field label="Address line 1">
              <Input
                data-testid="individual-address-line1"
                value={form.addressLine1}
                onChange={(e) => set("addressLine1", e.target.value)}
              />
            </Field>
            <Field label="Address line 2">
              <Input
                data-testid="individual-address-line2"
                value={form.addressLine2}
                onChange={(e) => set("addressLine2", e.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="City">
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="Region / state">
                <Input value={form.region} onChange={(e) => set("region", e.target.value)} />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
              </Field>
              <Field label="Postal code">
                <Input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section id="identity" title="Identity">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>ID type</Label>
                <Select
                  value={form.idDocumentType || "none"}
                  onValueChange={(value) =>
                    set(
                      "idDocumentType",
                      value === "none" ? "" : (value as GuestFormValues["idDocumentType"]),
                    )
                  }
                >
                  <SelectTrigger data-testid="individual-id-type">
                    <SelectValue placeholder="Not recorded" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not recorded</SelectItem>
                    {ID_DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {ID_DOCUMENT_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field label="ID number">
                <Input
                  data-testid="individual-id-number"
                  value={form.idDocumentNumber}
                  onChange={(e) => set("idDocumentNumber", e.target.value)}
                />
              </Field>
              <Field label="ID expiry">
                <Input
                  type="date"
                  data-testid="individual-id-expiry"
                  value={form.idDocumentExpiry}
                  onChange={(e) => set("idDocumentExpiry", e.target.value)}
                />
              </Field>
            </div>
            {guest ? (
              <GuestFormIdentityUpload restaurantId={restaurantId} guestId={guest.id} />
            ) : (
              <GuestFormStagedIdentity files={stagedFiles} onChange={setStagedFiles} />
            )}
          </Section>

          <Section id="employment" title="Employment">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Position">
                <Input
                  data-testid="individual-position"
                  value={form.position}
                  onChange={(e) => set("position", e.target.value)}
                />
              </Field>
              <Field label="Department">
                <Input
                  data-testid="individual-department"
                  value={form.department}
                  onChange={(e) => set("department", e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section id="emergency" title="Emergency">
            <p className="text-xs text-muted-foreground">{INDIVIDUAL_EMERGENCY_COPY}</p>
            {form.emergencyContacts.map((contact, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-xl border border-border p-3"
                data-testid="individual-emergency-row"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Contact {index + 1}</p>
                  {form.emergencyContacts.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="individual-emergency-remove"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          emergencyContacts: prev.emergencyContacts.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name">
                    <Input
                      data-testid="individual-emergency-name"
                      value={contact.name}
                      onChange={(e) => setContact(index, "name", e.target.value)}
                    />
                  </Field>
                  <Field label="Relationship">
                    <Input
                      data-testid="individual-emergency-relationship"
                      value={contact.relationship}
                      onChange={(e) => setContact(index, "relationship", e.target.value)}
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      data-testid="individual-emergency-phone"
                      value={contact.phone}
                      onChange={(e) => setContact(index, "phone", e.target.value)}
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      data-testid="individual-emergency-email"
                      value={contact.email}
                      onChange={(e) => setContact(index, "email", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              data-testid="individual-emergency-add"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  emergencyContacts: [...prev.emergencyContacts, { ...EMPTY_CONTACT }],
                }))
              }
            >
              <Plus className="size-4" />
              Add emergency contact
            </Button>
          </Section>

          <Section id="notes" title="Notes">
            <Field label="Notes">
              <Textarea
                rows={3}
                data-testid="individual-notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
            <Field label="Source of business">
              <Input
                data-testid="individual-source-of-business"
                value={form.sourceOfBusiness}
                onChange={(e) => set("sourceOfBusiness", e.target.value)}
              />
            </Field>
          </Section>

          <Section id="restrictions" title="Restrictions">
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <Label htmlFor="guest-restricted">Restricted</Label>
              <Switch
                id="guest-restricted"
                data-testid="individual-restricted"
                checked={form.restricted}
                onCheckedChange={(v) => set("restricted", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <Label htmlFor="guest-blacklisted">Blacklisted</Label>
              <Switch
                id="guest-blacklisted"
                data-testid="individual-blacklisted"
                checked={form.blacklisted}
                onCheckedChange={(v) => set("blacklisted", v)}
              />
            </div>
            <div>
              <Label>Severity</Label>
              <Select
                value={form.restrictionSeverity || "__none"}
                onValueChange={(value) =>
                  set(
                    "restrictionSeverity",
                    value === "__none" ? "" : (value as RestrictionSeverity),
                  )
                }
              >
                <SelectTrigger data-testid="individual-restriction-severity">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Optional</SelectItem>
                  {RESTRICTION_SEVERITIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {RESTRICTION_SEVERITY_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Reason">
              <Textarea
                rows={2}
                data-testid="individual-restriction-reason"
                value={form.restrictionReason}
                onChange={(e) => set("restrictionReason", e.target.value)}
              />
            </Field>
            <Field label="Until">
              <Input
                type="date"
                data-testid="individual-restriction-until"
                value={form.restrictionUntil}
                onChange={(e) => set("restrictionUntil", e.target.value)}
              />
            </Field>
          </Section>

          {guest ? null : (
            <Section id="linking" title="Linking">
              <p className="text-xs text-muted-foreground">{INDIVIDUAL_STAGED_CREATE_COPY}</p>
              <GuestFormStagedLinks
                restaurantId={restaurantId}
                links={stagedLinks}
                onChange={setStagedLinks}
              />
            </Section>
          )}
        </div>

        {createdGuestId && followupErrors.length > 0 ? (
          <div
            className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
            data-testid="individual-create-partial-failure"
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4" /> Guest created — remaining work failed
            </p>
            <p className="text-sm text-muted-foreground">{INDIVIDUAL_PARTIAL_CREATE_COPY}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {followupErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                data-testid="individual-create-retry"
                onClick={() => save.mutate()}
                disabled={busy}
              >
                Retry remaining
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="individual-create-open-profile"
                onClick={() => {
                  onOpenChange(false);
                  onSaved?.(createdGuestId);
                }}
              >
                Open guest
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button data-testid="guest-form-save" onClick={() => submit.mutate()} disabled={busy}>
            {busy
              ? "Saving…"
              : guest
                ? "Save changes"
                : createdGuestId
                  ? "Retry remaining"
                  : "Create guest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {cloneElement(children, { id })}
    </div>
  );
}
