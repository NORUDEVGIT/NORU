import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { ReadinessChip } from "@/packages/pms/components/settings/pms-set1-section";
import type { Set1Checklist } from "@/packages/pms/lib/pms-set1-foundation";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_LABELS,
  SET5_ACCOUNTING_WARNING,
  SET5_ADMIN_HREF,
  SET5_ADMIN_UNAVAILABLE,
  SET5_ADMIN_WARNING,
  SET5_API_WARNING,
  SET5_CHANNELS_WARNING,
  SET5_DEPTS_UNAVAILABLE,
  SET5_DEPTS_WARNING,
  SET5_GUEST_SERVICES_HREF,
  SET5_INTEGRATIONS_HREF,
  SET5_NOTIFICATIONS_HREF,
  SET5_NOTIFICATIONS_UNAVAILABLE,
  SET5_PAYMENTS_WARNING,
  SET5_POS_LIVE_NOTE,
  SET5_REQUEST_TYPES_UNAVAILABLE,
  SET5_REQUEST_TYPES_WARNING,
  SET5_RETENTION_WARNING,
  SET5_ROUTING_WARNING,
  SET5_SECURITY_HREF,
  SET5_SECURITY_UNAVAILABLE,
  SET5_SESSION_WARNING,
  SET5_TEMPLATES_WARNING,
  SET5_THIRD_PARTY_WARNING,
  SET5_WHATSAPP_FUTURE,
  SET5_WORK_CENTRES_WARNING,
  integrationHonestyRows,
  type AdminControls,
  type AuditRetentionPosture,
  type NotificationChannel,
  type NotificationChannels,
  type NotificationEventRules,
  type PmsDepartment,
  type PmsGuestRequestType,
  type PmsNotificationTemplate,
  type PmsSet5CatalogueItem,
  type PmsWorkCenter,
  type RoutingDefaults,
  type SessionAccessPosture,
  type Set5Snapshot,
} from "@/packages/pms/lib/pms-set5-depts-guestsvc";
import { SET5_TENDERS_LIVE_ON_PAYMENT_METHODS } from "@/packages/pms/lib/pms-polish1-payment-admin";
import {
  savePmsAdminControls,
  savePmsAuditRetention,
  savePmsDepartment,
  savePmsGuestRequestType,
  savePmsNotificationChannels,
  savePmsNotificationEventRules,
  savePmsNotificationTemplate,
  savePmsRoutingDefaults,
  savePmsSessionAccess,
  savePmsWorkCenter,
} from "@/packages/pms/lib/pms-set5-depts-guestsvc.functions";

function refreshSet5(queryClient: ReturnType<typeof useQueryClient>, restaurantId: string) {
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-audit", restaurantId] });
}

function ToggleRow({
  id,
  label,
  checked,
  disabled,
  helper,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  helper?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function CatalogueList({
  rows,
  canEdit,
  detail,
  onEdit,
  onToggle,
}: {
  rows: PmsSet5CatalogueItem[];
  canEdit: boolean;
  detail?: (row: PmsSet5CatalogueItem) => string;
  onEdit: (row: PmsSet5CatalogueItem) => void;
  onToggle: (row: PmsSet5CatalogueItem) => void;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
          <div>
            <p className="text-sm font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.code} · {row.active ? "Active" : "Inactive"}
              {detail ? ` · ${detail(row)}` : ""}
            </p>
          </div>
          {canEdit ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(row)}>
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => onToggle(row)}>
                {row.active ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CatalogueDialog({
  open,
  onOpenChange,
  title,
  row,
  saving,
  extra,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  row: PmsSet5CatalogueItem | null;
  saving: boolean;
  extra?: ReactNode;
  onSubmit: (values: { id?: string; code: string; name: string; active: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    setActive(row?.active ?? true);
  }, [open, row]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`set5-cat-name-${title}`}>Name</Label>
            <Input id={`set5-cat-name-${title}`} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`set5-cat-code-${title}`}>Code</Label>
            <Input id={`set5-cat-code-${title}`} value={code} onChange={(event) => setCode(event.target.value)} />
          </div>
          {extra}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !code.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => onSubmit({ ...(row?.id ? { id: row.id } : {}), name, code, active })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Set5DepartmentsSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set5Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveDept = useServerFn(savePmsDepartment);
  const saveWork = useServerFn(savePmsWorkCenter);
  const saveRouting = useServerFn(savePmsRoutingDefaults);
  const [deptOpen, setDeptOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<PmsDepartment | null>(null);
  const [editingWork, setEditingWork] = useState<PmsWorkCenter | null>(null);
  const [workDepartmentId, setWorkDepartmentId] = useState("");
  const [routing, setRouting] = useState<RoutingDefaults>(snapshot.routingDefaults);

  useEffect(() => {
    setRouting(snapshot.routingDefaults);
  }, [snapshot.routingDefaults]);
  useEffect(() => {
    if (!workOpen) return;
    setWorkDepartmentId(editingWork?.departmentId ?? snapshot.departments.find((row) => row.active)?.id ?? "");
  }, [workOpen, editingWork, snapshot.departments]);

  const deptMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean }) =>
      saveDept({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Department saved.");
      setDeptOpen(false);
      refreshSet5(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const workMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean; departmentId: string }) =>
      saveWork({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Work centre saved.");
      setWorkOpen(false);
      refreshSet5(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const routingMutation = useMutation({
    mutationFn: () =>
      saveRouting({
        data: {
          restaurantId,
          defaultDepartmentId: routing.defaultDepartmentId,
          folioPostingUsesDepartment: routing.folioPostingUsesDepartment,
        },
      }),
    onSuccess: () => {
      toast.success("Routing defaults saved.");
      refreshSet5(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains.departments;
  const deptName = (id: string) => snapshot.departments.find((row) => row.id === id)?.name ?? "Department";

  return (
    <section id="departments" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set5-departments">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Departments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Department and work-centre catalogue for posting and staffing. Empty is a warning, not a block. Add your own
            names — nothing is pre-filled.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.departmentsAvailable ? (
        <p className="text-sm text-muted-foreground">{SET5_DEPTS_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium text-[#251605]">Departments</h3>
            {canEdit ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingDept(null);
                  setDeptOpen(true);
                }}
              >
                Add department
              </Button>
            ) : null}
          </div>
          {snapshot.departments.length === 0 ? (
            <p className="text-sm text-[#C89933]">{SET5_DEPTS_WARNING}</p>
          ) : (
            <CatalogueList
              rows={snapshot.departments}
              canEdit={canEdit}
              onEdit={(row) => {
                setEditingDept(row);
                setDeptOpen(true);
              }}
              onToggle={(row) => deptMutation.mutate({ id: row.id, code: row.code, name: row.name, active: !row.active })}
            />
          )}

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-[#251605]">Work centres</h3>
              {canEdit && snapshot.workCentersAvailable ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={snapshot.departments.filter((row) => row.active).length === 0}
                  onClick={() => {
                    setEditingWork(null);
                    setWorkOpen(true);
                  }}
                >
                  Add work centre
                </Button>
              ) : null}
            </div>
            {!snapshot.workCentersAvailable ? (
              <p className="text-sm text-muted-foreground">{SET5_DEPTS_UNAVAILABLE}</p>
            ) : snapshot.workCenters.length === 0 ? (
              <p className="text-sm text-[#C89933]">{SET5_WORK_CENTRES_WARNING}</p>
            ) : (
              <CatalogueList
                rows={snapshot.workCenters}
                canEdit={canEdit}
                detail={(row) => deptName((row as PmsWorkCenter).departmentId)}
                onEdit={(row) => {
                  setEditingWork(row as PmsWorkCenter);
                  setWorkOpen(true);
                }}
                onToggle={(row) =>
                  workMutation.mutate({
                    id: row.id,
                    code: row.code,
                    name: row.name,
                    active: !row.active,
                    departmentId: (row as PmsWorkCenter).departmentId,
                  })
                }
              />
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="font-medium text-[#251605]">Routing defaults</h3>
            {!routing.savedAt ? <p className="text-sm text-[#C89933]">{SET5_ROUTING_WARNING}</p> : null}
            <div className="space-y-2">
              <Label htmlFor="set5-default-dept">Default department</Label>
              <Select
                value={routing.defaultDepartmentId ?? "none"}
                disabled={!canEdit}
                onValueChange={(value) =>
                  setRouting((prev) => ({ ...prev, defaultDepartmentId: value === "none" ? null : value }))
                }
              >
                <SelectTrigger id="set5-default-dept">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {snapshot.departments
                    .filter((row) => row.active)
                    .map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <ToggleRow
              id="set5-folio-dept"
              label="Use department when posting to a folio"
              checked={routing.folioPostingUsesDepartment}
              disabled={!canEdit}
              onCheckedChange={(checked) => setRouting((prev) => ({ ...prev, folioPostingUsesDepartment: checked }))}
            />
            {canEdit ? (
              <Button
                className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={routingMutation.isPending}
                onClick={() => routingMutation.mutate()}
              >
                {routingMutation.isPending ? "Saving…" : "Save routing defaults"}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <CatalogueDialog
        open={deptOpen}
        onOpenChange={setDeptOpen}
        title={editingDept ? "Edit department" : "Add department"}
        row={editingDept}
        saving={deptMutation.isPending}
        onSubmit={(values) => deptMutation.mutate(values)}
      />
      <CatalogueDialog
        open={workOpen}
        onOpenChange={setWorkOpen}
        title={editingWork ? "Edit work centre" : "Add work centre"}
        row={editingWork}
        saving={workMutation.isPending}
        extra={
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={workDepartmentId} onValueChange={setWorkDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a department" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.departments
                  .filter((row) => row.active)
                  .map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        }
        onSubmit={(values) => {
          if (!workDepartmentId) {
            toast.error("Choose a department for this work centre.");
            return;
          }
          workMutation.mutate({ ...values, departmentId: workDepartmentId });
        }}
      />
    </section>
  );
}

export function Set5GuestServicesSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set5Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveType = useServerFn(savePmsGuestRequestType);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PmsGuestRequestType | null>(null);
  const [departmentId, setDepartmentId] = useState<string>("none");

  useEffect(() => {
    if (!open) return;
    setDepartmentId(editing?.departmentId ?? "none");
  }, [open, editing]);

  const mutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean; departmentId?: string | null }) =>
      saveType({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Request type saved.");
      setOpen(false);
      refreshSet5(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains["guest-services-types"];
  const deptName = (id: string | null) =>
    id ? (snapshot.departments.find((row) => row.id === id)?.name ?? "Department") : "No department";

  return (
    <section
      id="guest-services-types"
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
      data-testid="pms-set5-guest-services"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Guest services types</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Request-type catalogue only. The Guest Services workspace stays planned. Do not treat this as Guest Profile.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.requestTypesAvailable ? (
        <p className="text-sm text-muted-foreground">{SET5_REQUEST_TYPES_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium text-[#251605]">Request types</h3>
            {canEdit ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                Add request type
              </Button>
            ) : null}
          </div>
          {snapshot.requestTypes.length === 0 ? (
            <p className="text-sm text-[#C89933]">{SET5_REQUEST_TYPES_WARNING}</p>
          ) : (
            <CatalogueList
              rows={snapshot.requestTypes}
              canEdit={canEdit}
              detail={(row) => deptName((row as PmsGuestRequestType).departmentId)}
              onEdit={(row) => {
                setEditing(row as PmsGuestRequestType);
                setOpen(true);
              }}
              onToggle={(row) =>
                mutation.mutate({
                  id: row.id,
                  code: row.code,
                  name: row.name,
                  active: !row.active,
                  departmentId: (row as PmsGuestRequestType).departmentId,
                })
              }
            />
          )}
        </div>
      )}

      <Button variant="outline" asChild>
        <a href={SET5_GUEST_SERVICES_HREF} data-testid="set5-open-guest-services">
          Open guest services
        </a>
      </Button>

      <CatalogueDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit request type" : "Add request type"}
        row={editing}
        saving={mutation.isPending}
        extra={
          <div className="space-y-2">
            <Label>Default department (optional)</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {snapshot.departments
                  .filter((row) => row.active)
                  .map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        }
        onSubmit={(values) =>
          mutation.mutate({ ...values, departmentId: departmentId === "none" ? null : departmentId })
        }
      />
    </section>
  );
}

export function Set5NotificationsSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set5Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveChannels = useServerFn(savePmsNotificationChannels);
  const saveTemplate = useServerFn(savePmsNotificationTemplate);
  const saveEvents = useServerFn(savePmsNotificationEventRules);
  const [channels, setChannels] = useState<NotificationChannels>(snapshot.channels);
  const [events, setEvents] = useState<NotificationEventRules>(snapshot.eventRules);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PmsNotificationTemplate | null>(null);
  const [templateChannel, setTemplateChannel] = useState<NotificationChannel>("email");
  const [templateBody, setTemplateBody] = useState("");

  useEffect(() => {
    setChannels(snapshot.channels);
  }, [snapshot.channels]);
  useEffect(() => {
    setEvents(snapshot.eventRules);
  }, [snapshot.eventRules]);
  useEffect(() => {
    if (!open) return;
    setTemplateChannel(editing?.channel ?? "email");
    setTemplateBody(editing?.body ?? "");
  }, [open, editing]);

  const channelMutation = useMutation({
    mutationFn: () =>
      saveChannels({ data: { restaurantId, email: channels.email, sms: channels.sms, inApp: channels.inApp } }),
    onSuccess: () => {
      toast.success("Notification channels saved.");
      refreshSet5(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const templateMutation = useMutation({
    mutationFn: (input: {
      id?: string;
      code: string;
      name: string;
      channel: NotificationChannel;
      body: string;
      active: boolean;
    }) => saveTemplate({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Template saved.");
      setOpen(false);
      refreshSet5(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const eventMutation = useMutation({
    mutationFn: () => saveEvents({ data: { restaurantId, rules: events.rules } }),
    onSuccess: () => {
      toast.success("Event rules saved.");
      refreshSet5(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains.notifications;

  return (
    <section id="notifications" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set5-notifications">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Channel posture, templates and thin event rules. This is not an email service provider and does not send
            messages yet.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.notificationsAvailable && !snapshot.adminAvailable ? (
        <p className="text-sm text-muted-foreground">{SET5_NOTIFICATIONS_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          {!channels.savedAt ? <p className="text-sm text-[#C89933]">{SET5_CHANNELS_WARNING}</p> : null}
          <ToggleRow
            id="set5-channel-email"
            label="Email"
            checked={channels.email}
            disabled={!canEdit}
            onCheckedChange={(checked) => setChannels((prev) => ({ ...prev, email: checked }))}
          />
          <ToggleRow
            id="set5-channel-sms"
            label="SMS"
            checked={channels.sms}
            disabled={!canEdit}
            onCheckedChange={(checked) => setChannels((prev) => ({ ...prev, sms: checked }))}
          />
          <ToggleRow
            id="set5-channel-in-app"
            label="In-app"
            checked={channels.inApp}
            disabled={!canEdit}
            onCheckedChange={(checked) => setChannels((prev) => ({ ...prev, inApp: checked }))}
          />
          <ToggleRow
            id="set5-channel-whatsapp"
            label="WhatsApp"
            helper={SET5_WHATSAPP_FUTURE}
            checked={false}
            disabled
            onCheckedChange={() => undefined}
          />
          {canEdit ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={channelMutation.isPending}
              onClick={() => channelMutation.mutate()}
            >
              {channelMutation.isPending ? "Saving…" : "Save channels"}
            </Button>
          ) : null}

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-[#251605]">Templates</h3>
              {canEdit && snapshot.notificationsAvailable ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  Add template
                </Button>
              ) : null}
            </div>
            {!snapshot.notificationsAvailable ? (
              <p className="text-sm text-muted-foreground">{SET5_NOTIFICATIONS_UNAVAILABLE}</p>
            ) : snapshot.templates.length === 0 ? (
              <p className="text-sm text-[#C89933]">{SET5_TEMPLATES_WARNING}</p>
            ) : (
              <CatalogueList
                rows={snapshot.templates}
                canEdit={canEdit}
                detail={(row) => NOTIFICATION_CHANNEL_LABELS[(row as PmsNotificationTemplate).channel]}
                onEdit={(row) => {
                  setEditing(row as PmsNotificationTemplate);
                  setOpen(true);
                }}
                onToggle={(row) => {
                  const template = row as PmsNotificationTemplate;
                  templateMutation.mutate({
                    id: template.id,
                    code: template.code,
                    name: template.name,
                    channel: template.channel,
                    body: template.body,
                    active: !template.active,
                  });
                }}
              />
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="font-medium text-[#251605]">Event rules</h3>
            <p className="text-xs text-muted-foreground">Configuration only — nothing is queued or sent from this wave.</p>
            {events.rules.map((rule) => (
              <div key={rule.eventKey} className="grid gap-3 rounded-xl border border-border px-3 py-3 sm:grid-cols-[1fr_auto_auto]">
                <p className="text-sm font-medium">{NOTIFICATION_EVENT_LABELS[rule.eventKey]}</p>
                <Select
                  value={rule.channel}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    setEvents((prev) => ({
                      ...prev,
                      rules: prev.rules.map((item) =>
                        item.eventKey === rule.eventKey ? { ...item, channel: value as NotificationChannel } : item,
                      ),
                    }))
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_CHANNELS.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {NOTIFICATION_CHANNEL_LABELS[channel]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Switch
                  checked={rule.enabled}
                  disabled={!canEdit}
                  onCheckedChange={(checked) =>
                    setEvents((prev) => ({
                      ...prev,
                      rules: prev.rules.map((item) => (item.eventKey === rule.eventKey ? { ...item, enabled: checked } : item)),
                    }))
                  }
                />
              </div>
            ))}
            {canEdit ? (
              <Button
                className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={eventMutation.isPending}
                onClick={() => eventMutation.mutate()}
              >
                {eventMutation.isPending ? "Saving…" : "Save event rules"}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <Button variant="outline" asChild>
        <a href={SET5_NOTIFICATIONS_HREF} data-testid="set5-open-notifications">
          Open notifications
        </a>
      </Button>

      <CatalogueDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit template" : "Add template"}
        row={editing}
        saving={templateMutation.isPending}
        extra={
          <>
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={templateChannel} onValueChange={(value) => setTemplateChannel(value as NotificationChannel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFICATION_CHANNELS.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {NOTIFICATION_CHANNEL_LABELS[channel]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="set5-template-body">Body</Label>
              <textarea
                id="set5-template-body"
                className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={templateBody}
                onChange={(event) => setTemplateBody(event.target.value)}
              />
            </div>
          </>
        }
        onSubmit={(values) => templateMutation.mutate({ ...values, channel: templateChannel, body: templateBody })}
      />
    </section>
  );
}

export function Set5AdminSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set5Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveAdmin = useServerFn(savePmsAdminControls);
  const [draft, setDraft] = useState<AdminControls>(snapshot.adminControls);

  useEffect(() => {
    setDraft(snapshot.adminControls);
  }, [snapshot.adminControls]);

  const mutation = useMutation({
    mutationFn: () =>
      saveAdmin({
        data: {
          restaurantId,
          reservationPrefix: draft.reservationPrefix,
          folioPrefix: draft.folioPrefix,
          rateOverrideNeedsApproval: draft.rateOverrideNeedsApproval,
          lateCheckoutNeedsApproval: draft.lateCheckoutNeedsApproval,
          managerOverrideEnabled: draft.managerOverrideEnabled,
        },
      }),
    onSuccess: () => {
      toast.success("Administration controls saved.");
      refreshSet5(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains.administration;

  return (
    <section id="set5-numbering-approvals" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set5-admin">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Numbering &amp; approvals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Thin numbering, approvals and override. Users and roles stay on Administration — this is not a second staff
            manager.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.adminAvailable ? (
        <p className="text-sm text-muted-foreground">{SET5_ADMIN_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          {!draft.savedAt ? <p className="text-sm text-[#C89933]">{SET5_ADMIN_WARNING}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="set5-res-prefix">Reservation number prefix</Label>
              <Input
                id="set5-res-prefix"
                value={draft.reservationPrefix}
                disabled={!canEdit}
                onChange={(event) => setDraft((prev) => ({ ...prev, reservationPrefix: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="set5-folio-prefix">Folio number prefix</Label>
              <Input
                id="set5-folio-prefix"
                value={draft.folioPrefix}
                disabled={!canEdit}
                onChange={(event) => setDraft((prev) => ({ ...prev, folioPrefix: event.target.value }))}
              />
            </div>
          </div>
          <ToggleRow
            id="set5-rate-approval"
            label="Rate override needs approval"
            checked={draft.rateOverrideNeedsApproval}
            disabled={!canEdit}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, rateOverrideNeedsApproval: checked }))}
          />
          <ToggleRow
            id="set5-late-approval"
            label="Late check-out needs approval"
            checked={draft.lateCheckoutNeedsApproval}
            disabled={!canEdit}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, lateCheckoutNeedsApproval: checked }))}
          />
          <ToggleRow
            id="set5-manager-override"
            label="Manager override enabled"
            checked={draft.managerOverrideEnabled}
            disabled={!canEdit}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, managerOverrideEnabled: checked }))}
          />
          {canEdit ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Saving…" : "Save admin controls"}
            </Button>
          ) : null}
        </div>
      )}

      <Button variant="outline" asChild>
        <a href={SET5_ADMIN_HREF} data-testid="set5-open-administration">
          Open administration
        </a>
      </Button>
    </section>
  );
}

export function Set5IntegrationsSection({
  snapshot,
  checklist,
}: {
  restaurantId: string;
  snapshot: Set5Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const domain = checklist.domains.integrations;
  const rows = integrationHonestyRows(snapshot.integrations);

  return (
    <section id="integrations" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set5-integrations">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Integrations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connection status only. Setting a connector up happens in Connectivity & Distribution. Nothing is
            shown as connected unless it genuinely is.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-border p-3" data-testid={`set5-integration-${row.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-[#251605]">{row.title}</p>
              <ReadinessChip readiness={row.status === "live" ? "complete" : row.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{row.note}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {SET5_POS_LIVE_NOTE} {SET5_PAYMENTS_WARNING} {SET5_TENDERS_LIVE_ON_PAYMENT_METHODS} {SET5_ACCOUNTING_WARNING} {SET5_API_WARNING} {SET5_THIRD_PARTY_WARNING}
      </p>

      <Button variant="outline" asChild>
        <a href={SET5_INTEGRATIONS_HREF} data-testid="set5-open-integrations">
          Open Connectivity & Distribution
        </a>
      </Button>
    </section>
  );
}

export function Set5SecuritySection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set5Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveSession = useServerFn(savePmsSessionAccess);
  const saveRetention = useServerFn(savePmsAuditRetention);
  const [session, setSession] = useState<SessionAccessPosture>(snapshot.sessionAccess);
  const [retention, setRetention] = useState<AuditRetentionPosture>(snapshot.auditRetention);

  useEffect(() => {
    setSession(snapshot.sessionAccess);
  }, [snapshot.sessionAccess]);
  useEffect(() => {
    setRetention(snapshot.auditRetention);
  }, [snapshot.auditRetention]);

  const sessionMutation = useMutation({
    mutationFn: () =>
      saveSession({
        data: {
          restaurantId,
          idleTimeoutMinutes: session.idleTimeoutMinutes,
          reauthForSensitive: session.reauthForSensitive,
        },
      }),
    onSuccess: () => {
      toast.success("Session access posture saved.");
      refreshSet5(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const retentionMutation = useMutation({
    mutationFn: () =>
      saveRetention({
        data: {
          restaurantId,
          retentionDays: retention.retentionDays,
          maskIdNumbers: retention.maskIdNumbers,
          restrictGuestExport: retention.restrictGuestExport,
        },
      }),
    onSuccess: () => {
      toast.success("Audit retention posture saved.");
      refreshSet5(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains["security-audit"];

  return (
    <section id="security-audit" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set5-security">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Security &amp; audit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Session access and audit-retention posture, plus thin sensitive-data flags aligned with Guest Profile ID
            types. This is not IAM and does not rebuild Guest Profile.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.securityAvailable ? (
        <p className="text-sm text-muted-foreground">{SET5_SECURITY_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          {!session.savedAt ? <p className="text-sm text-[#C89933]">{SET5_SESSION_WARNING}</p> : null}
          <div className="space-y-2">
            <Label htmlFor="set5-idle-timeout">Idle timeout (minutes)</Label>
            <Input
              id="set5-idle-timeout"
              type="number"
              min={1}
              value={session.idleTimeoutMinutes ?? ""}
              disabled={!canEdit}
              onChange={(event) =>
                setSession((prev) => ({
                  ...prev,
                  idleTimeoutMinutes: event.target.value.trim() ? Number(event.target.value) : null,
                }))
              }
            />
          </div>
          <ToggleRow
            id="set5-reauth"
            label="Re-authenticate for sensitive actions"
            checked={session.reauthForSensitive}
            disabled={!canEdit}
            onCheckedChange={(checked) => setSession((prev) => ({ ...prev, reauthForSensitive: checked }))}
          />
          {canEdit ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={sessionMutation.isPending}
              onClick={() => sessionMutation.mutate()}
            >
              {sessionMutation.isPending ? "Saving…" : "Save session posture"}
            </Button>
          ) : null}

          <div className="space-y-3 border-t border-border pt-4">
            {!retention.savedAt ? <p className="text-sm text-[#C89933]">{SET5_RETENTION_WARNING}</p> : null}
            <div className="space-y-2">
              <Label htmlFor="set5-retention-days">Audit retention (days)</Label>
              <Input
                id="set5-retention-days"
                type="number"
                min={1}
                value={retention.retentionDays ?? ""}
                disabled={!canEdit}
                onChange={(event) =>
                  setRetention((prev) => ({
                    ...prev,
                    retentionDays: event.target.value.trim() ? Number(event.target.value) : null,
                  }))
                }
              />
            </div>
            <ToggleRow
              id="set5-mask-id"
              label="Mask identification numbers"
              helper="Aligned with SET3 guest ID types. Profiles stay on the guest directory."
              checked={retention.maskIdNumbers}
              disabled={!canEdit}
              onCheckedChange={(checked) => setRetention((prev) => ({ ...prev, maskIdNumbers: checked }))}
            />
            <ToggleRow
              id="set5-restrict-export"
              label="Restrict guest data export"
              checked={retention.restrictGuestExport}
              disabled={!canEdit}
              onCheckedChange={(checked) => setRetention((prev) => ({ ...prev, restrictGuestExport: checked }))}
            />
            {canEdit ? (
              <Button
                className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={retentionMutation.isPending}
                onClick={() => retentionMutation.mutate()}
              >
                {retentionMutation.isPending ? "Saving…" : "Save retention posture"}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <Button variant="outline" asChild>
        <a href={SET5_SECURITY_HREF} data-testid="set5-open-security">
          Open security &amp; audit
        </a>
      </Button>
    </section>
  );
}
