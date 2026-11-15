/**
 * Guest Services → Guest Agreement configuration.
 * Check-in still reads the published version through getCheckInAgreement.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ellipsis } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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

const cardClass = "rounded-xl border border-[#E6E1D8] bg-white p-3";
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
    <div className="space-y-3" data-testid="guest-agreement-workspace">
      <header className="flex flex-nowrap items-center justify-between gap-3 overflow-x-auto">
        <div className="min-w-0">
          <h1 className="font-display text-xl text-[#251605]">{GUEST_AGREEMENT_PAGE_TITLE}</h1>
          <p className="truncate text-xs text-[#7A6A55]">{GUEST_AGREEMENT_PAGE_SUBTITLE}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="guest-agreement-create"
            disabled={!actions.create || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create New Version
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="guest-agreement-save"
            disabled={!actions.save || !local || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save Draft
          </Button>
          <Button
            type="button"
            className={goldButton}
            size="sm"
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

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(20rem,3fr)]">
        <div className="min-w-0 space-y-3">
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
      <HistoryList
        rows={configuration?.history ?? []}
        titles={historyTitles(configuration)}
        onView={setViewId}
      />

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
    <section
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#E6E1D8] bg-white px-3 py-2 text-sm"
      data-testid="guest-agreement-active"
    >
      <p className="font-medium text-[#251605]">{title}</p>
      <p className="text-[#7A6A55]">Version {version.label}</p>
      <StatusChip tone="on">Active</StatusChip>
      <span className="text-[#5C5346]">
        {sections == null ? "—" : sections} {sections === 1 ? "section" : "sections"}
      </span>
      <span className="text-[#5C5346]">
        {acknowledgements == null ? "—" : acknowledgements}{" "}
        {acknowledgements === 1 ? "acknowledgement" : "acknowledgements"}
      </span>
      <span className="text-[#7A6A55]">{formatGuestAgreementPublishedAt(version.publishedAt)}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-auto"
        data-testid="guest-agreement-view"
        onClick={onView}
      >
        View
      </Button>
    </section>
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
    <section
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-[#E6E1D8] bg-[#FBF7EE] px-3 py-2"
      data-testid="guest-agreement-property-setup"
    >
      <p className="text-sm text-[#251605]">
        Check-in {checkInTime || "—"} · Check-out {checkOutTime || "—"}
      </p>
      <p className="text-xs text-[#7A6A55]">Values come from Property & Business settings.</p>
      <span className="sr-only">{GUEST_AGREEMENT_PROPERTY_SETUP_HELP}</span>
      <div className="sr-only">
        <Input
          id="guest-agreement-check-in-time"
          data-testid="guest-agreement-check-in-time"
          value={checkInTime ?? ""}
          readOnly
          disabled
        />
        <Input
          id="guest-agreement-check-out-time"
          data-testid="guest-agreement-check-out-time"
          value={checkOutTime ?? ""}
          readOnly
          disabled
        />
      </div>
      {warning ? (
        <p className="basis-full text-xs text-[#8A5A12]" role="status">
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
    <section className={cn(cardClass, "space-y-4")} data-testid="guest-agreement-draft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#251605]">Agreement content</h2>
        <StatusChip tone="on">Draft</StatusChip>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="guest-agreement-title"
          label="Agreement Title"
          value={agreement.title}
          disabled={!canManage}
          onChange={(title) => onChange({ ...agreement, title })}
        />
        <Field
          id="guest-agreement-ack-heading"
          label="Acknowledgement Heading"
          value={agreement.acknowledgementTitle}
          disabled={!canManage}
          onChange={(acknowledgementTitle) => onChange({ ...agreement, acknowledgementTitle })}
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
        <div className="sm:col-span-2">
          <Area
            id="guest-agreement-ack-intro"
            label="Acknowledgement Intro"
            value={agreement.acknowledgementIntro}
            disabled={!canManage}
            onChange={(acknowledgementIntro) => onChange({ ...agreement, acknowledgementIntro })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#E6E1D8] pt-3">
        <h3 className="text-sm font-semibold text-[#251605]">Agreement Sections</h3>
        <button
          type="button"
          disabled={!canManage}
          onClick={onAddSection}
          className="text-xs font-semibold text-[#8A641A] hover:text-[#251605] disabled:opacity-50"
        >
          + Add Section
        </button>
      </div>
      <ul className="space-y-1.5">
        {sorted(agreement.sections).map((section, index, rows) => (
          <li
            key={section.id}
            className="flex items-center gap-2 rounded-lg border border-[#E6E1D8] px-2.5 py-2"
            data-testid="guest-agreement-section"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-medium text-[#251605]">
                  {section.title || "Untitled section"}
                </p>
                <StatusChip tone={section.enabled ? "on" : "off"}>
                  {section.enabled ? "Enabled" : "Disabled"}
                </StatusChip>
              </div>
              <p className="truncate text-xs text-[#7A6A55]">
                {section.descriptionTemplate.slice(0, 120)}
              </p>
            </div>
            <RowMenu
              label={`${section.title || "Section"} actions`}
              disabled={!canManage}
              canMoveUp={index > 0}
              canMoveDown={index < rows.length - 1}
              moveUpLabel={`Move ${section.title} up`}
              moveDownLabel={`Move ${section.title} down`}
              onMoveUp={() =>
                onChange({
                  ...agreement,
                  sections: reorderGuestAgreementItems(agreement.sections, section.id, "up"),
                })
              }
              onMoveDown={() =>
                onChange({
                  ...agreement,
                  sections: reorderGuestAgreementItems(agreement.sections, section.id, "down"),
                })
              }
              onEdit={() => onEditSection(section)}
              onRemove={() => onRemoveSection(section)}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-[#E6E1D8] pt-3">
        <h3 className="text-sm font-semibold text-[#251605]">Guest Acknowledgements</h3>
        <button
          type="button"
          disabled={!canManage}
          onClick={onAddAcknowledgement}
          className="text-xs font-semibold text-[#8A641A] hover:text-[#251605] disabled:opacity-50"
        >
          + Add Acknowledgement
        </button>
      </div>
      <ul className="space-y-1.5">
        {sorted(agreement.acknowledgements).map((item, index, rows) => (
          <li
            key={item.id}
            className="flex items-center gap-2 rounded-lg border border-[#E6E1D8] px-2.5 py-2"
            data-testid="guest-agreement-acknowledgement"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-medium text-[#251605]">
                  {item.title || "Untitled acknowledgement"}
                </p>
                {item.enabled ? <StatusChip tone="on">Enabled</StatusChip> : null}
                <StatusChip tone={!item.enabled ? "off" : item.required ? "required" : "optional"}>
                  {!item.enabled ? "Disabled" : item.required ? "Required" : "Optional"}
                </StatusChip>
              </div>
              <p className="truncate text-xs text-[#7A6A55]">{item.statement.slice(0, 140)}</p>
            </div>
            <RowMenu
              label={`${item.title || "Acknowledgement"} actions`}
              disabled={!canManage}
              canMoveUp={index > 0}
              canMoveDown={index < rows.length - 1}
              moveUpLabel={`Move ${item.title} up`}
              moveDownLabel={`Move ${item.title} down`}
              onMoveUp={() =>
                onChange({
                  ...agreement,
                  acknowledgements: reorderGuestAgreementItems(
                    agreement.acknowledgements,
                    item.id,
                    "up",
                  ),
                })
              }
              onMoveDown={() =>
                onChange({
                  ...agreement,
                  acknowledgements: reorderGuestAgreementItems(
                    agreement.acknowledgements,
                    item.id,
                    "down",
                  ),
                })
              }
              onEdit={() => onEditAcknowledgement(item)}
              onRemove={() => onRemoveAcknowledgement(item)}
            />
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
        rows={2}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-0"
      />
    </div>
  );
}

function StatusChip({
  tone,
  children,
}: {
  tone: "on" | "off" | "required" | "optional";
  children: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
        tone === "on" && "bg-[#FBF3DE] text-[#8A641A]",
        tone === "required" && "bg-[#F4E9D0] text-[#8A641A]",
        tone === "optional" && "bg-[#F7F4EE] text-[#5C5346]",
        tone === "off" && "bg-[#F4EDE0] text-[#7A6A55]",
      )}
    >
      {children}
    </span>
  );
}

function RowMenu({
  label,
  disabled,
  canMoveUp,
  canMoveDown,
  moveUpLabel,
  moveDownLabel,
  onMoveUp,
  onMoveDown,
  onEdit,
  onRemove,
}: {
  label: string;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  moveUpLabel: string;
  moveDownLabel: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          className="rounded-md p-1 text-[#B5A48C] outline-none hover:bg-[#F4E9D0] hover:text-[#251605] disabled:opacity-40"
        >
          <Ellipsis className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem aria-label={moveUpLabel} disabled={!canMoveUp} onClick={onMoveUp}>
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem aria-label={moveDownLabel} disabled={!canMoveDown} onClick={onMoveDown}>
          Move down
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={onRemove}>Remove</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      className="h-fit rounded-xl border border-[#E6E1D8] bg-[#FFFCF7] p-4 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-7.5rem)] lg:overflow-y-auto"
      data-testid="guest-agreement-preview"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A641A]">
        Live Preview
      </h2>
      <p className="mt-1 text-[11px] leading-snug text-[#7A6A55]">{GUEST_AGREEMENT_PREVIEW_NOTE}</p>
      <article className="mt-4 space-y-3 text-sm leading-relaxed text-[#251605]">
        <h3 className="font-display text-lg leading-tight">{agreement.title}</h3>
        <p>{agreement.intro}</p>
        <p>{agreement.leadIn}</p>
        {agreement.sections.map((section) => (
          <div key={section.id} className="space-y-1">
            <p className="font-semibold">{section.title}</p>
            <p className="whitespace-pre-wrap text-[#3C2E1E]">{section.resolvedDescription}</p>
          </div>
        ))}
        <h3 className="font-display text-base leading-tight">{agreement.acknowledgementTitle}</h3>
        <p>{agreement.acknowledgementIntro}</p>
        <ul className="space-y-1.5">
          {agreement.acknowledgements.map((item) => (
            <li key={item.id} className="flex gap-2">
              <span aria-hidden className="mt-0.5 text-[#C89933]">
                ☐
              </span>
              <span>{item.statement}</span>
            </li>
          ))}
        </ul>
      </article>
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
  const [open, setOpen] = useState(false);
  const countLabel = `${rows.length} ${rows.length === 1 ? "version" : "versions"}`;
  return (
    <section className={cardClass} data-testid="guest-agreement-history">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-sm font-semibold text-[#251605]">
          Version History · {countLabel}
        </span>
        <span className="text-xs text-[#7A6A55]">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="mt-2 border-t border-[#E6E1D8] pt-2">
          <p className="text-xs text-[#7A6A55]">{GUEST_AGREEMENT_READONLY}</p>
          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-[#7A6A55]">No versions yet.</p>
          ) : (
            <ul className="mt-1 divide-y divide-[#E6E1D8]">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#251605]">Version {row.label}</p>
                    <p className="truncate text-xs text-[#7A6A55]">
                      {titles[row.id] || "Title is on the version snapshot"}
                      {" · "}
                      {guestAgreementHistoryStatus(row)}
                      {" · "}
                      {formatGuestAgreementPublishedAt(row.publishedAt)}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => onView(row.id)}>
                    View
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
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
