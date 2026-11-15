import { useEffect, useRef, useState } from "react";
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
import { cn } from "@/shared/lib/utils";
import {
  FieldShell,
  IntegrationNotice,
  IntegrationStatusBadge,
  SecretInput,
} from "@/packages/pms/components/settings/pms-card6-integration-bits";
import {
  ensureFiscalItemMappings,
  getFiscalIntegrationStatus,
  saveFiscalCredentials,
  saveFiscalIntegrationConfig,
  saveFiscalItemMapping,
  saveFiscalTaxMapping,
  testFiscalConnection,
} from "@/packages/pms/lib/fiscal/fiscal.functions";
import {
  FISCAL_DOCUMENT_MODE,
  FISCAL_ITEM_UNIT,
  FISCAL_MAPPING_CHARGE_SOURCES,
  fiscalItemCodeNumber,
  fiscalNatureOfSupplies,
  providerTaxCode,
  type FiscalCatalogRow,
  type FiscalNatureOfSupplies,
} from "@/packages/pms/lib/fiscal/fiscal.types";

type MappingSnapshot = {
  taxes: FiscalCatalogRow[];
  taxMappings: FiscalCatalogRow[];
  departments?: FiscalCatalogRow[];
  serviceTypes: FiscalCatalogRow[];
  itemMappings: FiscalCatalogRow[];
  chargeSources: readonly string[];
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
  const ensureItems = useServerFn(ensureFiscalItemMappings);
  const itemsSeeded = useRef(false);

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
    if (!open) itemsSeeded.current = false;
  }, [open]);

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

  useEffect(() => {
    if (!open || section !== "Mappings" || !canEdit || !status || itemsSeeded.current) return;
    itemsSeeded.current = true;
    void ensureItems({ data: { restaurantId } })
      .then(async (result) => {
        if (result.pendingConnection) {
          itemsSeeded.current = false;
          return;
        }
        if (result.created > 0) await refresh();
      })
      .catch((error: Error) => {
        itemsSeeded.current = false;
        toast.error(error.message);
      });
  }, [open, section, canEdit, status, restaurantId, ensureItems]);

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
            Connect NORU financial documents to the external fiscal service. Guest B2C invoice
            registration can be started from an issued invoice. Other fiscal documents are not
            enabled.
          </SheetDescription>
        </SheetHeader>
        <div className="flex items-center gap-1.5 border-b border-[#E5DED1] bg-[#FAF8F5] px-6 py-2.5">
          {SECTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSection(item)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                section === item
                  ? "bg-[#251605] text-white shadow-xs"
                  : "text-muted-foreground hover:bg-black/5 hover:text-[#251605]",
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="space-y-4 px-6 py-4">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading fiscal settings…</p>
          ) : null}
          {section === "Connection" && status ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                configMutation.mutate();
              }}
            >
              <FieldShell id="fiscal-env" label="Environment" required>
                <Select
                  value={environment}
                  onValueChange={(value) => setEnvironment(value as "TEST" | "PRODUCTION")}
                  disabled={!canEdit}
                >
                  <SelectTrigger id="fiscal-env">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEST">TEST (Sandbox)</SelectItem>
                    <SelectItem value="PRODUCTION">PRODUCTION (Live)</SelectItem>
                  </SelectContent>
                </Select>
              </FieldShell>

              <FieldShell
                id="fiscal-base-url"
                label="Base URL"
                required
                help="Base endpoint URL for the fiscal service."
              >
                <Input
                  id="fiscal-base-url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://fiscal-api.example.com"
                  disabled={!canEdit}
                />
              </FieldShell>

              <FieldShell
                id="fiscal-tin"
                label="Taxpayer TIN"
                required
                help="Taxpayer identification number registered with the tax authority."
              >
                <Input
                  id="fiscal-tin"
                  value={taxpayerTin}
                  onChange={(event) => setTaxpayerTin(event.target.value)}
                  placeholder="e.g. 0012345678"
                  disabled={!canEdit}
                />
              </FieldShell>

              <FieldShell id="fiscal-client" label="Client ID" required>
                <Input
                  id="fiscal-client"
                  value={client}
                  onChange={(event) => setClient(event.target.value)}
                  placeholder="e.g. NORU_POS_CLIENT"
                  disabled={!canEdit}
                />
              </FieldShell>

              <FieldShell id="fiscal-device" label="Device ID" required>
                <Input
                  id="fiscal-device"
                  value={deviceId}
                  onChange={(event) => setDeviceId(event.target.value)}
                  placeholder="e.g. DEV-883921"
                  disabled={!canEdit}
                />
              </FieldShell>

              <div className="flex items-start justify-between gap-4 rounded-xl border border-[#E5DED1] bg-white p-3.5">
                <div>
                  <Label htmlFor="fiscal-enabled" className="text-sm font-medium text-[#251605]">
                    Enabled
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Active for fiscal invoice and receipt registration.
                  </p>
                </div>
                <Switch
                  id="fiscal-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  disabled={!canEdit}
                  aria-label="Enabled"
                />
              </div>

              <IntegrationNotice>
                Production requires an HTTPS URL. No production endpoint is assumed.
              </IntegrationNotice>

              {canEdit ? (
                <Button
                  type="submit"
                  disabled={configMutation.isPending}
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                >
                  {configMutation.isPending ? "Saving..." : "Save connection"}
                </Button>
              ) : null}
            </form>
          ) : null}
          {section === "Credentials" && status ? (
            <div className="space-y-4">
              <IntegrationNotice tone="warning">
                Credentials are encrypted before saving and never revealed in plain text.
              </IntegrationNotice>

              <div className="rounded-xl border border-[#E5DED1] bg-white p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">API Username</p>
                    <p className="mt-1 text-sm font-medium text-[#251605]">
                      {status.credentials.username}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">API Password</p>
                    <p className="mt-1 text-sm font-medium text-[#251605]">
                      {status.credentials.password}
                    </p>
                  </div>
                </div>
              </div>

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
                  className="space-y-4 rounded-xl border border-[#E5DED1] bg-white p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    credentialMutation.mutate();
                  }}
                >
                  <FieldShell id="fiscal-username" label="API Username" required>
                    <Input
                      id="fiscal-username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Enter API username"
                      autoComplete="off"
                    />
                  </FieldShell>

                  <FieldShell id="fiscal-password" label="API Password" required>
                    <SecretInput
                      id="fiscal-password"
                      value={password}
                      onChange={setPassword}
                      placeholder="Enter API password"
                    />
                  </FieldShell>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      type="submit"
                      disabled={credentialMutation.isPending}
                      className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                    >
                      {credentialMutation.isPending ? "Saving..." : "Save credentials"}
                    </Button>
                    {status.credentials.configured ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setReplaceCredentials(false)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
          {section === "Mappings" && status ? (
            <FiscalMappings
              status={status}
              canEdit={canEdit}
              onTax={(input) =>
                saveTax({ data: { restaurantId, ...input } }).then(async () => {
                  await refresh();
                  toast.success("Tax mapping saved.");
                })
              }
              onItem={(input) =>
                saveItem({ data: { restaurantId, ...input } }).then(async () => {
                  await refresh();
                  toast.success("Item mapping saved.");
                })
              }
            />
          ) : null}
          {section === "Status" && status ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#E5DED1] bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#251605]">Integration Status</p>
                    <p className="text-xs text-muted-foreground">
                      Last tested: {formatWhen(status.lastTestAt)}
                    </p>
                  </div>
                  <IntegrationStatusBadge
                    status={
                      status.lastTestResult === "passed"
                        ? "connected"
                        : status.lastTestResult === "failed"
                          ? "error"
                          : status.status === "configured"
                            ? "pending"
                            : "not_configured"
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-[#E5DED1] bg-white p-3">
                  <p className="text-xs text-muted-foreground">Environment</p>
                  <p className="mt-1 font-medium text-[#251605]">{status.connection.environment}</p>
                </div>
                <div className="rounded-xl border border-[#E5DED1] bg-white p-3">
                  <p className="text-xs text-muted-foreground">Taxpayer TIN</p>
                  <p className="mt-1 font-medium text-[#251605]">
                    {status.connection.taxpayerTinMasked || "Not configured"}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5DED1] bg-white p-3">
                  <p className="text-xs text-muted-foreground">Device ID</p>
                  <p className="mt-1 font-medium text-[#251605]">
                    {status.connection.deviceIdMasked || "Not configured"}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5DED1] bg-white p-3">
                  <p className="text-xs text-muted-foreground">Credentials</p>
                  <p className="mt-1 font-medium text-[#251605]">
                    {status.credentials.configured ? "Configured" : "Missing"}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5DED1] bg-white p-3">
                  <p className="text-xs text-muted-foreground">Tax Codes Mapped</p>
                  <p className="mt-1 font-medium text-[#251605]">
                    {
                      (status.taxMappings as { mapping_kind: string }[]).filter(
                        (row) => row.mapping_kind === "TAX",
                      ).length
                    }{" "}
                    / {status.taxes.length}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5DED1] bg-white p-3">
                  <p className="text-xs text-muted-foreground">Items Configured</p>
                  <p className="mt-1 font-medium text-[#251605]">{status.itemMappings.length}</p>
                </div>
              </div>

              <div className="rounded-xl border border-[#E5DED1] bg-white p-3 text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-[#251605]">Token: </span>
                  {status.token.hasToken && status.token.expiresAt
                    ? `Valid until ${formatWhen(status.token.expiresAt)}`
                    : "Not available"}
                </p>
                <p>
                  <span className="font-medium text-[#251605]">Document mode: </span>
                  {FISCAL_DOCUMENT_MODE}
                </p>
                <p>
                  <span className="font-medium text-[#251605]">Registration Queue: </span>
                  {status.queue.pending} pending, {status.queue.failed} failed,{" "}
                  {status.queue.registered} registered
                </p>
              </div>

              <IntegrationNotice>
                {status.registrationNotice}
              </IntegrationNotice>

              <IntegrationNotice>
                {status.readiness.authReady
                  ? "Authentication can be tested."
                  : "Authentication still needs an endpoint, TIN, client, and credentials."}{" "}
                Document registration is not active.
              </IntegrationNotice>

              {canEdit ? (
                <Button
                  type="button"
                  disabled={testMutation.isPending}
                  onClick={() => testMutation.mutate()}
                  data-testid="fiscal-test-connection"
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                >
                  {testMutation.isPending ? "Testing connection..." : "Test Connection"}
                </Button>
              ) : null}
              {testMutation.data ? (
                <p
                  className={cn(
                    "text-xs font-medium rounded-lg p-2.5",
                    testMutation.data.ok
                      ? "bg-[#436436]/10 text-[#436436]"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
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
}: {
  status: MappingSnapshot;
  canEdit: boolean;
  onTax: (input: {
    mappingKind: "TAX" | "NO_TAX";
    pmsTaxId: string | null;
    externalTaxCode: string;
    fiscalTreatment?: "SAME_LINE_TAX" | "SEPARATE_ITEM";
    externalItemCode?: string;
    natureOfSupplies?: FiscalNatureOfSupplies;
    harmonizationCode?: string | null;
  }) => Promise<unknown>;
  onItem: (input: {
    serviceTypeId: string | null;
    departmentId: string | null;
    chargeSource: string | null;
    isDefault: boolean;
    externalItemCode: string;
    natureOfSupplies: FiscalNatureOfSupplies;
    harmonizationCode: string | null;
  }) => Promise<unknown>;
}) {
  const [itemsOpen, setItemsOpen] = useState(false);
  const chargeSources = FISCAL_MAPPING_CHARGE_SOURCES.filter((source) => source !== "room");
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-medium text-[#251605]">Tax codes</h3>
        <p className="text-xs text-muted-foreground">
          Enter the provider TaxCode for each NORU tax. Apply it on the source item, or create a
          separate fiscal item. VAT15 and VAT0 are known examples. The percentage is not copied
          automatically.
        </p>
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
            <TaxMappingRow
              key={tax.id}
              title={`${tax.name} (${tax.code})`}
              detail={`${tax.charge_type} ${tax.amount}`}
              current={current}
              canEdit={canEdit}
              onSave={(values) =>
                onTax({
                  mappingKind: "TAX",
                  pmsTaxId: tax.id,
                  externalTaxCode: values.taxCode,
                  ...values,
                })
              }
            />
          );
        })}
        <MappingRow
          title="No tax / exempt"
          detail="Enter the provider code in capitals. NORU does not guess one."
          uppercase
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
            onTax({
              mappingKind: "NO_TAX",
              pmsTaxId: null,
              externalTaxCode: value,
              fiscalTreatment: "SAME_LINE_TAX",
            })
          }
        />
      </section>
      <section className="space-y-2">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl border border-[#E5DED1] px-3 py-2 text-left"
          aria-expanded={itemsOpen}
          onClick={() => setItemsOpen((open) => !open)}
        >
          <span>
            <span className="block text-sm font-medium text-[#251605]">Item codes</span>
            <span className="block text-xs text-muted-foreground">
              Prefilled as Service. Expand to change a code or nature.
            </span>
          </span>
          <span className="text-xs text-muted-foreground">{itemsOpen ? "Hide" : "Show"}</span>
        </button>
        {itemsOpen ? (
          <div className="space-y-2">
            <ItemRow
              title="Room Accommodation"
              detail="One fiscal item for every rate plan"
              defaultNature="service"
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
            {status.serviceTypes.map((service: FiscalCatalogRow) => (
              <ItemRow
                key={service.id}
                title={service.name ?? "Service"}
                detail={`service ${service.code ?? ""}`}
                defaultNature="service"
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
            {chargeSources.map((source) => (
              <ItemRow
                key={source}
                title={source}
                detail="charge source"
                defaultNature="service"
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
              defaultNature="service"
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
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TaxMappingRow({
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
    taxCode: string;
    fiscalTreatment: "SAME_LINE_TAX" | "SEPARATE_ITEM";
    externalItemCode: string;
    natureOfSupplies: FiscalNatureOfSupplies;
    harmonizationCode: string | null;
  }) => Promise<unknown>;
}) {
  const separate = current?.fiscal_treatment === "SEPARATE_ITEM";
  const [taxCode, setTaxCode] = useState(providerTaxCode(current?.external_tax_code ?? ""));
  const [treatment, setTreatment] = useState<"SAME_LINE_TAX" | "SEPARATE_ITEM">(
    separate ? "SEPARATE_ITEM" : "SAME_LINE_TAX",
  );
  const [itemCode, setItemCode] = useState(current?.external_item_code ?? "");
  const [nature, setNature] = useState<FiscalNatureOfSupplies>(
    fiscalNatureOfSupplies(current?.nature_of_supplies ?? "") ?? "service",
  );
  useEffect(() => {
    setTaxCode(providerTaxCode(current?.external_tax_code ?? ""));
    setTreatment(current?.fiscal_treatment === "SEPARATE_ITEM" ? "SEPARATE_ITEM" : "SAME_LINE_TAX");
    setItemCode(current?.external_item_code ?? "");
    setNature(fiscalNatureOfSupplies(current?.nature_of_supplies ?? "") ?? "service");
  }, [current]);
  return (
    <div className="space-y-2 rounded-xl border border-[#E5DED1] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#251605]">{title}</p>
          <p className="text-xs text-muted-foreground">
            {detail} · {current ? (separate ? "Separate item" : "Mapped") : "Missing"}
          </p>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Provider tax code</Label>
          <Input
            value={taxCode}
            placeholder="External TaxCode"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(event) => setTaxCode(providerTaxCode(event.target.value))}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-1">
          <Label>Fiscal treatment</Label>
          <Select
            value={treatment}
            onValueChange={(value) => setTreatment(value as "SAME_LINE_TAX" | "SEPARATE_ITEM")}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SAME_LINE_TAX">Apply on source item</SelectItem>
              <SelectItem value="SEPARATE_ITEM">Create separate fiscal item</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {treatment === "SEPARATE_ITEM" ? (
          <>
            <div className="space-y-1">
              <Label>Fiscal item code</Label>
              <Input
                value={itemCode}
                placeholder="Assigned on save"
                onChange={(event) => setItemCode(event.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1">
              <Label>Nature of supplies</Label>
              <Select
                value={nature}
                onValueChange={(value) => setNature(value as FiscalNatureOfSupplies)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="goods">Goods</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Input value={FISCAL_ITEM_UNIT} disabled />
            </div>
          </>
        ) : null}
      </div>
      {canEdit ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (taxCode.trim().length === 0) {
              toast.error("External tax code is required.");
              return;
            }
            if (
              treatment === "SEPARATE_ITEM" &&
              itemCode.trim() &&
              fiscalItemCodeNumber(itemCode) == null
            ) {
              toast.error("Fiscal item code must be a whole number such as 1001.");
              return;
            }
            onSave({
              taxCode,
              fiscalTreatment: treatment,
              externalItemCode: itemCode,
              natureOfSupplies: nature,
              harmonizationCode: null,
            }).catch((error: Error) => toast.error(error.message));
          }}
        >
          Save
        </Button>
      ) : null}
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
  uppercase = false,
  onSave,
}: {
  title: string;
  detail: string;
  statusLabel: string;
  canEdit: boolean;
  initial: string;
  placeholder: string;
  uppercase?: boolean;
  onSave: (value: string) => Promise<unknown>;
}) {
  const shown = (next: string) => (uppercase ? providerTaxCode(next) : next);
  const [value, setValue] = useState(shown(initial));
  useEffect(() => setValue(shown(initial)), [initial, uppercase]);
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
        autoCapitalize={uppercase ? "characters" : undefined}
        spellCheck={uppercase ? false : undefined}
        onChange={(event) => setValue(shown(event.target.value))}
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
  defaultNature,
  onSave,
}: {
  title: string;
  detail: string;
  current: FiscalCatalogRow | undefined;
  canEdit: boolean;
  defaultNature?: FiscalNatureOfSupplies;
  onSave: (values: {
    externalItemCode: string;
    natureOfSupplies: FiscalNatureOfSupplies;
    harmonizationCode: string | null;
  }) => Promise<unknown>;
}) {
  const storedNature = fiscalNatureOfSupplies(current?.nature_of_supplies ?? "");
  const invalidNature = Boolean(current?.nature_of_supplies) && storedNature == null;
  const [itemCode, setItemCode] = useState(current?.external_item_code ?? "");
  const [nature, setNature] = useState<FiscalNatureOfSupplies | "">(
    storedNature ?? (current ? "" : (defaultNature ?? "")),
  );
  useEffect(() => {
    const nextNature = fiscalNatureOfSupplies(current?.nature_of_supplies ?? "");
    setItemCode(current?.external_item_code ?? "");
    setNature(nextNature ?? (current ? "" : (defaultNature ?? "")));
  }, [current, defaultNature]);
  const complete = Boolean(
    fiscalItemCodeNumber(current?.external_item_code ?? "") &&
    fiscalNatureOfSupplies(current?.nature_of_supplies ?? ""),
  );
  return (
    <div className="space-y-2 rounded-xl border border-[#E5DED1] p-3">
      <p className="text-sm font-medium text-[#251605]">{title}</p>
      <p className="text-xs text-muted-foreground">
        {detail} · {complete ? "Mapped" : "Incomplete"} · Unit {FISCAL_ITEM_UNIT}
      </p>
      {invalidNature ? (
        <p className="text-xs text-destructive">
          Stored nature “{current?.nature_of_supplies}” must be corrected to Service or Goods.
        </p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Fiscal item code</Label>
          <Input
            value={itemCode}
            placeholder="Assigned on save"
            onChange={(event) => setItemCode(event.target.value)}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-1">
          <Label>Nature of supplies</Label>
          <Select
            value={nature || undefined}
            onValueChange={(value) => setNature(value as FiscalNatureOfSupplies)}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="Service or Goods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="service">Service</SelectItem>
              <SelectItem value="goods">Goods</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {canEdit ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const chosen = fiscalNatureOfSupplies(nature);
            if (!chosen) {
              toast.error("Choose Service or Goods.");
              return;
            }
            if (itemCode.trim().length > 0 && fiscalItemCodeNumber(itemCode) == null) {
              toast.error("Fiscal item code must be a whole number such as 1001.");
              return;
            }
            onSave({
              externalItemCode: itemCode,
              natureOfSupplies: chosen,
              harmonizationCode: null,
            }).catch((error: Error) => toast.error(error.message));
          }}
        >
          Save
        </Button>
      ) : null}
    </div>
  );
}
