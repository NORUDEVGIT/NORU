/**
 * Guest Profile Companies workspace APIs.
 * Operational rows stay on guest_account_masters. Settings stay Card 4.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GUEST_IMAGE_EXT_BY_TYPE,
  blankToNull,
  normalizeEmail,
  normalizePhone,
  recordGuestAccountEvent,
  requireGuestManager,
} from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { ROOM_BUCKET, signRoomImages } from "./rooms.server";
import { countryFromInput, countryNameFromInput } from "./pms-geography";
import {
  emptyBusinessSettings,
  staleRequiredFieldIds,
  type BusinessFieldOption,
  type BusinessProfileSnapshot,
  type BusinessProfileTypeRecord,
} from "./company-business-card4.server";
import {
  COMPANY_CSV_COLUMNS,
  COMPANY_IMPORT_XLSX,
  COMPANY_PAGE_SIZES,
  companyCreateAllowed,
  createStatusFromAutoApproval,
  csvEscape,
  parseCompanyCsv,
  validateCompanyAgainstType,
} from "./guest-companies-workspace";
import { listingCreateAllowed } from "./guest-profile-listing";
import { loadGuestWorkspaceConfig } from "./guest-workspace-config.functions";
import { GUEST_ACCOUNT_STATUSES, type GuestAccountStatus } from "./guest-profile-wave4";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

export type CompanyWorkspaceRow = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  accountStatus: GuestAccountStatus;
  updatedAt: string;
  createdAt: string;
  primaryContactName: string | null;
  primaryContactTitle: string | null;
  country: string | null;
  city: string | null;
  taxId: string | null;
  businessRegistrationNumber: string | null;
  businessProfileTypeId: string | null;
  businessProfileTypeName: string | null;
  businessProfileTypeActive: boolean;
  creditAccountEnabled: boolean;
  creditAccountAllowed: boolean;
  logoStoragePath: string | null;
  logoUrl: string | null;
};

export type CompanyWorkspacePage = {
  available: boolean;
  items: CompanyWorkspaceRow[];
  total: number;
  offset: number;
  limit: number;
  kpis: { total: number; active: number; inactive: number; credit: number };
};

export type CompanyDuplicate = {
  id: string;
  name: string;
  match: "tax_id" | "registration" | "email" | "phone" | "name";
  blocking: boolean;
};

function mapTypeRow(
  row: {
    id: string;
    name: string;
    code: string;
    description: string | null;
    active: boolean;
    required_field_ids: string[] | null;
    tax_id_required: boolean;
    contact_required: boolean;
    credit_account_allowed: boolean;
    created_at: string;
    updated_at: string;
  },
  fields: BusinessFieldOption[],
): BusinessProfileTypeRecord {
  const requiredFieldIds = row.required_field_ids ?? [];
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    active: row.active,
    requiredFieldIds,
    staleRequiredFieldIds: staleRequiredFieldIds(requiredFieldIds, fields),
    taxIdRequired: row.tax_id_required,
    contactRequired: row.contact_required,
    creditAccountAllowed: row.credit_account_allowed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadBusinessSnapshot(restaurantId: string): Promise<BusinessProfileSnapshot | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = admin(supabaseAdmin);
  const fieldsRes = await db
    .from("pms_guest_fields")
    .select("id, name, code, active")
    .eq("restaurant_id", restaurantId)
    .in("code", ["COMPANY_NAME", "TAX_ID", "CONTACT_PERSON", "BUSINESS_ADDRESS", "BUSINESS_LICENSE"]);
  if (fieldsRes.error && isMissingSchemaError(fieldsRes.error)) return null;
  if (fieldsRes.error) throw new Error(fieldsRes.error.message);
  const fields: BusinessFieldOption[] = ((fieldsRes.data ?? []) as Array<{
    id: string;
    name: string;
    code: string;
    active: boolean;
  }>).map((row) => ({ id: row.id, name: row.name, code: row.code, active: row.active }));

  const typesRes = await db
    .from("pms_business_profile_types")
    .select(
      "id, name, code, description, active, required_field_ids, tax_id_required, contact_required, credit_account_allowed, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (typesRes.error && isMissingSchemaError(typesRes.error)) return null;
  if (typesRes.error) throw new Error(typesRes.error.message);
  const types = ((typesRes.data ?? []) as Parameters<typeof mapTypeRow>[0][]).map((row) =>
    mapTypeRow(row, fields),
  );

  const settingsRes = await db
    .from("pms_business_profile_settings")
    .select("enabled, default_business_type_id, auto_approval")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (settingsRes.error && isMissingSchemaError(settingsRes.error)) return null;
  const settings = settingsRes.data
    ? {
        enabled: Boolean(settingsRes.data.enabled),
        defaultBusinessTypeId: (settingsRes.data.default_business_type_id as string | null) ?? null,
        autoApproval: Boolean(settingsRes.data.auto_approval),
        defaultInvalid: false,
      }
    : emptyBusinessSettings();

  return { types, settings, fields, roles: [], lastUpdatedAt: null };
}

export const getCompanyBusinessWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const snapshot = await loadBusinessSnapshot(data.restaurantId);
    const listing = await loadGuestWorkspaceConfig(data.restaurantId);
    const listingOk = listingCreateAllowed("company", listing);
    if (!snapshot) {
      return {
        types: [] as BusinessProfileTypeRecord[],
        settings: emptyBusinessSettings(),
        fields: [] as BusinessFieldOption[],
        roles: [],
        lastUpdatedAt: null as string | null,
        listingCreateAllowed: listingOk,
      };
    }
    return { ...snapshot, listingCreateAllowed: listingOk };
  });

const listInput = z.object({
  restaurantId: idSchema,
  search: z.string().max(120).optional(),
  status: z.enum([...GUEST_ACCOUNT_STATUSES, "all"] as const).optional(),
  businessTypeId: z.string().uuid().nullable().optional(),
  country: z.string().max(120).optional(),
  credit: z.enum(["all", "yes", "no"]).optional(),
  createdFrom: z.string().max(20).optional(),
  createdTo: z.string().max(20).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(20_000).optional(),
  ids: z.array(idSchema).max(200).optional(),
});

function applyCompanyFilters(query: any, data: z.infer<typeof listInput>, term: string) {
  let next = query.eq("account_type", "company");
  if (data.ids?.length) next = next.in("id", data.ids);
  if (data.status && data.status !== "all") next = next.eq("account_status", data.status);
  if (data.businessTypeId) next = next.eq("business_profile_type_id", data.businessTypeId);
  if (data.country?.trim()) next = next.ilike("country", `%${data.country.trim()}%`);
  if (data.credit === "yes") next = next.eq("credit_account_enabled", true);
  if (data.credit === "no") next = next.eq("credit_account_enabled", false);
  if (data.createdFrom) next = next.gte("created_at", `${data.createdFrom}T00:00:00.000Z`);
  if (data.createdTo) next = next.lte("created_at", `${data.createdTo}T23:59:59.999Z`);
  if (term) {
    const like = `%${term.replace(/[%,]/g, "")}%`;
    next = next.or(
      [
        `name.ilike.${like}`,
        `code.ilike.${like}`,
        `email.ilike.${like}`,
        `phone.ilike.${like}`,
        `primary_contact_name.ilike.${like}`,
        `tax_id.ilike.${like}`,
        `business_registration_number.ilike.${like}`,
      ].join(","),
    );
  }
  return next;
}

export const listCompanyWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }): Promise<CompanyWorkspacePage> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const term = (data.search ?? "").trim();
    const offset = data.offset ?? 0;
    const limit = data.limit ?? COMPANY_PAGE_SIZES[0];
    const snapshot = await loadBusinessSnapshot(data.restaurantId);
    const typeById = new Map((snapshot?.types ?? []).map((type) => [type.id, type]));
    const selectCols =
      "id, name, code, email, phone, account_status, created_at, updated_at, primary_contact_name, primary_contact_title, country, city, tax_id, business_registration_number, business_profile_type_id, credit_account_enabled, logo_storage_path";
    let result = await applyCompanyFilters(
      db.from("guest_account_masters").select(selectCols, { count: "exact" }).eq("restaurant_id", data.restaurantId),
      data,
      term,
    )
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (result.error && isMissingSchemaError(result.error)) {
      return {
        available: false,
        items: [],
        total: 0,
        offset,
        limit,
        kpis: { total: 0, active: 0, inactive: 0, credit: 0 },
      };
    }
    if (result.error) throw new Error(result.error.message);

    const kpiSource = await applyCompanyFilters(
      db
        .from("guest_account_masters")
        .select("account_status, credit_account_enabled")
        .eq("restaurant_id", data.restaurantId),
      { ...data, status: "all" },
      term,
    );
    const kpiRows = ((kpiSource.data ?? []) as Array<{
      account_status: string;
      credit_account_enabled: boolean | null;
    }>).map((row) => ({
      accountStatus: row.account_status,
      creditAccountEnabled: Boolean(row.credit_account_enabled),
    }));

    const rows = (result.data ?? []) as Array<Record<string, unknown>>;
    const logoPaths = rows.map((row) => row.logo_storage_path as string | null).filter(Boolean) as string[];
    const signed = logoPaths.length ? await signRoomImages(logoPaths) : new Map<string, string>();

    return {
      available: true,
      total: result.count ?? rows.length,
      offset,
      limit,
      kpis: {
        total: kpiRows.length,
        active: kpiRows.filter((row) => row.accountStatus === "active").length,
        inactive: kpiRows.filter((row) => row.accountStatus === "inactive").length,
        credit: kpiRows.filter((row) => row.creditAccountEnabled).length,
      },
      items: rows.map((row) => {
        const typeId = (row.business_profile_type_id as string | null) ?? null;
        const type = typeId ? typeById.get(typeId) : undefined;
        const path = (row.logo_storage_path as string | null) ?? null;
        return {
          id: row.id as string,
          name: row.name as string,
          code: (row.code as string | null) ?? null,
          phone: (row.phone as string | null) ?? null,
          email: (row.email as string | null) ?? null,
          accountStatus: (row.account_status as GuestAccountStatus) ?? "active",
          updatedAt: row.updated_at as string,
          createdAt: row.created_at as string,
          primaryContactName: (row.primary_contact_name as string | null) ?? null,
          primaryContactTitle: (row.primary_contact_title as string | null) ?? null,
          country: (row.country as string | null) ?? null,
          city: (row.city as string | null) ?? null,
          taxId: (row.tax_id as string | null) ?? null,
          businessRegistrationNumber: (row.business_registration_number as string | null) ?? null,
          businessProfileTypeId: typeId,
          businessProfileTypeName: type?.name ?? null,
          businessProfileTypeActive: type?.active ?? false,
          creditAccountEnabled: Boolean(row.credit_account_enabled),
          creditAccountAllowed: type?.creditAccountAllowed ?? false,
          logoStoragePath: path,
          logoUrl: path ? (signed.get(path) ?? null) : null,
        };
      }),
    };
  });

export async function findCompanyDuplicateRows(
  restaurantId: string,
  input: {
    name: string;
    taxId?: string | null;
    businessRegistrationNumber?: string | null;
    email?: string | null;
    phone?: string | null;
  },
  excludeId?: string,
): Promise<CompanyDuplicate[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = admin(supabaseAdmin);
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const matches: CompanyDuplicate[] = [];
  async function collect(column: string, value: string | null, match: CompanyDuplicate["match"], blocking: boolean) {
    if (!value) return;
    let query = db
      .from("guest_account_masters")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .eq("account_type", "company")
      .eq(column, value)
      .limit(5);
    if (excludeId) query = query.neq("id", excludeId);
    const result = await query;
    for (const row of (result.data ?? []) as Array<{ id: string; name: string }>) {
      if (!matches.some((item) => item.id === row.id && item.match === match)) {
        matches.push({ id: row.id, name: row.name, match, blocking });
      }
    }
  }
  await collect("tax_id", blankToNull(input.taxId ?? ""), "tax_id", true);
  await collect("business_registration_number", blankToNull(input.businessRegistrationNumber ?? ""), "registration", true);
  await collect("email_normalized", email, "email", true);
  await collect("phone_normalized", phone, "phone", true);
  if (input.name.trim()) {
    let query = db
      .from("guest_account_masters")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .eq("account_type", "company")
      .ilike("name", input.name.trim())
      .limit(5);
    if (excludeId) query = query.neq("id", excludeId);
    const result = await query;
    for (const row of (result.data ?? []) as Array<{ id: string; name: string }>) {
      if (!matches.some((item) => item.id === row.id)) {
        matches.push({ id: row.id, name: row.name, match: "name", blocking: false });
      }
    }
  }
  return matches;
}

export const findCompanyDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        excludeId: idSchema.optional(),
        name: z.string(),
        taxId: z.string().optional().nullable(),
        businessRegistrationNumber: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    return findCompanyDuplicateRows(data.restaurantId, data, data.excludeId);
  });

export const setCompanyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        ids: z.array(idSchema).min(1).max(100),
        status: z.enum(["active", "inactive"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const updated = await admin(supabaseAdmin)
      .from("guest_account_masters")
      .update({ account_status: data.status })
      .eq("restaurant_id", data.restaurantId)
      .eq("account_type", "company")
      .in("id", data.ids);
    if (updated.error) throw new Error(updated.error.message);
    for (const id of data.ids) {
      await recordGuestAccountEvent({
        restaurantId: data.restaurantId,
        masterId: id,
        eventType: "status_changed",
        newValues: { account_status: data.status },
        actorMembershipId: me.id,
      });
    }
    return { ok: true as const };
  });

export const createCompanyLogoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        size: z.number().int().positive().max(8 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await admin(supabaseAdmin)
      .from("guest_account_masters")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.companyId)
      .eq("account_type", "company")
      .maybeSingle();
    if (!existing.data) throw new Error("That company could not be found.");
    const ext = GUEST_IMAGE_EXT_BY_TYPE[data.contentType] ?? "jpg";
    const path = `${data.restaurantId}/companies/${data.companyId}/logo-${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage.from(ROOM_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not start the logo upload.");
    return { ok: true as const, path, token: signed.token };
  });

export const saveCompanyLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, companyId: idSchema, path: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const prefix = `${data.restaurantId}/companies/${data.companyId}/`;
    if (!data.path.startsWith(prefix)) throw new Error("That logo path is not valid for this company.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await admin(supabaseAdmin)
      .from("guest_account_masters")
      .select("logo_storage_path")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.companyId)
      .maybeSingle();
    const updated = await admin(supabaseAdmin)
      .from("guest_account_masters")
      .update({ logo_storage_path: data.path })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.companyId)
      .eq("account_type", "company");
    if (updated.error) throw new Error(updated.error.message);
    const previous = (before.data as { logo_storage_path?: string | null } | null)?.logo_storage_path;
    if (previous && previous !== data.path) {
      await supabaseAdmin.storage.from(ROOM_BUCKET).remove([previous]);
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.companyId,
      eventType: "logo_updated",
      newValues: { logo_storage_path: data.path },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const exportCompaniesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const page = await listCompanyWorkspace({ data: { ...data, limit: 200, offset: 0 } });
    const lines = [COMPANY_CSV_COLUMNS.join(",")];
    for (const row of page.items) {
      lines.push(
        [
          csvEscape(row.businessProfileTypeName),
          csvEscape(row.name),
          csvEscape(row.businessRegistrationNumber),
          csvEscape(row.taxId),
          csvEscape(row.country),
          csvEscape(row.city),
          "",
          csvEscape(row.primaryContactName),
          csvEscape(row.primaryContactTitle),
          csvEscape(row.phone),
          csvEscape(row.email),
          "",
          "",
        ].join(","),
      );
    }
    return { csv: lines.join("\n"), total: page.total };
  });

export const previewCompanyImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, filename: z.string().max(200), csv: z.string().max(1_000_000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    if (/\.xlsx?$/i.test(data.filename)) throw new Error(COMPANY_IMPORT_XLSX);
    const snapshot = await loadBusinessSnapshot(data.restaurantId);
    if (!snapshot) throw new Error("Company & Business settings are unavailable.");
    const listing = await loadGuestWorkspaceConfig(data.restaurantId);
    const allowed = companyCreateAllowed(
      snapshot.settings,
      listingCreateAllowed("company", listing),
      snapshot.types.filter((type) => type.active).length,
    );
    if (!allowed.ok) throw new Error(allowed.message);
    const parsed = parseCompanyCsv(data.csv);
    const index = Object.fromEntries(parsed.headers.map((header, i) => [header, i]));
    const typeByCode = new Map(snapshot.types.map((type) => [type.code.toLowerCase(), type]));
    const rows = parsed.rows.map((cells, rowIndex) => {
      const get = (key: string) => (cells[index[key] ?? -1] ?? "").trim();
      const type = typeByCode.get(get("type_code").toLowerCase());
      const draft = {
        name: get("name"),
        taxId: get("tax_id") || null,
        businessRegistrationNumber: get("registration_number") || null,
        country: get("country") || null,
        city: get("city") || null,
        addressLine1: get("address") || null,
        primaryContactName: get("contact_person") || null,
        primaryContactTitle: get("job_title") || null,
        phone: get("phone") || null,
        email: get("email") || null,
        website: get("website") || null,
        notes: get("notes") || null,
        typeId: type?.id ?? null,
      };
      let error: string | null = null;
      if (!type || !type.active) error = "Unknown or inactive business type code.";
      else if (draft.country && !countryFromInput(draft.country)) error = "Country is not in the catalogue.";
      else {
        error = validateCompanyAgainstType(
          {
            name: draft.name,
            taxId: draft.taxId,
            primaryContactName: draft.primaryContactName,
            phone: draft.phone,
            email: draft.email,
            addressLine1: draft.addressLine1,
            city: draft.city,
            country: draft.country,
            businessRegistrationNumber: draft.businessRegistrationNumber,
            creditAccountEnabled: false,
            paymentTerms: null,
            creditLimitNote: null,
          },
          type,
          snapshot.fields,
          "create",
        );
      }
      return { row: rowIndex + 2, draft, error };
    });
    return {
      valid: rows.filter((row) => !row.error),
      invalid: rows.filter((row) => row.error),
      autoApproval: snapshot.settings.autoApproval,
    };
  });

export const confirmCompanyImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, filename: z.string().max(200), csv: z.string().max(1_000_000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const preview = await previewCompanyImport({ data });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const status = createStatusFromAutoApproval(preview.autoApproval);
    let created = 0;
    for (const row of preview.valid) {
      const duplicates = await findCompanyDuplicateRows(data.restaurantId, row.draft);
      if (duplicates.some((item) => item.blocking)) continue;
      const inserted = await admin(supabaseAdmin)
        .from("guest_account_masters")
        .insert({
          restaurant_id: data.restaurantId,
          account_type: "company",
          name: row.draft.name,
          business_profile_type_id: row.draft.typeId,
          tax_id: row.draft.taxId,
          business_registration_number: row.draft.businessRegistrationNumber,
          country: row.draft.country ? countryNameFromInput(row.draft.country) : null,
          city: row.draft.city,
          address_line1: row.draft.addressLine1,
          primary_contact_name: row.draft.primaryContactName,
          primary_contact_title: row.draft.primaryContactTitle,
          phone: row.draft.phone,
          email: normalizeEmail(row.draft.email),
          email_normalized: normalizeEmail(row.draft.email),
          phone_normalized: normalizePhone(row.draft.phone),
          website: row.draft.website,
          notes: row.draft.notes,
          account_status: status,
          created_by_staff_membership_id: me.id,
        })
        .select("id")
        .maybeSingle();
      if (inserted.data) {
        created += 1;
        await recordGuestAccountEvent({
          restaurantId: data.restaurantId,
          masterId: (inserted.data as { id: string }).id,
          eventType: "imported",
          notes: data.filename,
          actorMembershipId: me.id,
        });
      }
    }
    return { created, skipped: preview.valid.length - created, invalid: preview.invalid.length };
  });
