import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Card3OverlapSheet } from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import { ROLE_LABELS } from "@/core/lib/module-access";
import { CARD1_LANGUAGES } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  CARD5_ACTIONS_TD_CLASS,
  CARD5_ACTIONS_TH_CLASS,
  CARD5_FILTER_CLASS,
  CARD5_SEARCH_CLASS,
  CARD5_SELECT_CONTENT_CLASS,
  CARD5_SELECT_ITEM_CLASS,
  CARD5_STATUS_TD_CLASS,
  CARD5_STATUS_TH_CLASS,
  CARD5_TH_CLASS,
  CARD5_THEAD_CLASS,
  CARD5_TOOLBAR_CLASS,
  Card5ConfigNotice,
  Card5CreateButton,
  Card5RowMenuButton,
  Card5Status,
  Card5TableShell,
  PmsPropertySetupCard5Workspace,
} from "@/packages/pms/components/settings/pms-property-setup-card5-workspace";
import {
  getCard5Departments,
  saveCard5Department,
  saveCard5DepartmentRouting,
} from "@/packages/pms/lib/departments-card5.functions";
import {
  CARD5_DEPARTMENT_TYPE_LABELS,
  CARD5_DEPARTMENT_TYPES,
  CARD5_NOTIFICATION_CHANNELS,
  CARD5_PRIORITIES,
  CARD5_SERVICE_KEY_LABELS,
  CARD5_STAFF_ROLES,
  CARD5_SUGGESTED_SERVICE_KEYS,
  departmentTree,
  emptyDepartmentDraft,
  emptyOperatingHours,
  evaluateCard5DepartmentsReadiness,
  flattenDepartmentTree,
  hoursConfigured,
  type Card5Department,
  type Card5DepartmentsReadiness,
  type Card5DepartmentsSnapshot,
  type Card5HoursWindow,
  type Card5OperatingHours,
} from "@/packages/pms/lib/departments-card5.server";

const DRAWER_TABS = [
  { id: "basic", label: "Basic" },
  { id: "operations", label: "Operations" },
  { id: "financial", label: "Financial" },
  { id: "routing", label: "Routing" },
  { id: "advanced", label: "Advanced" },
] as const;

function noneToNull(value: string): string | null {
  return value === "none" || value === "" ? null : value;
}

function windowFields(
  label: string,
  value: Card5HoursWindow | null,
  onChange: (next: Card5HoursWindow | null) => void,
  enabledLabel: string,
) {
  const enabled = value != null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{enabledLabel}</Label>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) =>
            onChange(checked ? { open: "08:00", close: "17:00" } : null)
          }
        />
      </div>
      {enabled ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>{label} open</Label>
            <Input
              type="time"
              value={value.open}
              onChange={(event) => onChange({ ...value, open: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>{label} close</Label>
            <Input
              type="time"
              value={value.close}
              onChange={(event) => onChange({ ...value, close: event.target.value })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Card5DepartmentsTab({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  function invalidateHub() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card5-validation", restaurantId] });
  }
  const load = useServerFn(getCard5Departments);
  const saveDept = useServerFn(saveCard5Department);
  const saveRouting = useServerFn(saveCard5DepartmentRouting);
  const query = useQuery({
    queryKey: ["pms-card5-departments", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: Card5DepartmentsSnapshot = query.data?.snapshot ?? {
    departments: [],
    routing: [],
    staff: [],
  };
  const readiness: Card5DepartmentsReadiness =
    query.data?.readiness ?? evaluateCard5DepartmentsReadiness(snapshot);
  const editor = canEdit && (query.data?.canEdit ?? canEdit);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | Card5Department["departmentType"]>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Card5Department | null>(null);
  const [drawerTab, setDrawerTab] = useState<(typeof DRAWER_TABS)[number]["id"]>("basic");
  const [parentLocked, setParentLocked] = useState(false);
  const [routingKey, setRoutingKey] = useState("guest_request");
  const [customServiceKey, setCustomServiceKey] = useState("");
  const [routingRole, setRoutingRole] = useState<(typeof CARD5_STAFF_ROLES)[number]>("housekeeper");
  const [validated, setValidated] = useState<Card5DepartmentsReadiness | null>(null);

  const tree = useMemo(() => departmentTree(snapshot.departments), [snapshot.departments]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = (list: typeof tree): Array<Card5Department & { depth: number }> => {
      const out: Array<Card5Department & { depth: number }> = [];
      for (const node of list) {
        const matches =
          (!q || `${node.name} ${node.code} ${node.departmentType}`.toLowerCase().includes(q)) &&
          (statusFilter === "all" || (statusFilter === "active") === node.active) &&
          (typeFilter === "all" || node.departmentType === typeFilter);
        const children = visible(node.children);
        if (matches || children.length > 0) {
          if (matches) out.push(node);
          if (q || expanded.has(node.id)) out.push(...children);
        }
      }
      return out;
    };
    return q
      ? flattenDepartmentTree(tree).filter((row) => {
          if (statusFilter === "active" && !row.active) return false;
          if (statusFilter === "inactive" && row.active) return false;
          if (typeFilter !== "all" && row.departmentType !== typeFilter) return false;
          return `${row.name} ${row.code} ${row.departmentType}`.toLowerCase().includes(q);
        })
      : visible(tree);
  }, [tree, search, statusFilter, typeFilter, expanded]);

  const descendantIds = useMemo(() => {
    if (!draft?.id) return new Set<string>();
    const ids = new Set<string>([draft.id]);
    const walk = (parentId: string) => {
      for (const row of snapshot.departments) {
        if (row.parentId === parentId && !ids.has(row.id)) {
          ids.add(row.id);
          walk(row.id);
        }
      }
    };
    walk(draft.id);
    return ids;
  }, [draft?.id, snapshot.departments]);

  const deptMutation = useMutation({
    mutationFn: (input: Card5Department) =>
      saveDept({
        data: {
          restaurantId,
          ...(input.id ? { id: input.id } : {}),
          code: input.code,
          name: input.name,
          description: input.description,
          parentId: input.parentId,
          departmentType: input.departmentType,
          managerUserId: input.managerUserId,
          responsibleRole: input.responsibleRole,
          costCenter: input.costCenter,
          revenueCenter: input.revenueCenter,
          operatingHours: input.operatingHours,
          defaultLanguage: input.defaultLanguage,
          defaultNotificationChannel: input.defaultNotificationChannel,
          defaultPriority: input.defaultPriority,
          defaultSlaMinutes: input.defaultSlaMinutes,
          escalationManagerUserId: input.escalationManagerUserId,
          active: input.active,
        },
      }),
    onSuccess: (result) => {
      toast.success("Department saved.");
      invalidateHub();
      queryClient.setQueryData(["pms-card5-departments", restaurantId], {
        snapshot: result.snapshot,
        readiness: result.readiness,
        canEdit: editor,
        role: query.data?.role,
      });
      setDraft(null);
      setValidated(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const routingMutation = useMutation({
    mutationFn: (input: {
      id?: string;
      serviceKey: string;
      departmentId: string;
      defaultRole: (typeof CARD5_STAFF_ROLES)[number];
      active: boolean;
    }) => saveRouting({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      toast.success("Routing saved.");
      invalidateHub();
      queryClient.setQueryData(["pms-card5-departments", restaurantId], {
        snapshot: result.snapshot,
        readiness: result.readiness,
        canEdit: editor,
        role: query.data?.role,
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openCreate(parentId: string | null) {
    setDraft(
      emptyDepartmentDraft({ parentId, operatingHours: emptyOperatingHours({ is24Hours: true }) }),
    );
    setParentLocked(Boolean(parentId));
    setDrawerTab("basic");
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
  }

  function openEdit(row: Card5Department) {
    setDraft({ ...row, operatingHours: emptyOperatingHours(row.operatingHours) });
    setParentLocked(false);
    setDrawerTab("basic");
  }

  function patchHours(next: Partial<Card5OperatingHours>) {
    if (!draft) return;
    setDraft({
      ...draft,
      operatingHours: emptyOperatingHours({ ...draft.operatingHours, ...next }),
    });
  }

  const shownReadiness = validated ?? readiness;

  const modalTitle = !draft
    ? "Add Department"
    : parentLocked && !draft.id
      ? "Add Sub Department"
      : draft.id
        ? "Edit Department"
        : "Add Department";

  return (
    <>
    <PmsPropertySetupCard5Workspace
      search={
        <div className="space-y-2">
          <h3 className="font-display text-lg text-[#251605]">Departments</h3>
          <div className={CARD5_TOOLBAR_CLASS}>
            <Input
              id="card5-dept-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search departments"
              className={CARD5_SEARCH_CLASS}
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
            >
              <SelectTrigger className={`${CARD5_FILTER_CLASS} w-[7.5rem]`} aria-label="Status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className={CARD5_SELECT_CONTENT_CLASS}>
                <SelectItem className={CARD5_SELECT_ITEM_CLASS} value="all">
                  All
                </SelectItem>
                <SelectItem className={CARD5_SELECT_ITEM_CLASS} value="active">
                  Active
                </SelectItem>
                <SelectItem className={CARD5_SELECT_ITEM_CLASS} value="inactive">
                  Inactive
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}
            >
              <SelectTrigger className={`${CARD5_FILTER_CLASS} w-[9.5rem]`} aria-label="Type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className={CARD5_SELECT_CONTENT_CLASS}>
                <SelectItem className={CARD5_SELECT_ITEM_CLASS} value="all">
                  All types
                </SelectItem>
                {CARD5_DEPARTMENT_TYPES.map((type) => (
                  <SelectItem className={CARD5_SELECT_ITEM_CLASS} key={type} value={type}>
                    {CARD5_DEPARTMENT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editor ? (
              <Card5CreateButton onClick={() => openCreate(null)}>
                <Plus className="size-4" /> Add Department
              </Card5CreateButton>
            ) : null}
          </div>
          <Card5ConfigNotice
            loading={query.isLoading}
            blockers={shownReadiness.blockers}
            warnings={shownReadiness.warnings}
          />
        </div>
      }
    >
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading departments…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#D8CDBB] p-6 text-sm text-muted-foreground">
          No departments yet. Add a department to start the organization catalogue.
        </p>
      ) : (
        <Card5TableShell>
          <table
            className="w-full table-fixed text-left text-sm"
            data-testid="pms-card5-department-table"
          >
            <thead className={CARD5_THEAD_CLASS}>
              <tr>
                <th className={CARD5_TH_CLASS}>Department</th>
                <th className={`w-24 ${CARD5_TH_CLASS}`}>Code</th>
                <th className={`w-36 ${CARD5_TH_CLASS}`}>Type</th>
                <th className={`w-40 ${CARD5_TH_CLASS}`}>Operating Hours</th>
                <th className={CARD5_STATUS_TH_CLASS}>Status</th>
                <th className={CARD5_ACTIONS_TH_CLASS}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const hasChildren = snapshot.departments.some((item) => item.parentId === row.id);
                const isOpen = expanded.has(row.id);
                return (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div
                        className="flex min-w-0 items-center gap-1"
                        style={{ paddingLeft: `${row.depth}rem` }}
                      >
                        {hasChildren ? (
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground"
                            onClick={() =>
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                return next;
                              })
                            }
                            aria-label={isOpen ? "Collapse" : "Expand"}
                          >
                            {isOpen ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        ) : (
                          <span className="inline-block w-5" />
                        )}
                        <button
                          type="button"
                          className="min-w-0 truncate text-left font-medium text-[#251605]"
                          onClick={() => openEdit(row)}
                        >
                          {row.name}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2">{row.code}</td>
                    <td className="px-3 py-2">
                      {CARD5_DEPARTMENT_TYPE_LABELS[row.departmentType]}
                    </td>
                    <td className="px-3 py-2">
                      {row.operatingHours.is24Hours
                        ? "24 hours"
                        : hoursConfigured(row.operatingHours)
                          ? `${row.operatingHours.daily?.open}–${row.operatingHours.daily?.close}`
                          : "—"}
                    </td>
                    <td className={CARD5_STATUS_TD_CLASS}>
                      <Card5Status active={row.active} />
                    </td>
                    <td className={CARD5_ACTIONS_TD_CLASS}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Card5RowMenuButton label={`Actions for ${row.name}`} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 border-[#DDD4C5]">
                          <DropdownMenuItem onSelect={() => openEdit(row)}>Edit</DropdownMenuItem>
                          {editor ? (
                            <>
                              <DropdownMenuItem onSelect={() => openCreate(row.id)}>
                                Add Sub Department
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  deptMutation.mutate({ ...row, active: !row.active })
                                }
                              >
                                {row.active ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card5TableShell>
      )}
    </PmsPropertySetupCard5Workspace>

      <Card3OverlapSheet
        open={Boolean(draft)}
        title={modalTitle}
        onClose={() => setDraft(null)}
        onSubmit={draft && editor ? () => deptMutation.mutate(draft) : undefined}
        submitLabel="Save"
        pending={deptMutation.isPending}
        canEdit={editor}
        maxWidth="max-w-2xl"
        className="max-h-[85vh]"
        footerJustify="between"
      >
        {draft ? (
          <div data-testid="pms-card5-department-drawer">
            <Tabs
              value={drawerTab}
              onValueChange={(value) => setDrawerTab(value as typeof drawerTab)}
            >
              <TabsList className="mb-3 flex flex-wrap">
                {DRAWER_TABS.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="basic" className="space-y-3">
                <div className="space-y-1">
                  <Label>Department name</Label>
                  <Input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Code</Label>
                  <Input
                    value={draft.code}
                    onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Department type</Label>
                  <Select
                    value={draft.departmentType}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        departmentType: value as Card5Department["departmentType"],
                      })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD5_DEPARTMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {CARD5_DEPARTMENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Parent department</Label>
                  <Select
                    value={draft.parentId ?? "none"}
                    onValueChange={(value) => setDraft({ ...draft, parentId: noneToNull(value) })}
                    disabled={!editor || parentLocked}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {snapshot.departments
                        .filter((row) => !descendantIds.has(row.id))
                        .map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch
                    checked={draft.active}
                    onCheckedChange={(checked) => setDraft({ ...draft, active: checked })}
                    disabled={!editor}
                  />
                </div>
              </TabsContent>
              <TabsContent value="operations" className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>24-hour operation</Label>
                  <Switch
                    checked={draft.operatingHours.is24Hours}
                    onCheckedChange={(checked) => patchHours({ is24Hours: checked })}
                    disabled={!editor}
                  />
                </div>
                {draft.operatingHours.is24Hours ? (
                  <p className="text-sm text-muted-foreground">
                    This department is always open. Daily hours are not required.
                  </p>
                ) : (
                  windowFields(
                    "Daily",
                    draft.operatingHours.daily,
                    (daily) => patchHours({ daily }),
                    "Daily schedule",
                  )
                )}
                {windowFields(
                  "Weekend",
                  draft.operatingHours.weekend,
                  (weekend) => patchHours({ weekend }),
                  "Different weekend hours",
                )}
                {windowFields(
                  "Holiday",
                  draft.operatingHours.holiday,
                  (holiday) => patchHours({ holiday }),
                  "Holiday hours",
                )}
                <div className="space-y-1">
                  <Label>Holiday notes</Label>
                  <Input
                    value={draft.operatingHours.holidayNotes}
                    onChange={(event) => patchHours({ holidayNotes: event.target.value })}
                    disabled={!editor}
                  />
                </div>
              </TabsContent>
              <TabsContent value="financial" className="space-y-3">
                <div className="space-y-1">
                  <Label>Cost center</Label>
                  <Input
                    value={draft.costCenter}
                    onChange={(event) => setDraft({ ...draft, costCenter: event.target.value })}
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Revenue center</Label>
                  <Input
                    value={draft.revenueCenter}
                    onChange={(event) => setDraft({ ...draft, revenueCenter: event.target.value })}
                    disabled={!editor}
                  />
                </div>
              </TabsContent>
              <TabsContent value="routing" className="space-y-3">
                {!draft.id ? (
                  <p className="text-sm text-muted-foreground">
                    Save the department before adding routing rules.
                  </p>
                ) : (
                  <>
                    <ul className="space-y-2 text-sm">
                      {snapshot.routing
                        .filter((row) => row.departmentId === draft.id)
                        .map((row) => (
                          <li
                            key={row.id}
                            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                          >
                            <span>
                              {CARD5_SERVICE_KEY_LABELS[
                                row.serviceKey as keyof typeof CARD5_SERVICE_KEY_LABELS
                              ] ?? row.serviceKey}{" "}
                              → {ROLE_LABELS[row.defaultRole]}
                            </span>
                            {editor ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  routingMutation.mutate({
                                    id: row.id,
                                    serviceKey: row.serviceKey,
                                    departmentId: row.departmentId,
                                    defaultRole: row.defaultRole,
                                    active: !row.active,
                                  })
                                }
                              >
                                {row.active ? "Deactivate" : "Activate"}
                              </Button>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                    {editor ? (
                      <div className="space-y-2 border-t pt-3">
                        <Label>Add routing</Label>
                        <Select value={routingKey} onValueChange={setRoutingKey}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CARD5_SUGGESTED_SERVICE_KEYS.map((key) => (
                              <SelectItem key={key} value={key}>
                                {CARD5_SERVICE_KEY_LABELS[key]}
                              </SelectItem>
                            ))}
                            <SelectItem value="custom">Custom key</SelectItem>
                          </SelectContent>
                        </Select>
                        {routingKey === "custom" ? (
                          <Input
                            value={customServiceKey}
                            onChange={(event) => setCustomServiceKey(event.target.value)}
                            placeholder="custom_service_key"
                          />
                        ) : null}
                        <Select
                          value={routingRole}
                          onValueChange={(value) =>
                            setRoutingRole(value as (typeof CARD5_STAFF_ROLES)[number])
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CARD5_STAFF_ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            routingMutation.mutate({
                              serviceKey: routingKey === "custom" ? customServiceKey : routingKey,
                              departmentId: draft.id,
                              defaultRole: routingRole,
                              active: true,
                            })
                          }
                        >
                          Save routing
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </TabsContent>
              <TabsContent value="advanced" className="space-y-3">
                <div className="space-y-1">
                  <Label>Manager</Label>
                  <Select
                    value={draft.managerUserId ?? "none"}
                    onValueChange={(value) =>
                      setDraft({ ...draft, managerUserId: noneToNull(value) })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {snapshot.staff
                        .filter((row) => row.active)
                        .map((row) => (
                          <SelectItem key={row.userId} value={row.userId}>
                            {row.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Responsible role</Label>
                  <Select
                    value={draft.responsibleRole ?? "none"}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        responsibleRole:
                          value === "none" ? null : (value as Card5Department["responsibleRole"]),
                      })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {CARD5_STAFF_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Default language</Label>
                  <Select
                    value={draft.defaultLanguage || "none"}
                    onValueChange={(value) =>
                      setDraft({ ...draft, defaultLanguage: value === "none" ? "" : value })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {CARD1_LANGUAGES.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Notification channel</Label>
                  <Select
                    value={draft.defaultNotificationChannel ?? "none"}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        defaultNotificationChannel:
                          value === "none"
                            ? null
                            : (value as Card5Department["defaultNotificationChannel"]),
                      })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {CARD5_NOTIFICATION_CHANNELS.map((channel) => (
                        <SelectItem key={channel} value={channel}>
                          {channel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Default priority</Label>
                  <Select
                    value={draft.defaultPriority ?? "none"}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        defaultPriority:
                          value === "none" ? null : (value as Card5Department["defaultPriority"]),
                      })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {CARD5_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Default SLA (minutes)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draft.defaultSlaMinutes ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        defaultSlaMinutes: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Escalation manager</Label>
                  <Select
                    value={draft.escalationManagerUserId ?? "none"}
                    onValueChange={(value) =>
                      setDraft({ ...draft, escalationManagerUserId: noneToNull(value) })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {snapshot.staff
                        .filter((row) => row.active)
                        .map((row) => (
                          <SelectItem key={row.userId} value={row.userId}>
                            {row.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </Card3OverlapSheet>
    </>
  );
}
