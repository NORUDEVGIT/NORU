import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Switch } from "@/shared/components/ui/switch";
import {
  getFiscalIntegrationStatus,
  saveFiscalBuyerCodeMapping,
  saveFiscalCredentials,
  saveFiscalIntegrationConfig,
  saveFiscalItemMapping,
  saveFiscalModeMapping,
  saveFiscalTaxMapping,
  testFiscalConnection,
} from "@/packages/pms/lib/fiscal/fiscal.functions";
import {
  FISCAL_MODE_CONTEXT_LABELS,
  type FiscalCatalogRow,
  type FiscalModeContext,
} from "@/packages/pms/lib/fiscal/fiscal.types";

type MappingSnapshot = {
  taxes: FiscalCatalogRow[];
  taxMappings: FiscalCatalogRow[];
  departments: FiscalCatalogRow[];
  serviceTypes: FiscalCatalogRow[];
  itemMappings: FiscalCatalogRow[];
  chargeSources: readonly string[];
  modeContexts: readonly FiscalModeContext[];
  modeMappings: FiscalCatalogRow[];
  buyerTypes: readonly string[];
};

const SECTIONS = ["Connection", "Credentials", "Mappings", "Status"] as const;

function formatWhen(value: string | null): string {
  if (!value) return "Not tested";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FiscalIntegrationDrawer({
  open,
  onOpenChange,
  restaurantId,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getFiscalIntegrationStatus);
  const saveConfig = useServerFn(saveFiscalIntegrationConfig);
  const saveCredentials = useServerFn(saveFiscalCredentials);
  const testConnection = useServerFn(testFiscalConnection);
  const saveTax = useServerFn(saveFiscalTaxMapping);
  const saveItem = useServerFn(saveFiscalItemMapping);
  const saveMode = useServerFn(saveFiscalModeMapping);
  const saveBuyer = useServerFn(saveFiscalBuyerCodeMapping);

  const query = useQuery({
    queryKey: ["fiscal-integration", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    enabled: open,
  });
  const status = query.data;
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Connection");
  const [environment, setEnvironment] = useState<"TEST" | "PRODUCTION">("TEST");
  const [baseUrl, setBaseUrl] = useState("");
  const [taxpayerTin, setTaxpayerTin] = useState("");
  const [client, setClient] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [replaceCredentials, setReplaceCredentials] = useState(false);

  useEffect(() => {
    if (!status) return;
    setEnvironment(status.connection.environment);
    setBaseUrl(status.connection.baseUrl);
    setTaxpayerTin(status.connection.taxpayerTin);
    setClient(status.connection.client);
    setDeviceId(status.connection.deviceId);
    setEnabled(status.connection.enabled);
  }, [status]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["fiscal-integration", restaurantId] });
    await queryClient.invalidateQueries({ queryKey: ["pms-card6-integrations", restaurantId] });
  };

  const configMutation = useMutation({
    mutationFn: () =>
      saveConfig({
        data: { restaurantId, environment, baseUrl, taxpayerTin, client, deviceId, enabled },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Fiscal connection saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const credentialMutation = useMutation({
    mutationFn: () =>
      saveCredentials({ data: { restaurantId, apiUsername: username, apiPassword: password } }),
    onSuccess: async () => {
      setUsername("");
      setPassword("");
      setReplaceCredentials(false);
      await refresh();
      toast.success("Credentials saved. They are not shown again.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: () => testConnection({ data: { restaurantId } }),
    onSuccess: async (result) => {
      await refresh();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl"
        data-testid="fiscal-integration-drawer"
      >
        <SheetHeader className="border-b border-[#E5DED1] px-6 py-4 text-left">
          <SheetTitle className="font-display text-xl text-[#251605]">
            ERP / Fiscal Integration
          </SheetTitle>
          <SheetDescription>
            Connect NORU financial documents to the external fiscal service. Fiscal document
            registration is not yet enabled.
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-2 border-b border-[#E5DED1] px-6 py-3">
          {SECTIONS.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={section === item ? "default" : "outline"}
              onClick={() => setSection(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="space-y-4 px-6 py-4">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading fiscal settings…</p>
          ) : null}
          {section === "Connection" && status ? (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                configMutation.mutate();
              }}
            >
              <Label>Environment</Label>
              <Select
                value={environment}
                onValueChange={(value) => setEnvironment(value as "TEST" | "PRODUCTION")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEST">TEST</SelectItem>
                  <SelectItem value="PRODUCTION">PRODUCTION</SelectItem>
                </SelectContent>
              </Select>
              <Label htmlFor="fiscal-base-url">Base URL</Label>
              <Input
                id="fiscal-base-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://"
                disabled={!canEdit}
              />
              <Label htmlFor="fiscal-tin">Taxpayer TIN</Label>
              <Input
                id="fiscal-tin"
                value={taxpayerTin}
                onChange={(event) => setTaxpayerTin(event.target.value)}
                disabled={!canEdit}
              />
              <Label htmlFor="fiscal-client">Client</Label>
              <Input
                id="fiscal-client"
                value={client}
                onChange={(event) => setClient(event.target.value)}
                disabled={!canEdit}
              />
              <Label htmlFor="fiscal-device">Device ID</Label>
              <Input
                id="fiscal-device"
                value={deviceId}
                onChange={(event) => setDeviceId(event.target.value)}
                disabled={!canEdit}
              />
              <div className="flex items-center justify-between">
                <Label htmlFor="fiscal-enabled">Enabled</Label>
                <Switch
                  id="fiscal-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  disabled={!canEdit}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Production requires an https URL. No production endpoint is assumed.
              </p>
              {canEdit ? (
                <Button
                  type="submit"
                  disabled={configMutation.isPending}
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                >
                  Save connection
                </Button>
              ) : null}
            </form>
          ) : null}
          {section === "Credentials" && status ? (
            <div className="space-y-3">
              <p className="text-sm text-[#251605]">API Username: {status.credentials.username}</p>
              <p className="text-sm text-[#251605]">API Password: {status.credentials.password}</p>
              {status.credentials.configured && !replaceCredentials ? (
                canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setReplaceCredentials(true)}
                  >
                    Replace credentials
                  </Button>
                ) : null
              ) : canEdit ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    credentialMutation.mutate();
                  }}
                >
                  <Label htmlFor="fiscal-username">API Username</Label>
                  <Input
                    id="fiscal-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="off"
                  />
                  <Label htmlFor="fiscal-password">API Password</Label>
                  <Input
                    id="fiscal-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                  <Button type="submit" disabled={credentialMutation.isPending}>
                    Save credentials
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
          {section === "Mappings" && status ? (
            <FiscalMappings
              status={status}
              canEdit={canEdit}
              onTax={(input) => saveTax({ data: { restaurantId, ...input } }).then(() => refresh())}
              onItem={(input) =>
                saveItem({ data: { restaurantId, ...input } }).then(() => refresh())
              }
              onMode={(input) =>
                saveMode({ data: { restaurantId, ...input } }).then(() => refresh())
              }
              onBuyer={(input) =>
                saveBuyer({ data: { restaurantId, ...input } }).then(() => refresh())
              }
            />
          ) : null}
          {section === "Status" && status ? (
            <div className="space-y-2 text-sm text-[#251605]">
              <p>
                Connection:{" "}
                {status.lastTestResult === "passed"
                  ? "Connected"
                  : status.lastTestResult === "failed"
                    ? "Failed"
                    : "Not tested"}
              </p>
              <p>Environment: {status.connection.environment}</p>
              <p>Taxpayer TIN: {status.connection.taxpayerTinMasked || "Not configured"}</p>
              <p>Device ID: {status.connection.deviceIdMasked || "Not configured"}</p>
              <p>Credentials: {status.credentials.configured ? "Configured" : "Missing"}</p>
              <p>Last test: {formatWhen(status.lastTestAt)}</p>
              <p>
                Token:{" "}
                {status.token.hasToken && status.token.expiresAt
                  ? `Valid until ${formatWhen(status.token.expiresAt)}`
                  : "Not available"}
              </p>
              <p>
                Tax codes:{" "}
                {
                  (status.taxMappings as { mapping_kind: string }[]).filter(
                    (row) => row.mapping_kind === "TAX",
                  ).length
                }{" "}
                / {status.taxes.length} mapped
              </p>
              <p>Items: {status.itemMappings.length} configured</p>
              <p>
                Modes: {status.modeMappings.length} / {status.modeContexts.length}
              </p>
              <p>Buyer codes: {status.buyerMappings.length} configured</p>
              <p>
                Queue: {status.queue.pending} pending, {status.queue.failed} failed,{" "}
                {status.queue.registered} registered
              </p>
              <p className="text-muted-foreground">{status.registrationNotice}</p>
              <p className="text-muted-foreground">{status.buyerNotice}</p>
              <p className="text-muted-foreground">
                {status.readiness.authReady
                  ? "Authentication can be tested."
                  : "Authentication still needs an endpoint, TIN, client, and credentials."}{" "}
                Document registration is not active.
              </p>
              {canEdit ? (
                <Button
                  type="button"
                  disabled={testMutation.isPending}
                  onClick={() => testMutation.mutate()}
                  data-testid="fiscal-test-connection"
                >
                  {testMutation.isPending ? "Testing..." : "Test Connection"}
                </Button>
              ) : null}
              {testMutation.data ? (
                <p className={testMutation.data.ok ? "text-[#436436]" : "text-destructive"}>
                  {testMutation.data.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FiscalMappings({
  status,
  canEdit,
  onTax,
  onItem,
  onMode,
  onBuyer,
}: {
  status: MappingSnapshot;
  canEdit: boolean;
  onTax: (input: {
    mappingKind: "TAX" | "NO_TAX";
    pmsTaxId: string | null;
    externalTaxCode: string;
  }) => Promise<unknown>;
  onItem: (input: {
    serviceTypeId: string | null;
    departmentId: string | null;
    chargeSource: string | null;
    isDefault: boolean;
    externalItemCode: string;
    externalUnit: string;
    natureOfSupplies: string;
    harmonizationCode: string | null;
  }) => Promise<unknown>;
  onMode: (input: { documentContext: FiscalModeContext; externalMode: string }) => Promise<unknown>;
  onBuyer: (input: {
    mappingType: string;
    internalValue: string;
    externalValue: string;
  }) => Promise<unknown>;
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-medium text-[#251605]">Tax codes</h3>
        {status.taxes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No NORU taxes are configured for this property.
          </p>
        ) : null}
        {status.taxes.map((tax: FiscalCatalogRow) => {
          const current = status.taxMappings.find(
            (row: FiscalCatalogRow) => row.pms_tax_id === tax.id,
          );
          return (
            <MappingRow
              key={tax.id}
              title={`${tax.name} (${tax.code})`}
              detail={`${tax.charge_type} ${tax.amount}`}
              statusLabel={current ? "Mapped" : "Missing"}
              canEdit={canEdit}
              initial={current?.external_tax_code ?? ""}
              placeholder="External TaxCode"
              onSave={(value) =>
                onTax({ mappingKind: "TAX", pmsTaxId: tax.id, externalTaxCode: value })
              }
            />
          );
        })}
        <MappingRow
          title="No tax / exempt"
          detail="Enter the provider code. NORU does not guess one."
          statusLabel={
            status.taxMappings.some((row: FiscalCatalogRow) => row.mapping_kind === "NO_TAX")
              ? "Mapped"
              : "Missing"
          }
          canEdit={canEdit}
          initial={
            status.taxMappings.find((row: FiscalCatalogRow) => row.mapping_kind === "NO_TAX")
              ?.external_tax_code ?? ""
          }
          placeholder="External code for untaxed lines"
          onSave={(value) =>
            onTax({ mappingKind: "NO_TAX", pmsTaxId: null, externalTaxCode: value })
          }
        />
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-[#251605]">Items</h3>
        <p className="text-xs text-muted-foreground">
          Room and service fiscal mappings are required before document registration can be enabled.
          Do not copy sample codes.
        </p>
        <ItemRow
          title="Room revenue"
          detail="charge source: room"
          current={status.itemMappings.find(
            (row: FiscalCatalogRow) => row.charge_source === "room",
          )}
          canEdit={canEdit}
          onSave={(values) =>
            onItem({
              ...values,
              serviceTypeId: null,
              departmentId: null,
              chargeSource: "room",
              isDefault: false,
            })
          }
        />
        {status.departments.map((department: FiscalCatalogRow) => (
          <ItemRow
            key={department.id}
            title={department.name}
            detail={`department ${department.code}`}
            current={status.itemMappings.find(
              (row: FiscalCatalogRow) => row.department_id === department.id,
            )}
            canEdit={canEdit}
            onSave={(values) =>
              onItem({
                ...values,
                serviceTypeId: null,
                departmentId: department.id,
                chargeSource: null,
                isDefault: false,
              })
            }
          />
        ))}
        {status.serviceTypes.map((service: FiscalCatalogRow) => (
          <ItemRow
            key={service.id}
            title={service.name}
            detail={`service ${service.code}`}
            current={status.itemMappings.find(
              (row: FiscalCatalogRow) => row.service_type_id === service.id,
            )}
            canEdit={canEdit}
            onSave={(values) =>
              onItem({
                ...values,
                serviceTypeId: service.id,
                departmentId: null,
                chargeSource: null,
                isDefault: false,
              })
            }
          />
        ))}
        {status.chargeSources
          .filter((source: string) => source !== "room")
          .map((source: string) => (
            <ItemRow
              key={source}
              title={source}
              detail="charge source"
              current={status.itemMappings.find(
                (row: FiscalCatalogRow) => row.charge_source === source,
              )}
              canEdit={canEdit}
              onSave={(values) =>
                onItem({
                  ...values,
                  serviceTypeId: null,
                  departmentId: null,
                  chargeSource: source,
                  isDefault: false,
                })
              }
            />
          ))}
        <ItemRow
          title="Property default"
          detail="used when nothing more specific matches"
          current={status.itemMappings.find((row: FiscalCatalogRow) => row.is_default)}
          canEdit={canEdit}
          onSave={(values) =>
            onItem({
              ...values,
              serviceTypeId: null,
              departmentId: null,
              chargeSource: null,
              isDefault: true,
            })
          }
        />
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-[#251605]">Fiscal mode</h3>
        <p className="text-xs text-muted-foreground">
          Valid fiscal Mode values must be confirmed with the provider.
        </p>
        {status.modeContexts.map((context: FiscalModeContext) => {
          const current = status.modeMappings.find(
            (row: FiscalCatalogRow) => row.document_context === context,
          );
          return (
            <MappingRow
              key={context}
              title={FISCAL_MODE_CONTEXT_LABELS[context]}
              detail=""
              statusLabel={current ? "Mapped" : "Missing"}
              canEdit={canEdit}
              initial={current?.external_mode ?? ""}
              placeholder="External Mode"
              onSave={(value) => onMode({ documentContext: context, externalMode: value })}
            />
          );
        })}
      </section>
      <BuyerRow canEdit={canEdit} types={status.buyerTypes} onSave={onBuyer} />
    </div>
  );
}

function MappingRow({
  title,
  detail,
  statusLabel,
  canEdit,
  initial,
  placeholder,
  onSave,
}: {
  title: string;
  detail: string;
  statusLabel: string;
  canEdit: boolean;
  initial: string;
  placeholder: string;
  onSave: (value: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <div className="grid gap-2 rounded-xl border border-[#E5DED1] p-3 md:grid-cols-[1fr_12rem_auto]">
      <div>
        <p className="text-sm font-medium text-[#251605]">{title}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
        <p className="text-xs text-muted-foreground">{statusLabel}</p>
      </div>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        disabled={!canEdit}
      />
      {canEdit ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => onSave(value).catch((error: Error) => toast.error(error.message))}
        >
          Save
        </Button>
      ) : null}
    </div>
  );
}

function ItemRow({
  title,
  detail,
  current,
  canEdit,
  onSave,
}: {
  title: string;
  detail: string;
  current: FiscalCatalogRow | undefined;
  canEdit: boolean;
  onSave: (values: {
    externalItemCode: string;
    externalUnit: string;
    natureOfSupplies: string;
    harmonizationCode: string | null;
  }) => Promise<unknown>;
}) {
  const [itemCode, setItemCode] = useState(current?.external_item_code ?? "");
  const [unit, setUnit] = useState(current?.external_unit ?? "");
  const [nature, setNature] = useState(current?.nature_of_supplies ?? "");
  const [harmonization, setHarmonization] = useState(current?.harmonization_code ?? "");
  useEffect(() => {
    setItemCode(current?.external_item_code ?? "");
    setUnit(current?.external_unit ?? "");
    setNature(current?.nature_of_supplies ?? "");
    setHarmonization(current?.harmonization_code ?? "");
  }, [current]);
  const complete = Boolean(
    current?.external_item_code && current?.external_unit && current?.nature_of_supplies,
  );
  return (
    <div className="space-y-2 rounded-xl border border-[#E5DED1] p-3">
      <p className="text-sm font-medium text-[#251605]">{title}</p>
      <p className="text-xs text-muted-foreground">
        {detail} · {complete ? "Mapped" : "Incomplete"}
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          value={itemCode}
          placeholder="ERP ItemCode"
          onChange={(event) => setItemCode(event.target.value)}
          disabled={!canEdit}
        />
        <Input
          value={unit}
          placeholder="ERP Unit"
          onChange={(event) => setUnit(event.target.value)}
          disabled={!canEdit}
        />
        <Input
          value={nature}
          placeholder="Nature of supplies"
          onChange={(event) => setNature(event.target.value)}
          disabled={!canEdit}
        />
        <Input
          value={harmonization}
          placeholder="Harmonization code (optional)"
          onChange={(event) => setHarmonization(event.target.value)}
          disabled={!canEdit}
        />
      </div>
      {canEdit ? (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onSave({
              externalItemCode: itemCode,
              externalUnit: unit,
              natureOfSupplies: nature,
              harmonizationCode: harmonization.trim() || null,
            }).catch((error: Error) => toast.error(error.message))
          }
        >
          Save
        </Button>
      ) : null}
    </div>
  );
}

function BuyerRow({
  canEdit,
  types,
  onSave,
}: {
  canEdit: boolean;
  types: string[];
  onSave: (input: {
    mappingType: string;
    internalValue: string;
    externalValue: string;
  }) => Promise<unknown>;
}) {
  const [mappingType, setMappingType] = useState(types[0] ?? "ID_TYPE");
  const [internalValue, setInternalValue] = useState("");
  const [externalValue, setExternalValue] = useState("");
  return (
    <section className="space-y-2">
      <h3 className="font-medium text-[#251605]">Buyer codes</h3>
      <p className="text-xs text-muted-foreground">
        Map a NORU value to the provider code. No code list is prefilled.
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        <Select value={mappingType} onValueChange={setMappingType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={internalValue}
          placeholder="NORU value"
          onChange={(event) => setInternalValue(event.target.value)}
          disabled={!canEdit}
        />
        <Input
          value={externalValue}
          placeholder="External code"
          onChange={(event) => setExternalValue(event.target.value)}
          disabled={!canEdit}
        />
      </div>
      {canEdit ? (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onSave({ mappingType, internalValue, externalValue })
              .then(() => {
                setInternalValue("");
                setExternalValue("");
              })
              .catch((error: Error) => toast.error(error.message))
          }
        >
          Save buyer code
        </Button>
      ) : null}
    </section>
  );
}
