/**
 * Fiscal integration server functions. Owner and manager only.
 * Credentials and tokens never appear in the return values.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireCashierManager, requireCashieringAccess } from "../cashiering.server";
import { requireRoomManager } from "../rooms.server";
import { loadFiscalRegistrationExchange } from "./fiscal-exchange.server.ts";
import { getCreditNoteFiscalState, queueCreditNoteFiscal } from "./fiscal-credit-note.server.ts";
import {
  getCompanyInvoiceFiscalState,
  queueCompanyInvoiceFiscal,
} from "./fiscal-company-invoice.server.ts";
import { getDebitNoteFiscalState, queueDebitNoteFiscal } from "./fiscal-debit-note.server.ts";
import {
  getGuestInvoiceSalesReceipts,
  queueGuestAllocationSalesReceipt,
} from "./fiscal-sales-receipt.server.ts";
import {
  getGuestInvoiceFiscalState,
  queueGuestInvoiceFiscal,
} from "./fiscal-guest-invoice.server.ts";
import { authenticateFiscal } from "./fiscal-client.server.ts";
import { processFiscalOutbox, retryFiscalRegistration } from "./fiscal-outbox.server.ts";
import {
  hasFiscalCredentials,
  setFiscalCredentials,
  getFiscalCredentials,
} from "./fiscal-secrets.server.ts";
import {
  FISCAL_BUYER_MAPPING_TYPES,
  FISCAL_CATEGORY,
  FISCAL_CHARGE_SOURCES,
  FISCAL_ENVIRONMENTS,
  FISCAL_INTEGRATION_NAME,
  FISCAL_ITEM_UNIT,
  FISCAL_MODE_CONTEXTS,
  FISCAL_NATURE_OF_SUPPLIES,
  FISCAL_PROVIDER,
  FISCAL_SAFE_MESSAGES,
  FiscalError,
  fiscalItemCodeNumber,
  fiscalReadiness,
  fiscalRecord,
  fiscalRecords,
  fiscalRowEnvironment,
  maskDeviceId,
  maskTin,
  normalizeFiscalConnection,
  requireExternalCode,
  type FiscalCatalogRow,
  type FiscalConnectionConfig,
  type FiscalDb,
  type FiscalDbResult,
} from "./fiscal.types.ts";

type Db = FiscalDb;
const idSchema = z.string().uuid();

type StoredIntegration = {
  id: string;
  environment: string;
  config: Record<string, unknown>;
  enabled: boolean;
  last_test_at: string | null;
  last_test_result: string | null;
  status: string;
};

function rowId(data: FiscalDbResult["data"]): string | null {
  const id = fiscalRecord(data)?.id;
  return typeof id === "string" ? id : null;
}

function storedIntegration(data: FiscalDbResult["data"]): StoredIntegration | null {
  const row = fiscalRecord(data);
  if (!row || typeof row.id !== "string") return null;
  const config =
    row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    environment: typeof row.environment === "string" ? row.environment : "",
    config,
    enabled: row.enabled !== false,
    last_test_at: typeof row.last_test_at === "string" ? row.last_test_at : null,
    last_test_result: typeof row.last_test_result === "string" ? row.last_test_result : null,
    status: typeof row.status === "string" ? row.status : "not_configured",
  };
}

function catalog(data: FiscalDbResult["data"]): FiscalCatalogRow[] {
  return fiscalRecords(data).map((row) => ({
    id: String(row.id ?? ""),
    name: typeof row.name === "string" ? row.name : undefined,
    code: typeof row.code === "string" ? row.code : undefined,
    amount:
      typeof row.amount === "number" || typeof row.amount === "string" ? row.amount : undefined,
    charge_type: typeof row.charge_type === "string" ? row.charge_type : undefined,
    pms_tax_id:
      typeof row.pms_tax_id === "string"
        ? row.pms_tax_id
        : row.pms_tax_id === null
          ? null
          : undefined,
    mapping_kind: typeof row.mapping_kind === "string" ? row.mapping_kind : undefined,
    external_tax_code:
      typeof row.external_tax_code === "string" ? row.external_tax_code : undefined,
    external_item_code:
      typeof row.external_item_code === "string" ? row.external_item_code : undefined,
    external_unit: typeof row.external_unit === "string" ? row.external_unit : undefined,
    nature_of_supplies:
      typeof row.nature_of_supplies === "string" ? row.nature_of_supplies : undefined,
    harmonization_code:
      typeof row.harmonization_code === "string"
        ? row.harmonization_code
        : row.harmonization_code === null
          ? null
          : undefined,
    charge_source:
      typeof row.charge_source === "string"
        ? row.charge_source
        : row.charge_source === null
          ? null
          : undefined,
    department_id:
      typeof row.department_id === "string"
        ? row.department_id
        : row.department_id === null
          ? null
          : undefined,
    service_type_id:
      typeof row.service_type_id === "string"
        ? row.service_type_id
        : row.service_type_id === null
          ? null
          : undefined,
    is_default: typeof row.is_default === "boolean" ? row.is_default : undefined,
    document_context: typeof row.document_context === "string" ? row.document_context : undefined,
    external_mode: typeof row.external_mode === "string" ? row.external_mode : undefined,
    active: typeof row.active === "boolean" ? row.active : undefined,
  }));
}

function safeError(error: unknown): never {
  if (error instanceof FiscalError) {
    if (error.code === "FISCAL_MAPPING_INVALID") throw new Error(error.message);
    throw new Error(FISCAL_SAFE_MESSAGES[error.code]);
  }
  throw error instanceof Error ? error : new Error("The fiscal integration is unavailable.");
}

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

async function logActivity(
  db: Db,
  input: {
    restaurantId: string;
    userId: string;
    integrationId: string;
    event: "created" | "updated" | "test_passed" | "test_failed";
    detail: string;
  },
) {
  await db.from("pms_integration_activity").insert({
    restaurant_id: input.restaurantId,
    integration_id: input.integrationId,
    integration_name: FISCAL_INTEGRATION_NAME,
    event: input.event,
    detail: input.detail.slice(0, 400),
    simulated: false,
    actor_user_id: input.userId,
  });
}

async function writeAudit(
  db: Db,
  restaurantId: string,
  userId: string,
  action: string,
  metadata: Json,
) {
  await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action,
    metadata,
  });
}

function readConfig(row: {
  environment: string;
  config: Record<string, unknown>;
  enabled: boolean;
}): FiscalConnectionConfig {
  const config = row.config ?? {};
  const environment =
    config.fiscalEnvironment === "PRODUCTION" || config.fiscalEnvironment === "TEST"
      ? config.fiscalEnvironment
      : row.environment === "production"
        ? "PRODUCTION"
        : "TEST";
  return {
    environment,
    baseUrl: String(config.baseUrl ?? ""),
    taxpayerTin: String(config.taxpayerTin ?? ""),
    client: String(config.client ?? ""),
    deviceId: String(config.deviceId ?? ""),
    enabled: row.enabled !== false,
  };
}

async function loadFiscalRow(db: Db, restaurantId: string) {
  const result = await db
    .from("pms_integrations")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("category", FISCAL_CATEGORY)
    .eq("provider", FISCAL_PROVIDER)
    .maybeSingle();
  if (result.error) throw new Error("The fiscal integration is unavailable.");
  return storedIntegration(result.data);
}

async function requireFiscalRow(db: Db, restaurantId: string) {
  const row = await loadFiscalRow(db, restaurantId);
  if (!row)
    throw new FiscalError("FISCAL_CONFIG_MISSING", "Save the fiscal connection before continuing.");
  return row;
}

export const getFiscalIntegrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = await admin();
    const [row, property] = await Promise.all([
      loadFiscalRow(db, data.restaurantId),
      db.from("restaurants").select("tin_number").eq("id", data.restaurantId).maybeSingle(),
    ]);
    const config = row
      ? readConfig(row)
      : {
          environment: "TEST" as const,
          baseUrl: "",
          taxpayerTin: String(fiscalRecord(property.data)?.tin_number ?? ""),
          client: "",
          deviceId: "",
          enabled: true,
        };
    const integrationId = row?.id as string | undefined;
    const empty = { data: [] as Record<string, unknown>[] };
    const [
      credentialsConfigured,
      taxes,
      departments,
      services,
      taxMaps,
      itemMaps,
      modeMaps,
      buyerMaps,
      token,
      queue,
    ] = await Promise.all([
      integrationId ? hasFiscalCredentials(db, integrationId) : Promise.resolve(false),
      db
        .from("pms_taxes")
        .select("id, code, name, amount, charge_type, active")
        .eq("restaurant_id", data.restaurantId),
      db.from("pms_departments").select("id, code, name").eq("restaurant_id", data.restaurantId),
      db
        .from("pms_guest_service_types")
        .select("id, code, name")
        .eq("restaurant_id", data.restaurantId),
      integrationId
        ? db.from("fiscal_tax_code_mappings").select("*").eq("integration_id", integrationId)
        : empty,
      integrationId
        ? db.from("fiscal_item_mappings").select("*").eq("integration_id", integrationId)
        : empty,
      integrationId
        ? db.from("fiscal_mode_mappings").select("*").eq("integration_id", integrationId)
        : empty,
      integrationId
        ? db.from("fiscal_buyer_code_mappings").select("*").eq("integration_id", integrationId)
        : empty,
      integrationId
        ? db
            .from("fiscal_integration_tokens")
            .select("expires_at, access_token")
            .eq("integration_id", integrationId)
            .maybeSingle()
        : { data: null },
      integrationId
        ? db.from("fiscal_registrations").select("status").eq("integration_id", integrationId)
        : empty,
    ]);
    const taxRows = catalog(taxes.data);
    const taxMapRows = catalog(taxMaps.data);
    const itemMapRows = catalog(itemMaps.data);
    const modeMapRows = catalog(modeMaps.data);
    const buyerMapRows = catalog(buyerMaps.data);
    const mappedTaxIds = new Set(
      taxMapRows
        .filter((item) => item.mapping_kind === "TAX" && typeof item.pms_tax_id === "string")
        .map((item) => item.pms_tax_id),
    );
    const roomMapped = itemMapRows.some(
      (item) => item.charge_source === "room" && item.active !== false,
    );
    const readiness = fiscalReadiness({
      baseUrl: config.baseUrl,
      taxpayerTin: config.taxpayerTin,
      client: config.client,
      deviceId: config.deviceId,
      credentialsConfigured,
      taxMapped: taxRows.filter((tax) => mappedTaxIds.has(tax.id)).length,
      taxTotal: taxRows.length,
      roomMapped,
      buyerMapped: buyerMapRows.filter((item) => item.active !== false).length,
    });
    const queueRows = fiscalRecords(queue.data);
    const tokenRow = fiscalRecord(token.data);
    const hasToken = typeof tokenRow?.access_token === "string" && tokenRow.access_token.length > 0;
    return {
      integrationId: integrationId ?? null,
      connection: {
        ...config,
        taxpayerTinMasked: config.taxpayerTin ? maskTin(config.taxpayerTin) : "",
        deviceIdMasked: config.deviceId ? maskDeviceId(config.deviceId) : "",
      },
      credentials: {
        configured: credentialsConfigured,
        username: credentialsConfigured ? "Configured" : "Missing",
        password: credentialsConfigured ? "Configured" : "Missing",
      },
      readiness,
      registrationNotice:
        "Guest B2C invoice registration can be started from an issued invoice. Other fiscal documents are not enabled.",
      buyerNotice: "Additional buyer identity fields will be required for B2B fiscal invoices.",
      lastTestAt: row?.last_test_at ?? null,
      lastTestResult: row?.last_test_result ?? null,
      status: row?.status ?? "not_configured",
      token: {
        hasToken,
        expiresAt:
          hasToken && typeof tokenRow?.expires_at === "string" ? tokenRow.expires_at : null,
      },
      taxes: taxRows,
      departments: catalog(departments.data),
      serviceTypes: catalog(services.data),
      chargeSources: FISCAL_CHARGE_SOURCES,
      modeContexts: FISCAL_MODE_CONTEXTS,
      buyerTypes: FISCAL_BUYER_MAPPING_TYPES,
      taxMappings: taxMapRows,
      itemMappings: itemMapRows,
      modeMappings: modeMapRows,
      buyerMappings: buyerMapRows,
      queue: {
        pending: queueRows.filter((item) => item.status === "PENDING").length,
        failed: queueRows.filter((item) => item.status === "FAILED").length,
        registered: queueRows.filter((item) => item.status === "REGISTERED").length,
      },
    };
  });

const connectionSchema = z.object({
  restaurantId: idSchema,
  environment: z.enum(FISCAL_ENVIRONMENTS),
  baseUrl: z.string().max(300),
  taxpayerTin: z.string().max(40),
  client: z.string().max(40),
  deviceId: z.string().max(40),
  enabled: z.boolean(),
});

export const saveFiscalIntegrationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => connectionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    try {
      const config = normalizeFiscalConnection(data);
      const db = await admin();
      const existing = await loadFiscalRow(db, data.restaurantId);
      const payload = {
        restaurant_id: data.restaurantId,
        name: FISCAL_INTEGRATION_NAME,
        category: FISCAL_CATEGORY,
        provider: FISCAL_PROVIDER,
        environment: fiscalRowEnvironment(config.environment),
        enabled: config.enabled,
        description: "External fiscal registration. Document sending is not enabled.",
        auth_method: "basic",
        config: {
          fiscalEnvironment: config.environment,
          baseUrl: config.baseUrl,
          taxpayerTin: config.taxpayerTin,
          client: config.client,
          deviceId: config.deviceId,
        },
        status: config.enabled
          ? existing?.last_test_result === "passed"
            ? "connected"
            : "pending"
          : "disabled",
      };
      const saved = existing
        ? await db
            .from("pms_integrations")
            .update(payload)
            .eq("id", existing.id)
            .select("id")
            .single()
        : await db.from("pms_integrations").insert(payload).select("id").single();
      const savedId = rowId(saved.data);
      if (saved.error || !savedId) throw new Error("The fiscal connection could not be saved.");
      await logActivity(db, {
        restaurantId: data.restaurantId,
        userId: context.userId,
        integrationId: savedId,
        event: existing ? "updated" : "created",
        detail: "Fiscal integration configured",
      });
      await writeAudit(db, data.restaurantId, context.userId, "fiscal_integration_configured", {
        section: "fiscal",
        integrationId: savedId,
        environment: config.environment,
      } as unknown as Json);
      return { integrationId: savedId };
    } catch (error) {
      safeError(error);
    }
  });

export const saveFiscalCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        apiUsername: z.string().max(200),
        apiPassword: z.string().max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    try {
      const db = await admin();
      const row = await requireFiscalRow(db, data.restaurantId);
      const saved = await setFiscalCredentials(db, {
        restaurantId: data.restaurantId,
        integrationId: row.id,
        apiUsername: data.apiUsername,
        apiPassword: data.apiPassword,
      });
      await logActivity(db, {
        restaurantId: data.restaurantId,
        userId: context.userId,
        integrationId: row.id,
        event: "updated",
        detail: "Fiscal credentials updated",
      });
      await writeAudit(db, data.restaurantId, context.userId, "fiscal_credentials_updated", {
        section: "fiscal",
        integrationId: row.id,
        credentials_updated: true,
      } as unknown as Json);
      return saved;
    } catch (error) {
      safeError(error);
    }
  });

export const getFiscalCredentialStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = await admin();
    const row = await loadFiscalRow(db, data.restaurantId);
    return { configured: row ? await hasFiscalCredentials(db, row.id) : false };
  });

export const testFiscalConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = await admin();
    const row = await loadFiscalRow(db, data.restaurantId);
    if (!row) throw new Error(FISCAL_SAFE_MESSAGES.FISCAL_CONFIG_MISSING);
    const config = readConfig(row);
    const started = Date.now();
    try {
      if (!config.baseUrl || !config.taxpayerTin || !config.client) {
        throw new FiscalError("FISCAL_CONFIG_MISSING", FISCAL_SAFE_MESSAGES.FISCAL_CONFIG_MISSING);
      }
      normalizeFiscalConnection(config);
      const credentials = await getFiscalCredentials(db, row.id);
      const auth = await authenticateFiscal({
        baseUrl: config.baseUrl,
        username: credentials.apiUsername,
        password: credentials.apiPassword,
        tinNo: config.taxpayerTin,
        client: config.client,
      });
      const expiresAt = new Date(Date.now() + auth.expiresIn * 1000).toISOString();
      const savedToken = await db.from("fiscal_integration_tokens").upsert(
        {
          restaurant_id: data.restaurantId,
          integration_id: row.id,
          access_token: auth.accessToken,
          expires_at: expiresAt,
          refresh_lease_until: null,
        },
        { onConflict: "integration_id" },
      );
      if (savedToken.error) {
        throw new FiscalError(
          "FISCAL_SECRET_STORE_UNAVAILABLE",
          "The fiscal token cache is unavailable.",
        );
      }
      await db
        .from("pms_integrations")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_result: "passed",
          status: config.enabled ? "connected" : "disabled",
        })
        .eq("id", row.id);
      await logActivity(db, {
        restaurantId: data.restaurantId,
        userId: context.userId,
        integrationId: row.id,
        event: "test_passed",
        detail: `Fiscal connection test succeeded (${auth.httpStatus}, ${Date.now() - started}ms)`,
      });
      return {
        ok: true as const,
        message: "Connected successfully",
        environment: config.environment,
        taxpayerTinMasked: maskTin(config.taxpayerTin),
        expiresAt,
        notice:
          "Connection works. Guest B2C invoice registration still needs its mappings. Other fiscal documents are not enabled.",
      };
    } catch (error) {
      const message =
        error instanceof FiscalError
          ? FISCAL_SAFE_MESSAGES[error.code]
          : "The fiscal connection test failed.";
      await db
        .from("pms_integrations")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_result: "failed",
          status: config.enabled ? "error" : "disabled",
        })
        .eq("id", row.id);
      await logActivity(db, {
        restaurantId: data.restaurantId,
        userId: context.userId,
        integrationId: row.id,
        event: "test_failed",
        detail: `Fiscal connection test failed: ${message}`.slice(0, 400),
      });
      return { ok: false as const, message };
    }
  });

async function touchMapping(db: Db, restaurantId: string, userId: string, integrationId: string) {
  await logActivity(db, {
    restaurantId,
    userId,
    integrationId,
    event: "updated",
    detail: "Fiscal mapping changed",
  });
}

export const saveFiscalTaxMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        mappingKind: z.enum(["TAX", "NO_TAX"]),
        pmsTaxId: idSchema.nullable(),
        externalTaxCode: z.string().max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    try {
      const code = requireExternalCode(data.externalTaxCode, "External tax code");
      const db = await admin();
      const row = await requireFiscalRow(db, data.restaurantId);
      if (data.mappingKind === "TAX") {
        if (!data.pmsTaxId) throw new FiscalError("FISCAL_MAPPING_INVALID", "Choose a NORU tax.");
        const tax = await db
          .from("pms_taxes")
          .select("id")
          .eq("id", data.pmsTaxId)
          .eq("restaurant_id", data.restaurantId)
          .maybeSingle();
        if (!fiscalRecord(tax.data))
          throw new FiscalError(
            "FISCAL_MAPPING_INVALID",
            "That tax does not belong to this property.",
          );
        const existing = await db
          .from("fiscal_tax_code_mappings")
          .select("id")
          .eq("integration_id", row.id)
          .eq("pms_tax_id", data.pmsTaxId)
          .maybeSingle();
        const payload = {
          restaurant_id: data.restaurantId,
          integration_id: row.id,
          pms_tax_id: data.pmsTaxId,
          mapping_kind: "TAX",
          external_tax_code: code,
          active: true,
        };
        const existingId = rowId(existing.data);
        const saved = existingId
          ? await db.from("fiscal_tax_code_mappings").update(payload).eq("id", existingId)
          : await db.from("fiscal_tax_code_mappings").insert(payload);
        if (saved.error)
          throw new FiscalError("FISCAL_MAPPING_INVALID", "That tax mapping could not be saved.");
      } else {
        const existing = await db
          .from("fiscal_tax_code_mappings")
          .select("id")
          .eq("integration_id", row.id)
          .eq("mapping_kind", "NO_TAX")
          .maybeSingle();
        const payload = {
          restaurant_id: data.restaurantId,
          integration_id: row.id,
          pms_tax_id: null,
          mapping_kind: "NO_TAX",
          external_tax_code: code,
          active: true,
        };
        const existingId = rowId(existing.data);
        const saved = existingId
          ? await db.from("fiscal_tax_code_mappings").update(payload).eq("id", existingId)
          : await db.from("fiscal_tax_code_mappings").insert(payload);
        if (saved.error)
          throw new FiscalError("FISCAL_MAPPING_INVALID", "That tax mapping could not be saved.");
      }
      await touchMapping(db, data.restaurantId, context.userId, row.id);
      return { ok: true };
    } catch (error) {
      safeError(error);
    }
  });

async function assignFiscalItemCode(
  db: Db,
  restaurantId: string,
  requested: string,
  exceptMappingId: string | null,
): Promise<string> {
  const trimmed = requested.trim();
  const numeric = trimmed.length === 0 ? null : fiscalItemCodeNumber(trimmed);
  if (trimmed.length > 0 && numeric == null) {
    throw new FiscalError(
      "FISCAL_MAPPING_INVALID",
      "Fiscal item code must be a whole number such as 1001.",
    );
  }
  const result = await db.rpc("allocate_fiscal_item_code", {
    _restaurant_id: restaurantId,
    _requested: numeric,
    _except_mapping_id: exceptMappingId,
  });
  if (result.error) {
    if (result.error.message.includes("FISCAL_ITEM_CODE_USED")) {
      throw new FiscalError("FISCAL_MAPPING_INVALID", "That fiscal item code is already used.");
    }
    throw new FiscalError("FISCAL_MAPPING_INVALID", "The fiscal item code could not be assigned.");
  }
  const assigned =
    typeof result.data === "number"
      ? result.data
      : typeof result.data === "string"
        ? Number(result.data)
        : Number.NaN;
  if (!Number.isInteger(assigned)) {
    throw new FiscalError("FISCAL_MAPPING_INVALID", "The fiscal item code could not be assigned.");
  }
  return String(assigned);
}

export const saveFiscalItemMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        serviceTypeId: idSchema.nullable(),
        departmentId: idSchema.nullable(),
        chargeSource: z.enum(FISCAL_CHARGE_SOURCES).nullable(),
        isDefault: z.boolean(),
        externalItemCode: z.string().max(40).optional().default(""),
        natureOfSupplies: z.enum(FISCAL_NATURE_OF_SUPPLIES),
        harmonizationCode: z.string().max(40).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    try {
      const chosen = [
        data.serviceTypeId,
        data.departmentId,
        data.chargeSource,
        data.isDefault ? "default" : null,
      ].filter(Boolean);
      if (chosen.length !== 1)
        throw new FiscalError("FISCAL_MAPPING_INVALID", "Choose one item classification.");
      const db = await admin();
      const row = await requireFiscalRow(db, data.restaurantId);
      if (data.serviceTypeId) {
        const owned = await db
          .from("pms_guest_service_types")
          .select("id")
          .eq("id", data.serviceTypeId)
          .eq("restaurant_id", data.restaurantId)
          .maybeSingle();
        if (!fiscalRecord(owned.data))
          throw new FiscalError(
            "FISCAL_MAPPING_INVALID",
            "That service does not belong to this property.",
          );
      }
      if (data.departmentId) {
        const owned = await db
          .from("pms_departments")
          .select("id")
          .eq("id", data.departmentId)
          .eq("restaurant_id", data.restaurantId)
          .maybeSingle();
        if (!fiscalRecord(owned.data))
          throw new FiscalError(
            "FISCAL_MAPPING_INVALID",
            "That department does not belong to this property.",
          );
      }
      let lookup = db.from("fiscal_item_mappings").select("id").eq("integration_id", row.id);
      if (data.serviceTypeId) lookup = lookup.eq("service_type_id", data.serviceTypeId);
      else if (data.departmentId) lookup = lookup.eq("department_id", data.departmentId);
      else if (data.chargeSource) lookup = lookup.eq("charge_source", data.chargeSource);
      else lookup = lookup.eq("is_default", true);
      const existing = await lookup.maybeSingle();
      const existingId = rowId(existing.data);
      const itemCode = await assignFiscalItemCode(
        db,
        data.restaurantId,
        data.externalItemCode,
        existingId,
      );
      const payload = {
        restaurant_id: data.restaurantId,
        integration_id: row.id,
        service_type_id: data.serviceTypeId,
        department_id: data.departmentId,
        charge_source: data.chargeSource,
        is_default: data.isDefault,
        external_item_code: itemCode,
        external_unit: FISCAL_ITEM_UNIT,
        nature_of_supplies: data.natureOfSupplies,
        harmonization_code: data.harmonizationCode?.trim() || null,
        active: true,
      };
      const saved = existingId
        ? await db.from("fiscal_item_mappings").update(payload).eq("id", existingId)
        : await db.from("fiscal_item_mappings").insert(payload);
      if (saved.error) {
        const message = saved.error.message;
        if (
          message.includes("fiscal_item_mappings_property_code_unique") ||
          message.includes("duplicate key")
        ) {
          throw new FiscalError("FISCAL_MAPPING_INVALID", "That fiscal item code is already used.");
        }
        throw new FiscalError("FISCAL_MAPPING_INVALID", "That item mapping could not be saved.");
      }
      await touchMapping(db, data.restaurantId, context.userId, row.id);
      return { ok: true };
    } catch (error) {
      safeError(error);
    }
  });

export const saveFiscalModeMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        documentContext: z.enum(FISCAL_MODE_CONTEXTS),
        externalMode: z.string().max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    try {
      const db = await admin();
      const row = await requireFiscalRow(db, data.restaurantId);
      const existing = await db
        .from("fiscal_mode_mappings")
        .select("id")
        .eq("integration_id", row.id)
        .eq("document_context", data.documentContext)
        .maybeSingle();
      const payload = {
        restaurant_id: data.restaurantId,
        integration_id: row.id,
        document_context: data.documentContext,
        external_mode: requireExternalCode(data.externalMode, "Fiscal mode"),
        active: true,
      };
      const existingId = rowId(existing.data);
      const saved = existingId
        ? await db.from("fiscal_mode_mappings").update(payload).eq("id", existingId)
        : await db.from("fiscal_mode_mappings").insert(payload);
      if (saved.error)
        throw new FiscalError("FISCAL_MAPPING_INVALID", "That mode mapping could not be saved.");
      await touchMapping(db, data.restaurantId, context.userId, row.id);
      return { ok: true };
    } catch (error) {
      safeError(error);
    }
  });

export const saveFiscalBuyerCodeMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        mappingType: z.enum(FISCAL_BUYER_MAPPING_TYPES),
        internalValue: z.string().max(80),
        externalValue: z.string().max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    try {
      const internalValue = requireExternalCode(data.internalValue, "Internal value");
      const db = await admin();
      const row = await requireFiscalRow(db, data.restaurantId);
      const existing = await db
        .from("fiscal_buyer_code_mappings")
        .select("id")
        .eq("integration_id", row.id)
        .eq("mapping_type", data.mappingType)
        .eq("internal_value", internalValue)
        .maybeSingle();
      const payload = {
        restaurant_id: data.restaurantId,
        integration_id: row.id,
        mapping_type: data.mappingType,
        internal_value: internalValue,
        external_value: requireExternalCode(data.externalValue, "External code"),
        active: true,
      };
      const existingId = rowId(existing.data);
      const saved = existingId
        ? await db.from("fiscal_buyer_code_mappings").update(payload).eq("id", existingId)
        : await db.from("fiscal_buyer_code_mappings").insert(payload);
      if (saved.error)
        throw new FiscalError(
          "FISCAL_MAPPING_INVALID",
          "That buyer-code mapping could not be saved.",
        );
      await touchMapping(db, data.restaurantId, context.userId, row.id);
      return { ok: true };
    } catch (error) {
      safeError(error);
    }
  });

export const runFiscalOutbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    return processFiscalOutbox(await admin(), 10);
  });

export const retryFiscalRegistrationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, registrationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = await admin();
    const owned = await db
      .from("fiscal_registrations")
      .select("id")
      .eq("id", data.registrationId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!fiscalRecord(owned.data)) throw new Error("That fiscal registration does not exist.");
    await retryFiscalRegistration(db, data.registrationId);
    await processFiscalOutbox(db, 10);
    return { ok: true };
  });

export const getCreditNoteFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, creditNoteId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    return getCreditNoteFiscalState(await admin(), data);
  });

export const registerCreditNoteFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, creditNoteId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashierManager(context as never, data.restaurantId);
    const db = await admin();
    const queued = await queueCreditNoteFiscal(db, data);
    if (queued.status === "not_eligible" || queued.status === "registered") return queued;
    await logActivity(db, {
      restaurantId: data.restaurantId,
      userId: context.userId,
      integrationId: await fiscalIntegrationId(db, data.restaurantId),
      event: "updated",
      detail:
        queued.status === "failed"
          ? "Fiscal credit note registration retry requested"
          : "Fiscal credit note registration requested",
    });
    await processFiscalOutbox(db, 10);
    const result = await getCreditNoteFiscalState(db, data);
    await logActivity(db, {
      restaurantId: data.restaurantId,
      userId: context.userId,
      integrationId: await fiscalIntegrationId(db, data.restaurantId),
      event: "updated",
      detail:
        result.status === "registered"
          ? "Fiscal credit note registration succeeded"
          : result.status === "queued"
            ? "Fiscal credit note registration queued"
            : `Fiscal credit note registration failed: ${result.registration?.lastError ?? "The fiscal service did not accept the credit note."}`.slice(
                0,
                400,
              ),
    });
    return result;
  });

export const getDebitNoteFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, debitNoteId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    return getDebitNoteFiscalState(await admin(), data);
  });

export const registerDebitNoteFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, debitNoteId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashierManager(context as never, data.restaurantId);
    const db = await admin();
    const queued = await queueDebitNoteFiscal(db, data);
    if (queued.status === "not_eligible" || queued.status === "registered") return queued;
    await logActivity(db, {
      restaurantId: data.restaurantId,
      userId: context.userId,
      integrationId: await fiscalIntegrationId(db, data.restaurantId),
      event: "updated",
      detail:
        queued.status === "failed"
          ? "Fiscal debit note registration retry requested"
          : "Fiscal debit note registration requested",
    });
    await processFiscalOutbox(db, 10);
    const result = await getDebitNoteFiscalState(db, data);
    await logActivity(db, {
      restaurantId: data.restaurantId,
      userId: context.userId,
      integrationId: await fiscalIntegrationId(db, data.restaurantId),
      event: "updated",
      detail:
        result.status === "registered"
          ? "Fiscal debit note registration succeeded"
          : result.status === "queued"
            ? "Fiscal debit note registration queued"
            : `Fiscal debit note registration failed: ${result.registration?.lastError ?? "The fiscal service did not accept the debit note."}`.slice(
                0,
                400,
              ),
    });
    return result;
  });

export const getGuestInvoiceSalesReceiptFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, invoiceId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    return getGuestInvoiceSalesReceipts(await admin(), data);
  });

export const registerGuestAllocationSalesReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, allocationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashierManager(context as never, data.restaurantId);
    const db = await admin();
    const queued = await queueGuestAllocationSalesReceipt(db, data);
    if (queued.status === "not_eligible" || queued.status === "registered") return queued;
    await logActivity(db, {
      restaurantId: data.restaurantId,
      userId: context.userId,
      integrationId: await fiscalIntegrationId(db, data.restaurantId),
      event: "updated",
      detail:
        queued.status === "failed"
          ? "Fiscal sales receipt retry requested"
          : "Fiscal sales receipt requested",
    });
    await processFiscalOutbox(db, 10);
    const lines = await getGuestInvoiceSalesReceipts(db, {
      restaurantId: data.restaurantId,
      invoiceId: await allocationInvoiceId(db, data.restaurantId, data.allocationId),
    });
    const result = lines.lines.find((line) => line.allocationId === data.allocationId) ?? queued;
    await logActivity(db, {
      restaurantId: data.restaurantId,
      userId: context.userId,
      integrationId: await fiscalIntegrationId(db, data.restaurantId),
      event: "updated",
      detail:
        result.status === "registered"
          ? "Fiscal sales receipt registration succeeded"
          : result.status === "queued"
            ? "Fiscal sales receipt registration queued"
            : `Fiscal sales receipt registration failed: ${result.registration?.lastError ?? "The fiscal service did not accept the sales receipt."}`.slice(
                0,
                400,
              ),
    });
    return result;
  });

async function allocationInvoiceId(db: Db, restaurantId: string, allocationId: string) {
  const result = await db
    .from("guest_payment_invoice_allocations")
    .select("invoice_id")
    .eq("id", allocationId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const invoiceId = fiscalRecord(result.data)?.invoice_id;
  if (typeof invoiceId !== "string") {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "That payment allocation was not found.");
  }
  return invoiceId;
}

export const getCompanyInvoiceFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, invoiceId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    return getCompanyInvoiceFiscalState(await admin(), data);
  });

export const registerCompanyInvoiceFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, invoiceId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashierManager(context as never, data.restaurantId);
    const db = await admin();
    const queued = await queueCompanyInvoiceFiscal(db, data);
    if (queued.status === "not_eligible" || queued.status === "registered") return queued;
    await logActivity(db, {
      restaurantId: data.restaurantId,
      userId: context.userId,
      integrationId: await fiscalIntegrationId(db, data.restaurantId),
      event: "updated",
      detail:
        queued.status === "failed"
          ? "Fiscal company invoice registration retry requested"
          : "Fiscal company invoice registration requested",
    });
    await processFiscalOutbox(db, 10);
    const result = await getCompanyInvoiceFiscalState(db, data);
    await logActivity(db, {
      restaurantId: data.restaurantId,
      userId: context.userId,
      integrationId: await fiscalIntegrationId(db, data.restaurantId),
      event: "updated",
      detail:
        result.status === "registered"
          ? "Fiscal company invoice registration succeeded"
          : result.status === "queued"
            ? "Fiscal company invoice registration queued"
            : `Fiscal company invoice registration failed: ${result.registration?.lastError ?? "The fiscal service did not accept the invoice."}`.slice(
                0,
                400,
              ),
    });
    return result;
  });

export const getGuestInvoiceFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, invoiceId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    return getGuestInvoiceFiscalState(await admin(), data);
  });

export const getFiscalRegistrationExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, registrationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashierManager(context as never, data.restaurantId);
    try {
      return await loadFiscalRegistrationExchange(await admin(), data);
    } catch (error) {
      safeError(error);
    }
  });

export const registerGuestInvoiceFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, invoiceId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashierManager(context as never, data.restaurantId);
    const db = await admin();
    const queued = await queueGuestInvoiceFiscal(db, data);
    if (queued.status === "not_eligible" || queued.status === "registered") return queued;
    await logActivity(db, {
      restaurantId: data.restaurantId,
      userId: context.userId,
      integrationId: await fiscalIntegrationId(db, data.restaurantId),
      event: "updated",
      detail:
        queued.status === "failed"
          ? "Fiscal guest invoice registration retry requested"
          : "Fiscal guest invoice registration requested",
    });
    await processFiscalOutbox(db, 10);
    const result = await getGuestInvoiceFiscalState(db, data);
    await logActivity(db, {
      restaurantId: data.restaurantId,
      userId: context.userId,
      integrationId: await fiscalIntegrationId(db, data.restaurantId),
      event: "updated",
      detail:
        result.status === "registered"
          ? "Fiscal guest invoice registration succeeded"
          : result.status === "queued"
            ? "Fiscal guest invoice registration queued"
            : `Fiscal guest invoice registration failed: ${result.registration?.lastError ?? "The fiscal service did not accept the invoice."}`.slice(
                0,
                400,
              ),
    });
    return result;
  });

async function fiscalIntegrationId(db: Db, restaurantId: string): Promise<string> {
  const result = await db
    .from("pms_integrations")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("category", FISCAL_CATEGORY)
    .eq("provider", FISCAL_PROVIDER)
    .maybeSingle();
  const id = fiscalRecord(result.data)?.id;
  if (typeof id !== "string") {
    throw new FiscalError("FISCAL_CONFIG_MISSING", "Save the fiscal connection before continuing.");
  }
  return id;
}
