/**
 * Guest Services → Guest Agreement configuration.
 * Check-in still reads the published version through getCheckInAgreement.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Plus, ScrollText } from "lucide-react";
import { toast } from "sonner";

import {
  createGuestAgreementVersion,
  getGuestAgreementConfiguration,
  publishGuestAgreementVersion,
  updateGuestAgreementDraft,
} from "@/packages/pms/lib/guest-agreement.functions";
import { copyGuestAgreementPackage } from "@/packages/pms/lib/guest-agreement-config";
import type {
  GuestAgreementAcknowledgementDef,
  GuestAgreementPackage,
  GuestAgreementSection,
} from "@/packages/pms/lib/guest-agreement-config";
import {
  enabledAgreementCount,
  formatGuestAgreementPublishedAt,
  GUEST_AGREEMENT_MANAGER_ONLY,
  GUEST_AGREEMENT_PAGE_SUBTITLE,
  GUEST_AGREEMENT_PAGE_TITLE,
  GUEST_AGREEMENT_PREVIEW_NOTE,
  GUEST_AGREEMENT_PROPERTY_SETUP_HELP,
  GUEST_AGREEMENT_PUBLISH_POINTS,
  GUEST_AGREEMENT_PUBLISH_TITLE,
  GUEST_AGREEMENT_READONLY,
  GUEST_AGREEMENT_REMOVE_ACKNOWLEDGEMENT,
  GUEST_AGREEMENT_REMOVE_SECTION,
  guestAgreementActionFailure,
  guestAgreementActionState,
  guestAgreementCanMutate,
  guestAgreementHistoryStatus,
  guestAgreementVersionDetail,
  isStructuredAgreementVersion,
  previewGuestAgreement,
  propertySetupTimeWarning,
  reorderGuestAgreementItems,
  type GuestAgreementConfiguration,
  type GuestAgreementVersionView,
} from "@/packages/pms/lib/guest-agreement-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

const cardClass = "rounded-2xl border border-[#DDD4C5] bg-white p-4 shadow-sm";
const goldButton = "bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 focus-visible:ring-[#C89933]";

function newItemId(kind: "section" | "ack"): string {
  const token = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  return `${kind}_${token}`.replace(/-/g, "").slice(0, 40);
}

function sorted<T extends { displayOrder: number }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => left.displayOrder - right.displayOrder);
}

export function GuestAgreementWorkspace({
  restaurantId,
  role,
}: {
  restaurantId: string;
  role: string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getGuestAgreementConfiguration);
  const createVersion = useServerFn(createGuestAgreementVersion);
  const saveDraft = useServerFn(updateGuestAgreementDraft);
  const publishVersion = useServerFn(publishGuestAgreementVersion);
  const canManage = guestAgreementCanMutate(role);
  const queryKey = ["guest-agreement-configuration", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });
  const configuration = (query.data ?? null) as GuestAgreementConfiguration | null;
  const [local, setLocal] = useState<GuestAgreementPackage | null>(null);
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    | { kind: "section"; section: GuestAgreementSection }
    | { kind: "acknowledgement"; item: GuestAgreementAcknowledgementDef }
    | null
  >(null);
  const [removeTarget, setRemoveTarget] = useState<{
    kind: "section" | "acknowledgement";
    id: string;
    title: string;
  } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  useEffect(() => {
    const draft = configuration?.draft;
    if (!draft?.agreement) {
      if (loadedDraftId !== null) {
        setLocal(null);
        setLoadedDraftId(null);
      }
      return;
    }
    if (draft.id !== loadedDraftId) {
      setLocal(copyGuestAgreementPackage(draft.agreement));
      setLoadedDraftId(draft.id);
    }
  }, [configuration, loadedDraftId]);

  const actions = guestAgreementActionState(role, Boolean(configuration?.draft));
  const timeWarning = configuration
    ? propertySetupTimeWarning(configuration.checkInTime, configuration.checkOutTime)
    : null;
  const viewed =
    configuration && viewId ? guestAgreementVersionDetail(configuration, viewId) : null;

  function fail(error: unknown) {
    const message = guestAgreementActionFailure(error);
    setFeedback(message);
    toast.error(message);
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey });
  }

  const createMutation = useMutation({
    mutationFn: () => createVersion({ data: { restaurantId } }),
    onSuccess: async () => {
      setFeedback("New draft created. The active agreement is unchanged.");
      toast.success("New draft created.");
      await refresh();
    },
    onError: fail,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!configuration?.draft || !local) throw new Error("Create a guest agreement draft first.");
      return saveDraft({
        data: {
          restaurantId,
          versionId: configuration.draft.id,
          agreement: copyGuestAgreementPackage(local),
        },
      });
    },
    onSuccess: async () => {
      setFeedback("Draft saved. Check-in still uses the active agreement.");
      toast.success("Draft saved.");
      await refresh();
    },
    onError: fail,
  });

  const publishMutation = useMutation({
    mutationFn: () => {
      if (!configuration?.draft)
        throw new Error("Create a guest agreement draft before publishing.");
      return publishVersion({ data: { restaurantId, versionId: configuration.draft.id } });
    },
    onSuccess: async () => {
      setPublishOpen(false);
      setFeedback("Guest Agreement published.");
      toast.success("Guest Agreement published.");
      await refresh();
    },
    onError: (error) => {
      setPublishOpen(false);
      fail(error);
    },
  });

  function updateLocal(next: GuestAgreementPackage) {
    setLocal(next);
  }

  return (
    <div className="space-y-6 bg-[#FBF7F1] p-1" data-testid="guest-agreement-workspace">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#C89933]">
            Guest Services
          </p>
          <h1 className="font-display text-2xl text-[#251605] sm:text-3xl">
            {GUEST_AGREEMENT_PAGE_TITLE}
          </h1>
          <p className="max-w-2xl text-sm text-[#251605]/70">{GUEST_AGREEMENT_PAGE_SUBTITLE}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className={goldButton}
            data-testid="guest-agreement-create"
            disabled={!actions.create || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create New Version
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="guest-agreement-save"
            disabled={!actions.save || !local || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save Draft
          </Button>
          <Button
            type="button"
            className={goldButton}
            data-testid="guest-agreement-publish"
            disabled={!actions.publish || publishMutation.isPending}
            onClick={() => setPublishOpen(true)}
          >
            Publish Version
          </Button>
        </div>
      </header>

      {!canManage ? (
        <p
          className="text-sm text-[#251605]"
          data-testid="guest-agreement-permission"
          role="status"
        >
          {GUEST_AGREEMENT_MANAGER_ONLY}
        </p>
      ) : null}
      {feedback ? (
        <p className="text-sm text-[#251605]" data-testid="guest-agreement-feedback" role="status">
          {feedback}
        </p>
      ) : null}
      {query.isError ? (
        <p
          className="rounded-xl border border-[#C89933]/40 bg-white px-4 py-3 text-sm text-[#251605]"
          role="alert"
        >
          {guestAgreementActionFailure(query.error)}
        </p>
      ) : null}

      {query.isLoading ? (
        <p className="text-sm text-[#251605]/70">Loading the guest agreement.</p>
      ) : configuration?.active ? (
        <ActiveAgreementCard
          version={configuration.active}
          onView={() => setViewId(configuration.active?.id ?? null)}
        />
      ) : configuration?.draft ? null : (
        <section className={cardClass} data-testid="guest-agreement-empty">
          <h2 className="font-display text-lg text-[#251605]">Default Guest Agreement available</h2>
          <p className="mt-1 text-sm text-[#251605]/70">
            Create a version to edit the registration agreement. Check-in uses a version only after
            it is published.
          </p>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <PropertyTimes
            checkInTime={configuration?.checkInTime ?? null}
            checkOutTime={configuration?.checkOutTime ?? null}
            warning={timeWarning}
          />
          {configuration?.draft && local && !configuration.draft.legacy ? (
            <DraftEditor
              agreement={local}
              canManage={canManage}
              onChange={updateLocal}
              onEditSection={(section) => setEditor({ kind: "section", section: { ...section } })}
              onEditAcknowledgement={(item) =>
                setEditor({ kind: "acknowledgement", item: { ...item } })
              }
              onRemoveSection={(section) =>
                setRemoveTarget({ kind: "section", id: section.id, title: section.title })
              }
              onRemoveAcknowledgement={(item) =>
                setRemoveTarget({ kind: "acknowledgement", id: item.id, title: item.title })
              }
              onAddSection={() =>
                setEditor({
                  kind: "section",
                  section: {
                    id: newItemId("section"),
                    title: "",
                    descriptionTemplate: "",
                    resolvedDescription: null,
                    enabled: true,
                    displayOrder: (local.sections.length + 1) * 10,
                  },
                })
              }
              onAddAcknowledgement={() =>
                setEditor({
                  kind: "acknowledgement",
                  item: {
                    id: newItemId("ack"),
                    title: "",
                    statement: "",
                    enabled: true,
                    required: true,
                    displayOrder: (local.acknowledgements.length + 1) * 10,
                  },
                })
              }
            />
          ) : null}
          {configuration?.draft?.legacy ? (
            <LegacyAgreement body={configuration.draft.body} />
          ) : null}
          <HistoryList
            rows={configuration?.history ?? []}
            titles={historyTitles(configuration)}
            onView={setViewId}
          />
        </div>
        {local && configuration?.draft && !configuration.draft.legacy ? (
          <PreviewPanel
            agreement={previewGuestAgreement(local, {
              checkInTime: configuration.checkInTime,
              checkOutTime: configuration.checkOutTime,
            })}
          />
        ) : null}
      </div>

      <SectionSheet
        editor={editor?.kind === "section" ? editor.section : null}
        open={editor?.kind === "section"}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onChange={(section) => setEditor({ kind: "section", section })}
        onApply={() => {
          if (editor?.kind !== "section" || !local) return;
          const section = editor.section;
          if (!section.title.trim() || !section.descriptionTemplate.trim()) {
            setFeedback("Enter a section title and description.");
            return;
          }
          const exists = local.sections.some((row) => row.id === section.id);
          updateLocal({
            ...local,
            sections: exists
              ? local.sections.map((row) =>
                  row.id === section.id ? { ...section, resolvedDescription: null } : row,
                )
              : [...local.sections, { ...section, resolvedDescription: null }],
          });
          setEditor(null);
        }}
      />
      <AcknowledgementSheet
        editor={editor?.kind === "acknowledgement" ? editor.item : null}
        open={editor?.kind === "acknowledgement"}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onChange={(item) => setEditor({ kind: "acknowledgement", item })}
        onApply={() => {
          if (editor?.kind !== "acknowledgement" || !local) return;
          const item = {
            ...editor.item,
            required: editor.item.enabled ? editor.item.required : false,
          };
          if (!item.title.trim() || !item.statement.trim()) {
            setFeedback("Enter an acknowledgement title and statement.");
            return;
          }
          const exists = local.acknowledgements.some((row) => row.id === item.id);
          updateLocal({
            ...local,
            acknowledgements: exists
              ? local.acknowledgements.map((row) => (row.id === item.id ? item : row))
              : [...local.acknowledgements, item],
          });
          setEditor(null);
        }}
      />

      <AlertDialog
        open={removeTarget != null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.title || "this item"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.kind === "acknowledgement"
                ? GUEST_AGREEMENT_REMOVE_ACKNOWLEDGEMENT
                : GUEST_AGREEMENT_REMOVE_SECTION}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                if (!removeTarget || !local) return;
                if (removeTarget.kind === "section") {
                  updateLocal({
                    ...local,
                    sections: sorted(
                      local.sections.filter((row) => row.id !== removeTarget.id),
                    ).map((row, index) => ({ ...row, displayOrder: (index + 1) * 10 })),
                  });
                } else {
                  updateLocal({
                    ...local,
                    acknowledgements: sorted(
                      local.acknowledgements.filter((row) => row.id !== removeTarget.id),
                    ).map((row, index) => ({ ...row, displayOrder: (index + 1) * 10 })),
                  });
                }
                setRemoveTarget(null);
              }}
            >
              Remove from draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent data-testid="guest-agreement-publish-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{GUEST_AGREEMENT_PUBLISH_TITLE}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {GUEST_AGREEMENT_PUBLISH_POINTS.map((point) => (
                  <p key={point}>{point}</p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              data-testid="guest-agreement-publish-confirm"
              onClick={() => publishMutation.mutate()}
            >
              Publish Version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={viewed != null} onOpenChange={(open) => !open && setViewId(null)}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Agreement version</AlertDialogTitle>
            <AlertDialogDescription>{GUEST_AGREEMENT_READONLY}</AlertDialogDescription>
          </AlertDialogHeader>
          {viewed && isStructuredAgreementVersion(viewed) ? (
            viewed.legacy ? (
              <LegacyAgreement body={viewed.body} />
            ) : (
              <ReadonlyVersion version={viewed} />
            )
          ) : viewed ? (
            <ReadonlySummary
              label={viewed.label}
              status={guestAgreementHistoryStatus(viewed)}
              publishedAt={viewed.publishedAt}
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function historyTitles(configuration: GuestAgreementConfiguration | null): Record<string, string> {
  const titles: Record<string, string> = {};
  if (configuration?.active?.agreement?.title) {
    titles[configuration.active.id] = configuration.active.agreement.title;
  }
  if (configuration?.draft?.agreement?.title) {
    titles[configuration.draft.id] = configuration.draft.agreement.title;
  }
  return titles;
}

function ActiveAgreementCard({
  version,
  onView,
}: {
  version: GuestAgreementVersionView;
  onView: () => void;
}) {
  const title = version.legacy ? "Legacy Agreement" : version.agreement?.title || "Guest Agreement";
  const sections = enabledAgreementCount(version, "sections");
  const acknowledgements = enabledAgreementCount(version, "acknowledgements");
  return (
    <section className={cardClass} data-testid="guest-agreement-active">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#436436]">Active</p>
          <h2 className="font-display text-xl text-[#251605]">{title}</h2>
          <p className="text-sm text-[#251605]/70">Version {version.label}</p>
        </div>
        <Button type="button" variant="outline" data-testid="guest-agreement-view" onClick={onView}>
          View
        </Button>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Status" value="Active" />
        <Fact label="Published" value={formatGuestAgreementPublishedAt(version.publishedAt)} />
        <Fact label="Published by" value="—" />
        <Fact label="Enabled sections" value={sections == null ? "—" : String(sections)} />
        <Fact
          label="Enabled acknowledgements"
          value={acknowledgements == null ? "—" : String(acknowledgements)}
        />
        <Fact label="Resolved check-in" value={version.resolvedCheckInTime || "—"} />
        <Fact label="Resolved check-out" value={version.resolvedCheckOutTime || "—"} />
      </dl>
      <p className="mt-3 text-sm text-[#251605]/70">{GUEST_AGREEMENT_READONLY}</p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[#251605]/50">{label}</dt>
      <dd className="text-[#251605]">{value}</dd>
    </div>
  );
}

function PropertyTimes({
  checkInTime,
  checkOutTime,
  warning,
}: {
  checkInTime: string | null;
  checkOutTime: string | null;
  warning: string | null;
}) {
  return (
    <section className={cardClass} data-testid="guest-agreement-property-setup">
      <h2 className="font-display text-lg text-[#251605]">Property Setup Values</h2>
      <p className="mt-1 text-sm text-[#251605]/70">{GUEST_AGREEMENT_PROPERTY_SETUP_HELP}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="guest-agreement-check-in-time">Check-in Time</Label>
          <Input
            id="guest-agreement-check-in-time"
            data-testid="guest-agreement-check-in-time"
            value={checkInTime ?? ""}
            readOnly
            disabled
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="guest-agreement-check-out-time">Check-out Time</Label>
          <Input
            id="guest-agreement-check-out-time"
            data-testid="guest-agreement-check-out-time"
            value={checkOutTime ?? ""}
            readOnly
            disabled
          />
        </div>
      </div>
      {warning ? (
        <p className="mt-3 text-sm text-[#8A5A12]" role="status">
          {warning}
        </p>
      ) : null}
    </section>
  );
}

function DraftEditor({
  agreement,
  canManage,
  onChange,
  onEditSection,
  onEditAcknowledgement,
  onRemoveSection,
  onRemoveAcknowledgement,
  onAddSection,
  onAddAcknowledgement,
}: {
  agreement: GuestAgreementPackage;
  canManage: boolean;
  onChange: (next: GuestAgreementPackage) => void;
  onEditSection: (section: GuestAgreementSection) => void;
  onEditAcknowledgement: (item: GuestAgreementAcknowledgementDef) => void;
  onRemoveSection: (section: GuestAgreementSection) => void;
  onRemoveAcknowledgement: (item: GuestAgreementAcknowledgementDef) => void;
  onAddSection: () => void;
  onAddAcknowledgement: () => void;
}) {
  return (
    <section className={cardClass} data-testid="guest-agreement-draft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-[#251605]">Draft</h2>
        <span className="rounded-full bg-[#C89933]/20 px-2 py-0.5 text-xs font-semibold text-[#8A5A12]">
          Draft
        </span>
      </div>
      <div className="mt-4 grid gap-4">
        <Field
          id="guest-agreement-title"
          label="Agreement Title"
          value={agreement.title}
          disabled={!canManage}
          onChange={(title) => onChange({ ...agreement, title })}
        />
        <Area
          id="guest-agreement-intro"
          label="Intro"
          value={agreement.intro}
          disabled={!canManage}
          onChange={(intro) => onChange({ ...agreement, intro })}
        />
        <Area
          id="guest-agreement-lead-in"
          label="Lead-in"
          value={agreement.leadIn}
          disabled={!canManage}
          onChange={(leadIn) => onChange({ ...agreement, leadIn })}
        />
        <Field
          id="guest-agreement-ack-heading"
          label="Acknowledgement Heading"
          value={agreement.acknowledgementTitle}
          disabled={!canManage}
          onChange={(acknowledgementTitle) => onChange({ ...agreement, acknowledgementTitle })}
        />
        <Area
          id="guest-agreement-ack-intro"
          label="Acknowledgement Intro"
          value={agreement.acknowledgementIntro}
          disabled={!canManage}
          onChange={(acknowledgementIntro) => onChange({ ...agreement, acknowledgementIntro })}
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h3 className="font-display text-base text-[#251605]">Agreement sections</h3>
        <Button type="button" variant="outline" disabled={!canManage} onClick={onAddSection}>
          <Plus className="size-4" /> Add Section
        </Button>
      </div>
      <ul className="mt-3 space-y-2">
        {sorted(agreement.sections).map((section, index, rows) => (
          <li
            key={section.id}
            className="rounded-xl border border-[#DDD4C5] p-3"
            data-testid="guest-agreement-section"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[#251605]">{section.title || "Untitled section"}</p>
                <p className="text-sm text-[#251605]/70">
                  {section.descriptionTemplate.slice(0, 120)}
                </p>
                <p className="text-xs text-[#251605]/60">
                  {section.enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <IconButton
                  label={`Move ${section.title} up`}
                  disabled={!canManage || index === 0}
                  onClick={() =>
                    onChange({
                      ...agreement,
                      sections: reorderGuestAgreementItems(agreement.sections, section.id, "up"),
                    })
                  }
                >
                  <ChevronUp className="size-4" />
                </IconButton>
                <IconButton
                  label={`Move ${section.title} down`}
                  disabled={!canManage || index === rows.length - 1}
                  onClick={() =>
                    onChange({
                      ...agreement,
                      sections: reorderGuestAgreementItems(agreement.sections, section.id, "down"),
                    })
                  }
                >
                  <ChevronDown className="size-4" />
                </IconButton>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() => onEditSection(section)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() => onRemoveSection(section)}
                >
                  Remove
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <h3 className="font-display text-base text-[#251605]">
          {agreement.acknowledgementTitle || "Guest Acknowledgement"}
        </h3>
        <p className="text-sm text-[#251605]/70">{agreement.acknowledgementIntro}</p>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={!canManage}
          onClick={onAddAcknowledgement}
        >
          <Plus className="size-4" /> Add Acknowledgement
        </Button>
      </div>
      <ul className="mt-3 space-y-2">
        {sorted(agreement.acknowledgements).map((item, index, rows) => (
          <li
            key={item.id}
            className="rounded-xl border border-[#DDD4C5] p-3"
            data-testid="guest-agreement-acknowledgement"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[#251605]">
                  {item.title || "Untitled acknowledgement"}
                </p>
                <p className="text-sm text-[#251605]/70">{item.statement.slice(0, 140)}</p>
                <p className="text-xs text-[#251605]/60">
                  {!item.enabled ? "Disabled" : item.required ? "Required" : "Optional"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <IconButton
                  label={`Move ${item.title} up`}
                  disabled={!canManage || index === 0}
                  onClick={() =>
                    onChange({
                      ...agreement,
                      acknowledgements: reorderGuestAgreementItems(
                        agreement.acknowledgements,
                        item.id,
                        "up",
                      ),
                    })
                  }
                >
                  <ChevronUp className="size-4" />
                </IconButton>
                <IconButton
                  label={`Move ${item.title} down`}
                  disabled={!canManage || index === rows.length - 1}
                  onClick={() =>
                    onChange({
                      ...agreement,
                      acknowledgements: reorderGuestAgreementItems(
                        agreement.acknowledgements,
                        item.id,
                        "down",
                      ),
                    })
                  }
                >
                  <ChevronDown className="size-4" />
                </IconButton>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() => onEditAcknowledgement(item)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() => onRemoveAcknowledgement(item)}
                >
                  Remove
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        data-testid={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Area({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        data-testid={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function SectionSheet({
  editor,
  open,
  onOpenChange,
  onChange,
  onApply,
}: {
  editor: GuestAgreementSection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (section: GuestAgreementSection) => void;
  onApply: () => void;
}) {
  const template = editor?.descriptionTemplate ?? "";
  const showsPlaceholder = /\{\{\s*check_in_time\s*\}\}|\{\{\s*check_out_time\s*\}\}/.test(
    template,
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit section</SheetTitle>
          <SheetDescription>Changes stay on this draft until you save it.</SheetDescription>
        </SheetHeader>
        {editor ? (
          <div className="mt-4 space-y-4">
            <Field
              id="guest-agreement-section-title"
              label="Section Title"
              value={editor.title}
              disabled={false}
              onChange={(title) => onChange({ ...editor, title })}
            />
            <Area
              id="guest-agreement-section-template"
              label="Description / Template"
              value={editor.descriptionTemplate}
              disabled={false}
              onChange={(descriptionTemplate) => onChange({ ...editor, descriptionTemplate })}
            />
            {showsPlaceholder ? (
              <p className="text-sm text-[#251605]/70">
                {"{{check_in_time}}"} and {"{{check_out_time}}"} stay in the draft. Publishing
                resolves them.
              </p>
            ) : null}
            <div className="flex items-center justify-between">
              <Label htmlFor="guest-agreement-section-enabled">Enabled</Label>
              <Switch
                id="guest-agreement-section-enabled"
                checked={editor.enabled}
                onCheckedChange={(enabled) => onChange({ ...editor, enabled })}
                aria-label="Section enabled"
              />
            </div>
          </div>
        ) : null}
        <SheetFooter className="mt-6">
          <Button type="button" className={goldButton} onClick={onApply}>
            Apply to draft
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AcknowledgementSheet({
  editor,
  open,
  onOpenChange,
  onChange,
  onApply,
}: {
  editor: GuestAgreementAcknowledgementDef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (item: GuestAgreementAcknowledgementDef) => void;
  onApply: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit acknowledgement</SheetTitle>
          <SheetDescription>
            Required applies only while this acknowledgement is enabled.
          </SheetDescription>
        </SheetHeader>
        {editor ? (
          <div className="mt-4 space-y-4">
            <Field
              id="guest-agreement-ack-item-title"
              label="Acknowledgement Title"
              value={editor.title}
              disabled={false}
              onChange={(title) => onChange({ ...editor, title })}
            />
            <Area
              id="guest-agreement-ack-statement"
              label="Statement"
              value={editor.statement}
              disabled={false}
              onChange={(statement) => onChange({ ...editor, statement })}
            />
            <div className="flex items-center justify-between">
              <Label htmlFor="guest-agreement-ack-enabled">Enabled</Label>
              <Switch
                id="guest-agreement-ack-enabled"
                checked={editor.enabled}
                onCheckedChange={(enabled) =>
                  onChange({ ...editor, enabled, required: enabled ? editor.required : false })
                }
                aria-label="Acknowledgement enabled"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="guest-agreement-ack-required">Required</Label>
              <Switch
                id="guest-agreement-ack-required"
                checked={editor.enabled && editor.required}
                disabled={!editor.enabled}
                onCheckedChange={(required) => onChange({ ...editor, required })}
                aria-label="Acknowledgement required"
              />
            </div>
          </div>
        ) : null}
        <SheetFooter className="mt-6">
          <Button type="button" className={goldButton} onClick={onApply}>
            Apply to draft
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PreviewPanel({ agreement }: { agreement: GuestAgreementPackage }) {
  return (
    <aside
      className={cn(cardClass, "h-fit xl:sticky xl:top-4")}
      data-testid="guest-agreement-preview"
    >
      <div className="flex items-center gap-2">
        <ScrollText className="size-4 text-[#C89933]" />
        <h2 className="font-display text-lg text-[#251605]">Preview</h2>
      </div>
      <p className="mt-1 text-xs text-[#251605]/60">{GUEST_AGREEMENT_PREVIEW_NOTE}</p>
      <div className="mt-4 space-y-3 text-sm text-[#251605]">
        <h3 className="font-display text-base">{agreement.title}</h3>
        <p>{agreement.intro}</p>
        <p>{agreement.leadIn}</p>
        {agreement.sections.map((section) => (
          <div key={section.id}>
            <p className="font-medium">{section.title}</p>
            <p className="whitespace-pre-wrap text-[#251605]/80">{section.resolvedDescription}</p>
          </div>
        ))}
        <h3 className="font-display text-base">{agreement.acknowledgementTitle}</h3>
        <p>{agreement.acknowledgementIntro}</p>
        {agreement.acknowledgements.map((item) => (
          <p key={item.id}>☐ {item.statement}</p>
        ))}
      </div>
    </aside>
  );
}

function HistoryList({
  rows,
  titles,
  onView,
}: {
  rows: GuestAgreementConfiguration["history"];
  titles: Record<string, string>;
  onView: (id: string) => void;
}) {
  return (
    <section className={cardClass} data-testid="guest-agreement-history">
      <h2 className="font-display text-lg text-[#251605]">Version history</h2>
      <p className="mt-1 text-sm text-[#251605]/70">{GUEST_AGREEMENT_READONLY}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[#251605]/70">No versions yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[#DDD4C5]">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-[#251605]">Version {row.label}</p>
                <p className="text-[#251605]/70">
                  {titles[row.id] || "Title is on the version snapshot"}
                </p>
                <p>
                  <span className="text-[#251605]">{guestAgreementHistoryStatus(row)}</span>
                  {" · "}
                  {formatGuestAgreementPublishedAt(row.publishedAt)}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => onView(row.id)}>
                View
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LegacyAgreement({ body }: { body: string }) {
  return (
    <section className={cardClass} data-testid="guest-agreement-legacy">
      <h2 className="font-display text-lg text-[#251605]">Legacy Agreement</h2>
      <p className="mt-1 text-sm text-[#251605]/70">{GUEST_AGREEMENT_READONLY}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm text-[#251605]">{body}</p>
    </section>
  );
}

function ReadonlyVersion({ version }: { version: GuestAgreementVersionView }) {
  const agreement = version.agreement;
  return (
    <div className="space-y-3 text-sm text-[#251605]">
      <p className="font-medium">{agreement?.title}</p>
      <p>{agreement?.intro}</p>
      <p>{agreement?.leadIn}</p>
      {agreement?.sections
        .filter((section) => section.enabled)
        .map((section) => (
          <div key={section.id}>
            <p className="font-medium">{section.title}</p>
            <p className="whitespace-pre-wrap">
              {section.resolvedDescription || section.descriptionTemplate}
            </p>
          </div>
        ))}
      <p className="font-medium">{agreement?.acknowledgementTitle}</p>
      {agreement?.acknowledgements
        .filter((item) => item.enabled)
        .map((item) => (
          <p key={item.id}>
            {item.required ? "Required" : "Optional"} · {item.statement}
          </p>
        ))}
      <p>Resolved check-in {version.resolvedCheckInTime || "—"}</p>
      <p>Resolved check-out {version.resolvedCheckOutTime || "—"}</p>
      <p>Published {formatGuestAgreementPublishedAt(version.publishedAt)}</p>
    </div>
  );
}

function ReadonlySummary({
  label,
  status,
  publishedAt,
}: {
  label: string;
  status: string;
  publishedAt: string | null;
}) {
  return (
    <div
      className="space-y-2 text-sm text-[#251605]"
      data-testid="guest-agreement-history-readonly"
    >
      <p>Version {label}</p>
      <p>{status}</p>
      <p>Published {formatGuestAgreementPublishedAt(publishedAt)}</p>
    </div>
  );
}
