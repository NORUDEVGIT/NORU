/**
 * Company Detail workspace APIs.
 * Company rows stay on guest_account_masters. Contacts are guest_company_contacts.
 * Travelers reuse guest_account_links. Reservations reuse hotel_reservations.
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
import { loadBusinessSnapshot } from "./guest-companies.functions";
import {
  COMPANY_CONTACT_DEFAULT_PAGE_SIZE,
  COMPANY_CONTACT_PAGE_SIZES,
  COMPANY_CONTACT_REQUIRED,
  COMPANY_CONTACT_STATUSES,
  agreementStatus,
  blockLastPrimaryRemoval,
  companyHasCompanyRate,
  companyOverviewKpis,
  contactMethodKpis,
  distinctDepartmentCount,
  distinctDepartmentNames,
  isTravelAgencyBusinessType,
  travelerKpis,
  travelerTypeLabel,
} from "./guest-company-detail-workspace";
import { guestStayAccessForRole } from "./guests.functions";
import { isUpcomingStay, knownMoneyTotal, mapReservationToStay } from "./guest-profile-wave3";
import { nightsBetween } from "./reservation-dates";
import { propertyToday } from "./reservations.server";
import { maskIdNumber } from "./guest-profile-wave2";
import { uuidFirstSegment } from "./guest-profile-listing";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

function unavailable(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && isMissingSchemaError(error));
}

const CONTACT_COLUMNS =
  "id, company_master_id, name, code, position, department_id, phone, email, whatsapp, photo_storage_path, status, is_primary, notes, created_at, updated_at";

export type CompanyContactRole = {
  id: string;
  name: string;
  code: string;
  active: boolean;
};

export type CompanyContactRow = {
  id: string;
  name: string;
  code: string | null;
  position: string | null;
  departmentId: string | null;
  departmentName: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  photoUrl: string | null;
  photoStoragePath: string | null;
  status: "active" | "inactive";
  isPrimary: boolean;
  notes: string | null;
  roleIds: string[];
  roleNames: string[];
  createdAt: string;
  updatedAt: string;
};

export type CompanyAgreementRow = {
  id: string;
  contractNumber: string;
  name: string;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
  status: "active" | "expiring" | "expired" | "inactive";
};

export type CompanyReservationRow = {
  id: string;
  confirmationNumber: string;
  arrivalDate: string;
  departureDate: string;
  status: string;
  roomLabel: string;
  nights: number;
};

function mapContact(
  row: {
    id: string;
    name: string;
    code: string | null;
    position: string | null;
    department_id: string | null;
    phone: string | null;
    email: string | null;
    whatsapp?: string | null;
    photo_storage_path: string | null;
    status: string;
    is_primary: boolean;
    notes: string | null;
    created_at: string;
    updated_at: string;
  },
  extras: {
    departmentName: string | null;
    photoUrl: string | null;
    roleIds: string[];
    roleNames: string[];
  },
): CompanyContactRow {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    position: row.position,
    departmentId: row.department_id,
    departmentName: extras.departmentName,
    phone: row.phone,
    email: row.email,
    whatsapp: row.whatsapp ?? null,
    photoUrl: extras.photoUrl,
    photoStoragePath: row.photo_storage_path,
    status: row.status === "inactive" ? "inactive" : "active",
    isPrimary: row.is_primary,
    notes: row.notes,
    roleIds: extras.roleIds,
    roleNames: extras.roleNames,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadCompanyMaster(
  db: { from: (table: string) => any },
  restaurantId: string,
  companyId: string,
) {
  const result = await db
    .from("guest_account_masters")
    .select(
      "id, name, code, email, phone, address_line1, city, country, website, notes, account_status, business_profile_type_id, primary_contact_name, primary_contact_title, negotiated_rate_reference, logo_storage_path, credit_account_enabled, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .eq("id", companyId)
    .eq("account_type", "company")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("That company could not be found.");
  return result.data as {
    id: string;
    name: string;
    code: string | null;
    email: string | null;
    phone: string | null;
    address_line1: string | null;
    city: string | null;
    country: string | null;
    website: string | null;
    notes: string | null;
    account_status: string;
    business_profile_type_id: string | null;
    primary_contact_name: string | null;
    primary_contact_title: string | null;
    negotiated_rate_reference: string | null;
    logo_storage_path: string | null;
    credit_account_enabled: boolean;
    created_at: string;
    updated_at: string;
  };
}

async function decorateContacts(
  db: { from: (table: string) => any },
  restaurantId: string,
  rows: Array<Parameters<typeof mapContact>[0]>,
): Promise<CompanyContactRow[]> {
  const departmentIds = [...new Set(rows.map((row) => row.department_id).filter(Boolean))] as string[];
  const departments = new Map<string, string>();
  if (departmentIds.length > 0) {
    const result = await db
      .from("pms_departments")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .in("id", departmentIds);
    for (const row of (result.data ?? []) as Array<{ id: string; name: string }>) {
      departments.set(row.id, row.name);
    }
  }
  const contactIds = rows.map((row) => row.id);
  const roleByContact = new Map<string, Array<{ id: string; name: string }>>();
  if (contactIds.length > 0) {
    const assigned = await db
      .from("guest_company_contact_roles")
      .select("contact_id, role_id, pms_business_contact_roles ( id, name )")
      .in("contact_id", contactIds);
    if (!assigned.error) {
      for (const row of (assigned.data ?? []) as Array<{
        contact_id: string;
        role_id: string;
        pms_business_contact_roles: { id: string; name: string } | null;
      }>) {
        const list = roleByContact.get(row.contact_id) ?? [];
        list.push({
          id: row.pms_business_contact_roles?.id ?? row.role_id,
          name: row.pms_business_contact_roles?.name ?? "Role",
        });
        roleByContact.set(row.contact_id, list);
      }
    } else {
      const junction = await db
        .from("guest_company_contact_roles")
        .select("contact_id, role_id")
        .in("contact_id", contactIds);
      const roleIds = [
        ...new Set(((junction.data ?? []) as Array<{ role_id: string }>).map((row) => row.role_id)),
      ];
      const names = new Map<string, string>();
      if (roleIds.length > 0) {
        const roles = await db
          .from("pms_business_contact_roles")
          .select("id, name")
          .eq("restaurant_id", restaurantId)
          .in("id", roleIds);
        for (const role of (roles.data ?? []) as Array<{ id: string; name: string }>) {
          names.set(role.id, role.name);
        }
      }
      for (const row of (junction.data ?? []) as Array<{ contact_id: string; role_id: string }>) {
        const list = roleByContact.get(row.contact_id) ?? [];
        list.push({ id: row.role_id, name: names.get(row.role_id) ?? "Role" });
        roleByContact.set(row.contact_id, list);
      }
    }
  }
  const signed = await signRoomImages(rows.map((row) => row.photo_storage_path).filter((path): path is string => Boolean(path)));
  return rows.map((row) => {
    const roles = roleByContact.get(row.id) ?? [];
    return mapContact(row, {
      departmentName: row.department_id ? departments.get(row.department_id) ?? null : null,
      photoUrl: row.photo_storage_path ? signed.get(row.photo_storage_path) ?? null : null,
      roleIds: roles.map((role) => role.id),
      roleNames: roles.map((role) => role.name),
    });
  });
}

async function syncPrimaryContactName(
  db: { from: (table: string) => any },
  restaurantId: string,
  companyId: string,
) {
  const primary = await db
    .from("guest_company_contacts")
    .select("name, position")
    .eq("restaurant_id", restaurantId)
    .eq("company_master_id", companyId)
    .eq("is_primary", true)
    .maybeSingle();
  await db
    .from("guest_account_masters")
    .update({
      primary_contact_name: primary.data?.name ?? null,
      primary_contact_title: primary.data?.position ?? null,
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", companyId);
}

async function replaceContactRoles(
  db: { from: (table: string) => any },
  restaurantId: string,
  contactId: string,
  roleIds: string[],
): Promise<boolean> {
  const unique = [...new Set(roleIds)];
  if (unique.length > 0) {
    const roles = await db
      .from("pms_business_contact_roles")
      .select("id, active")
      .eq("restaurant_id", restaurantId)
      .in("id", unique);
    if (roles.error) throw new Error(roles.error.message);
    const found = new Map(
      ((roles.data ?? []) as Array<{ id: string; active: boolean }>).map((row) => [row.id, row]),
    );
    for (const id of unique) {
      if (!found.has(id)) throw new Error("A selected contact role is not configured.");
    }
  }
  const existing = await db
    .from("guest_company_contact_roles")
    .select("role_id")
    .eq("contact_id", contactId);
  const existingIds = new Set(
    ((existing.data ?? []) as Array<{ role_id: string }>).map((row) => row.role_id),
  );
  const next = new Set(unique);
  const remove = [...existingIds].filter((id) => !next.has(id));
  const add = unique.filter((id) => !existingIds.has(id));
  if (remove.length > 0) {
    await db
      .from("guest_company_contact_roles")
      .delete()
      .eq("contact_id", contactId)
      .in("role_id", remove);
  }
  if (add.length > 0) {
    const inserted = await db.from("guest_company_contact_roles").insert(
      add.map((roleId) => ({ contact_id: contactId, role_id: roleId })),
    );
    if (inserted.error) throw new Error(inserted.error.message);
  }
  return remove.length > 0 || add.length > 0;
}

async function loadCompanyReservations(
  db: { from: (table: string) => any },
  restaurantId: string,
  companyId: string,
) {
  const result = await db
    .from("hotel_reservations")
    .select(
      "id, confirmation_number, arrival_date, departure_date, status, currency, room_subtotal, folio_balance, room_type_id, room_types!hotel_reservations_type_same_property ( name )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("company_master_id", companyId)
    .order("arrival_date", { ascending: false })
    .limit(200);
  if (result.error) {
    const bare = await db
      .from("hotel_reservations")
      .select("id, confirmation_number, arrival_date, departure_date, status, currency, room_subtotal")
      .eq("restaurant_id", restaurantId)
      .eq("company_master_id", companyId)
      .order("arrival_date", { ascending: false })
      .limit(200);
    if (bare.error) throw new Error(bare.error.message);
    return (bare.data ?? []) as Array<{
      id: string;
      confirmation_number: string;
      arrival_date: string;
      departure_date: string;
      status: string;
      currency?: string | null;
      room_subtotal?: number | null;
      folio_balance?: number | null;
      room_types?: { name: string } | null;
    }>;
  }
  return (result.data ?? []) as Array<{
    id: string;
    confirmation_number: string;
    arrival_date: string;
    departure_date: string;
    status: string;
    currency?: string | null;
    room_subtotal?: number | null;
    folio_balance?: number | null;
    room_types?: { name: string } | null;
  }>;
}

export const getCompanyDetailWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, companyId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const company = await loadCompanyMaster(db, data.restaurantId, data.companyId);
    const snapshot = await loadBusinessSnapshot(data.restaurantId);
    const type = snapshot?.types.find((row) => row.id === company.business_profile_type_id) ?? null;
    const signed = company.logo_storage_path
      ? await signRoomImages([company.logo_storage_path])
      : new Map<string, string>();
    const access = guestStayAccessForRole(me.role);
    const reservations = await loadCompanyReservations(db, data.restaurantId, data.companyId);
    const today = propertyToday("UTC");
    const year = today.slice(0, 4);
    const yearRows = reservations.filter(
      (row) => row.arrival_date >= `${year}-01-01` && row.arrival_date <= `${year}-12-31`,
    );
    const stays = yearRows.map((row) =>
      mapReservationToStay({
        id: row.id,
        confirmationNumber: row.confirmation_number,
        arrivalDate: row.arrival_date,
        departureDate: row.departure_date,
        status: row.status as never,
        roomSubtotal: row.room_subtotal ?? null,
        currency: row.currency ?? null,
        folioBalance: access.folio ? row.folio_balance ?? null : null,
      }),
    );
    const links = await db
      .from("guest_account_links")
      .select("guest_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.companyId);
    const guestIds = [
      ...new Set(((links.data ?? []) as Array<{ guest_id: string }>).map((row) => row.guest_id)),
    ];
    const kpis = companyOverviewKpis({
      reservationCount: yearRows.length,
      guestCount: guestIds.length,
      revenue: access.folio
        ? knownMoneyTotal(
            stays.map((stay) => ({
              amount: stay.roomSubtotal ?? stay.folioBalance,
              currency: stay.currency,
            })),
          )
        : null,
      nightCount: stays.reduce((sum, stay) => sum + stay.nights, 0),
      stayCount: stays.length,
    });
    const upcoming = reservations
      .filter((row) => isUpcomingStay(row.status as never, row.arrival_date, today))
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        confirmationNumber: row.confirmation_number,
        arrivalDate: row.arrival_date,
        departureDate: row.departure_date,
        roomLabel: row.room_types?.name?.trim() || "Reservation",
        nights: nightsBetween(row.arrival_date, row.departure_date),
        status: row.status,
      }));
    const agreementsRes = await db
      .from("pms_corporate_agreements")
      .select("id, code, name, contract_number, valid_from, valid_to, active")
      .eq("restaurant_id", data.restaurantId)
      .eq("company_id", data.companyId)
      .order("valid_from", { ascending: false });
    const agreements: CompanyAgreementRow[] = unavailable(agreementsRes.error)
      ? []
      : ((agreementsRes.data ?? []) as Array<{
          id: string;
          code: string;
          name: string;
          contract_number: string | null;
          valid_from: string | null;
          valid_to: string | null;
          active: boolean;
        }>).map((row) => ({
          id: row.id,
          contractNumber: row.contract_number || row.code,
          name: row.name,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          active: row.active,
          status: agreementStatus(
            { active: row.active, validFrom: row.valid_from, validTo: row.valid_to },
            today,
          ),
        }));
    return {
      company: {
        id: company.id,
        name: company.name,
        code: company.code,
        email: company.email,
        phone: company.phone,
        addressLine1: company.address_line1,
        city: company.city,
        country: company.country,
        website: company.website,
        notes: company.notes,
        accountStatus: company.account_status,
        logoUrl: company.logo_storage_path ? signed.get(company.logo_storage_path) ?? null : null,
        primaryContactName: company.primary_contact_name,
        primaryContactTitle: company.primary_contact_title,
        negotiatedRateReference: company.negotiated_rate_reference,
        hasCompanyRate: companyHasCompanyRate(company.negotiated_rate_reference),
        creditAccountEnabled: Boolean(company.credit_account_enabled),
        updatedAt: company.updated_at,
      },
      businessType: type
        ? {
            id: type.id,
            name: type.name,
            code: type.code,
            active: type.active,
            contactRequired: type.contactRequired,
            creditAccountAllowed: type.creditAccountAllowed,
          }
        : null,
      settingsEnabled: snapshot?.settings.enabled ?? true,
      travelAgency: isTravelAgencyBusinessType(type),
      folioAccess: access.folio,
      periodYear: year,
      kpis,
      upcoming,
      agreements,
    };
  });

export const listCompanyContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        q: z.string().max(120).optional(),
        status: z.enum(["all", ...COMPANY_CONTACT_STATUSES]).optional(),
        departmentId: z.string().uuid().optional().or(z.literal("all")),
        roleId: z.string().uuid().optional().or(z.literal("all")),
        primary: z.enum(["all", "yes", "no"]).optional(),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const snapshot = await loadBusinessSnapshot(data.restaurantId);
    const company = await loadCompanyMaster(db, data.restaurantId, data.companyId);
    const type = snapshot?.types.find((row) => row.id === company.business_profile_type_id) ?? null;
    let query = db
      .from("guest_company_contacts")
      .select(CONTACT_COLUMNS, { count: "exact" })
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.companyId)
      .order("is_primary", { ascending: false })
      .order("name");
    const q = data.q?.trim();
    if (q) {
      query = query.or(
        `name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,position.ilike.%${q}%,whatsapp.ilike.%${q}%`,
      );
    }
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.departmentId && data.departmentId !== "all") query = query.eq("department_id", data.departmentId);
    if (data.primary === "yes") query = query.eq("is_primary", true);
    if (data.primary === "no") query = query.eq("is_primary", false);
    const offset = data.offset ?? 0;
    const limit = data.limit ?? COMPANY_CONTACT_DEFAULT_PAGE_SIZE;
    if (data.roleId && data.roleId !== "all") {
      const assigned = await db
        .from("guest_company_contact_roles")
        .select("contact_id")
        .eq("role_id", data.roleId);
      const ids = [
        ...new Set(((assigned.data ?? []) as Array<{ contact_id: string }>).map((row) => row.contact_id)),
      ];
      query = ids.length > 0 ? query.in("id", ids) : query.eq("id", "00000000-0000-4000-8000-000000000000");
    }
    let result = await query.range(offset, offset + limit - 1);
    if (result.error && (result.error.code === "PGRST204" || result.error.message?.includes("whatsapp"))) {
      let fallback = db
        .from("guest_company_contacts")
        .select(
          "id, company_master_id, name, code, position, department_id, phone, email, photo_storage_path, status, is_primary, notes, created_at, updated_at",
          { count: "exact" },
        )
        .eq("restaurant_id", data.restaurantId)
        .eq("company_master_id", data.companyId)
        .order("is_primary", { ascending: false })
        .order("name");
      if (q) {
        fallback = fallback.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,position.ilike.%${q}%`);
      }
      if (data.status && data.status !== "all") fallback = fallback.eq("status", data.status);
      if (data.departmentId && data.departmentId !== "all") fallback = fallback.eq("department_id", data.departmentId);
      if (data.primary === "yes") fallback = fallback.eq("is_primary", true);
      if (data.primary === "no") fallback = fallback.eq("is_primary", false);
      if (data.roleId && data.roleId !== "all") {
        const assigned = await db
          .from("guest_company_contact_roles")
          .select("contact_id")
          .eq("role_id", data.roleId);
        const ids = [
          ...new Set(((assigned.data ?? []) as Array<{ contact_id: string }>).map((row) => row.contact_id)),
        ];
        fallback = ids.length > 0 ? fallback.in("id", ids) : fallback.eq("id", "00000000-0000-4000-8000-000000000000");
      }
      result = await fallback.range(offset, offset + limit - 1);
    }
    if (unavailable(result.error)) {
      return {
        items: [] as CompanyContactRow[],
        total: 0,
        offset,
        limit,
        kpis: {
          primaryName: null as string | null,
          primaryPosition: null as string | null,
          primaryId: null as string | null,
          total: 0,
          active: 0,
          inactive: 0,
          methods: { phone: 0, email: 0, whatsapp: 0 },
          departments: 0,
          departmentNames: [] as string[],
        },
        contactRequired: Boolean(type?.contactRequired),
        available: false,
      };
    }
    if (result.error) throw new Error(result.error.message);
    let all = await db
      .from("guest_company_contacts")
      .select("id, name, position, phone, email, whatsapp, department_id, is_primary, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.companyId);
    if (all.error && (all.error.code === "PGRST204" || all.error.message?.includes("whatsapp"))) {
      all = await db
        .from("guest_company_contacts")
        .select("id, name, position, phone, email, department_id, is_primary, status")
        .eq("restaurant_id", data.restaurantId)
        .eq("company_master_id", data.companyId);
    }
    const allRows = (all.data ?? []) as Array<{
      id: string;
      name: string;
      position?: string | null;
      phone: string | null;
      email: string | null;
      whatsapp?: string | null;
      department_id: string | null;
      is_primary: boolean;
      status?: string;
    }>;
    const departmentIds = [...new Set(allRows.map((row) => row.department_id).filter(Boolean))] as string[];
    const departmentNames = new Map<string, string>();
    if (departmentIds.length > 0) {
      const departments = await db
        .from("pms_departments")
        .select("id, name")
        .eq("restaurant_id", data.restaurantId)
        .in("id", departmentIds);
      for (const row of (departments.data ?? []) as Array<{ id: string; name: string }>) {
        departmentNames.set(row.id, row.name);
      }
    }
    const items = await decorateContacts(db, data.restaurantId, (result.data ?? []) as never);
    const primary = allRows.find((row) => row.is_primary);
    const scoped = allRows.map((row) => ({ departmentId: row.department_id }));
    return {
      items,
      total: result.count ?? items.length,
      offset,
      limit,
      kpis: {
        primaryName: primary?.name ?? null,
        primaryPosition: primary?.position ?? null,
        primaryId: primary?.id ?? null,
        total: allRows.length,
        active: allRows.filter((row) => row.status !== "inactive").length,
        inactive: allRows.filter((row) => row.status === "inactive").length,
        methods: contactMethodKpis(allRows),
        departments: distinctDepartmentCount(scoped),
        departmentNames: distinctDepartmentNames(scoped, departmentNames),
      },
      contactRequired: Boolean(type?.contactRequired),
      available: true,
    };
  });

export const getCompanyContactCatalogues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const roles = await db
      .from("pms_business_contact_roles")
      .select("id, name, code, active")
      .eq("restaurant_id", data.restaurantId)
      .order("name");
    const departments = await db
      .from("pms_departments")
      .select("id, name, code, active")
      .eq("restaurant_id", data.restaurantId)
      .order("name");
    return {
      roles: unavailable(roles.error)
        ? []
        : ((roles.data ?? []) as CompanyContactRole[]),
      departments: unavailable(departments.error)
        ? []
        : ((departments.data ?? []) as Array<{ id: string; name: string; code: string; active: boolean }>),
    };
  });

const contactSaveSchema = z.object({
  restaurantId: idSchema,
  companyId: idSchema,
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(200),
  position: z.string().max(120).optional().nullable(),
  departmentId: idSchema.optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  whatsapp: z.string().max(60).optional().nullable(),
  status: z.enum(COMPANY_CONTACT_STATUSES).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
  roleIds: z.array(idSchema).max(20).optional(),
  photoStoragePath: z.string().max(400).optional().nullable(),
});

export const saveCompanyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => contactSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const snapshot = await loadBusinessSnapshot(data.restaurantId);
    const company = await loadCompanyMaster(db, data.restaurantId, data.companyId);
    const type = snapshot?.types.find((row) => row.id === company.business_profile_type_id) ?? null;
    const email = normalizeEmail(data.email);
    const phone = blankToNull(data.phone);
    const whatsapp = blankToNull(data.whatsapp);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
    const emailNormalized = email;
    const phoneNormalized = normalizePhone(phone);
    const whatsappNormalized = normalizePhone(whatsapp);
    const status = data.status ?? "active";
    const isPrimary = data.isPrimary ?? false;
    const changeNotes: string[] = [];
    let currentPhone: string | null = null;
    let currentStatus: string | null = null;

    if (data.id) {
      const current = await db
        .from("guest_company_contacts")
        .select("id, is_primary, status, phone")
        .eq("restaurant_id", data.restaurantId)
        .eq("company_master_id", data.companyId)
        .eq("id", data.id)
        .maybeSingle();
      if (!current.data) throw new Error("That contact person could not be found.");
      currentPhone = current.data.phone ?? null;
      currentStatus = current.data.status ?? null;
      const blocked = blockLastPrimaryRemoval({
        contactRequired: Boolean(type?.contactRequired),
        currentIsPrimary: Boolean(current.data.is_primary),
        nextIsPrimary: isPrimary,
        nextStatus: status,
      });
      if (blocked) throw new Error(blocked);
    } else if (type?.contactRequired && !isPrimary) {
      const existingPrimary = await db
        .from("guest_company_contacts")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("company_master_id", data.companyId)
        .eq("is_primary", true)
        .maybeSingle();
      if (!existingPrimary.data) {
        throw new Error("This business type requires a primary contact.");
      }
    }

    if (emailNormalized || phoneNormalized) {
      let dup = db
        .from("guest_company_contacts")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("company_master_id", data.companyId);
      if (data.id) dup = dup.neq("id", data.id);
      if (emailNormalized) {
        const match = await dup.eq("email_normalized", emailNormalized).maybeSingle();
        if (match.data) throw new Error("A contact with this email already exists for this company.");
      }
      if (phoneNormalized) {
        let phoneDup = db
          .from("guest_company_contacts")
          .select("id")
          .eq("restaurant_id", data.restaurantId)
          .eq("company_master_id", data.companyId)
          .eq("phone_normalized", phoneNormalized);
        if (data.id) phoneDup = phoneDup.neq("id", data.id);
        const match = await phoneDup.maybeSingle();
        if (match.data) throw new Error("A contact with this phone already exists for this company.");
      }
    }

    if (isPrimary) {
      await db
        .from("guest_company_contacts")
        .update({ is_primary: false })
        .eq("restaurant_id", data.restaurantId)
        .eq("company_master_id", data.companyId)
        .eq("is_primary", true);
    }

    const payload = {
      restaurant_id: data.restaurantId,
      company_master_id: data.companyId,
      name: data.name.trim(),
      position: blankToNull(data.position),
      department_id: data.departmentId || null,
      phone,
      email,
      whatsapp,
      phone_normalized: phoneNormalized,
      email_normalized: emailNormalized,
      whatsapp_normalized: whatsappNormalized,
      status,
      is_primary: isPrimary,
      notes: blankToNull(data.notes),
      photo_storage_path: blankToNull(data.photoStoragePath),
    };

    const payloadWithoutWhatsapp = {
      restaurant_id: payload.restaurant_id,
      company_master_id: payload.company_master_id,
      name: payload.name,
      position: payload.position,
      department_id: payload.department_id,
      phone: payload.phone,
      email: payload.email,
      phone_normalized: payload.phone_normalized,
      email_normalized: payload.email_normalized,
      status: payload.status,
      is_primary: payload.is_primary,
      notes: payload.notes,
      photo_storage_path: payload.photo_storage_path,
    };

    let contactId = data.id ?? "";
    if (data.id) {
      let updated = await db
        .from("guest_company_contacts")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .select("id")
        .single();
      if (updated.error && (updated.error.code === "PGRST204" || updated.error.message?.includes("whatsapp"))) {
        updated = await db
          .from("guest_company_contacts")
          .update(payloadWithoutWhatsapp)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .single();
      }
      if (updated.error) throw new Error(updated.error.message);
      contactId = updated.data.id;
      if ((currentPhone ?? null) !== phone) changeNotes.push("Phone number changed");
      if ((currentStatus ?? "active") !== status) changeNotes.push("Contact status changed");
    } else {
      let inserted = await db
        .from("guest_company_contacts")
        .insert({
          ...payload,
          code: `CNT-${(uuidFirstSegment(crypto.randomUUID()) ?? "CONT").toUpperCase()}`,
        })
        .select("id")
        .single();
      if (inserted.error && (inserted.error.code === "PGRST204" || inserted.error.message?.includes("whatsapp"))) {
        inserted = await db
          .from("guest_company_contacts")
          .insert({
            ...payloadWithoutWhatsapp,
            code: `CNT-${(uuidFirstSegment(crypto.randomUUID()) ?? "CONT").toUpperCase()}`,
          })
          .select("id")
          .single();
      }
      if (inserted.error) throw new Error(inserted.error.message);
      contactId = inserted.data.id;
      changeNotes.push("Contact linked to company");
    }

    const rolesChanged = await replaceContactRoles(db, data.restaurantId, contactId, data.roleIds ?? []);
    if (rolesChanged) changeNotes.push("Contact role changed");
    await syncPrimaryContactName(db, data.restaurantId, data.companyId);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.companyId,
      eventType: data.id ? "contact_updated" : "contact_created",
      newValues: { contactId, name: data.name, isPrimary },
      notes: changeNotes.join(". ") || null,
      actorMembershipId: me.id,
    });
    if (isPrimary) {
      await recordGuestAccountEvent({
        restaurantId: data.restaurantId,
        masterId: data.companyId,
        eventType: "primary_contact_changed",
        newValues: { contactId, name: data.name },
        actorMembershipId: me.id,
      });
    }
    return { id: contactId };
  });

export const setCompanyContactPrimary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, companyId: idSchema, contactId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const contact = await db
      .from("guest_company_contacts")
      .select("id, name, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.companyId)
      .eq("id", data.contactId)
      .maybeSingle();
    if (!contact.data) throw new Error("That contact person could not be found.");
    if (contact.data.status === "inactive") throw new Error("Activate the contact before setting them as primary.");
    await db
      .from("guest_company_contacts")
      .update({ is_primary: false })
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.companyId)
      .eq("is_primary", true);
    const updated = await db
      .from("guest_company_contacts")
      .update({ is_primary: true })
      .eq("id", data.contactId);
    if (updated.error) throw new Error(updated.error.message);
    await syncPrimaryContactName(db, data.restaurantId, data.companyId);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.companyId,
      eventType: "primary_contact_changed",
      newValues: { contactId: data.contactId, name: contact.data.name },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const createCompanyContactPhotoUpload = createServerFn({ method: "POST" })
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
    await loadCompanyMaster(admin(supabaseAdmin), data.restaurantId, data.companyId);
    const ext = GUEST_IMAGE_EXT_BY_TYPE[data.contentType] ?? "jpg";
    const path = `${data.restaurantId}/companies/${data.companyId}/contacts/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage.from(ROOM_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not start the photo upload.");
    return { ok: true as const, path, token: signed.token };
  });

export const addCompanyNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, companyId: idSchema, note: z.string().trim().min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const company = await loadCompanyMaster(db, data.restaurantId, data.companyId);
    const next = [company.notes?.trim(), data.note.trim()].filter(Boolean).join("\n\n");
    const updated = await db
      .from("guest_account_masters")
      .update({ notes: next })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.companyId);
    if (updated.error) throw new Error(updated.error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.companyId,
      eventType: "note_added",
      notes: data.note.trim(),
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const listCompanyReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, companyId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CompanyReservationRow[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = await loadCompanyReservations(admin(supabaseAdmin), data.restaurantId, data.companyId);
    return rows.map((row) => ({
      id: row.id,
      confirmationNumber: row.confirmation_number,
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
      status: row.status,
      roomLabel: row.room_types?.name?.trim() || "Reservation",
      nights: nightsBetween(row.arrival_date, row.departure_date),
    }));
  });

export const listCompanyTravelers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        q: z.string().max(120).optional(),
        status: z.enum(["all", "active", "inactive"]).optional(),
        vip: z.enum(["all", "yes", "no"]).optional(),
        groupLeader: z.enum(["all", "yes", "no"]).optional(),
        nationality: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadCompanyMaster(db, data.restaurantId, data.companyId);
    const company = await loadCompanyMaster(db, data.restaurantId, data.companyId);
    const links = await db
      .from("guest_account_links")
      .select("id, guest_id, role, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.companyId)
      .in("role", ["employer", "bill_to"]);
    if (links.error) throw new Error(links.error.message);
    const linkRows = (links.data ?? []) as Array<{
      id: string;
      guest_id: string;
      role: string;
      created_at: string;
    }>;
    const guestIds = [...new Set(linkRows.map((row) => row.guest_id))];
    if (guestIds.length === 0) {
      return {
        items: [],
        kpis: travelerKpis([]),
        hasCompanyRate: companyHasCompanyRate(company.negotiated_rate_reference),
      };
    }
    const guests = await db
      .from("guest_profiles")
      .select(
        "id, first_name, last_name, email, phone, nationality, guest_status, vip_status, date_of_birth, gender, photo_storage_path, id_document_number, notes",
      )
      .eq("restaurant_id", data.restaurantId)
      .in("id", guestIds);
    if (guests.error) throw new Error(guests.error.message);
    const groupLinks = await db
      .from("guest_account_links")
      .select("guest_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("role", "group_member")
      .in("guest_id", guestIds);
    const groupLeaders = new Set(
      ((groupLinks.data ?? []) as Array<{ guest_id: string }>).map((row) => row.guest_id),
    );
    const today = propertyToday("UTC");
    const reservations = await db
      .from("hotel_reservations")
      .select("guest_id, arrival_date, departure_date, status")
      .eq("restaurant_id", data.restaurantId)
      .in("guest_id", guestIds)
      .order("arrival_date", { ascending: false });
    const staysByGuest = new Map<string, Array<{ arrival: string; departure: string; status: string }>>();
    for (const row of (reservations.data ?? []) as Array<{
      guest_id: string;
      arrival_date: string;
      departure_date: string;
      status: string;
    }>) {
      const list = staysByGuest.get(row.guest_id) ?? [];
      list.push({ arrival: row.arrival_date, departure: row.departure_date, status: row.status });
      staysByGuest.set(row.guest_id, list);
    }
    const signed = await signRoomImages(
      ((guests.data ?? []) as Array<{ photo_storage_path: string | null }>)
        .map((row) => row.photo_storage_path)
        .filter((path): path is string => Boolean(path)),
    );
    const q = data.q?.trim().toLowerCase();
    const items = ((guests.data ?? []) as Array<{
      id: string;
      first_name: string;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      nationality: string | null;
      guest_status: string;
      vip_status: boolean;
      date_of_birth: string | null;
      gender: string | null;
      photo_storage_path: string | null;
      id_document_number: string | null;
      notes: string | null;
    }>)
      .map((guest) => {
        const stays = staysByGuest.get(guest.id) ?? [];
        const lastStay = stays[0] ?? null;
        const upcomingTrips = stays.filter((stay) =>
          isUpcomingStay(stay.status as never, stay.arrival, today),
        ).length;
        const name = [guest.first_name, guest.last_name].filter(Boolean).join(" ").trim();
        return {
          id: guest.id,
          name,
          email: guest.email,
          phone: guest.phone,
          nationality: guest.nationality,
          guestStatus: guest.guest_status,
          vip: guest.vip_status,
          groupLeader: groupLeaders.has(guest.id),
          travelerType: travelerTypeLabel({ vip: guest.vip_status, groupLeader: groupLeaders.has(guest.id) }),
          lastStay: lastStay ? `${lastStay.arrival} – ${lastStay.departure}` : null,
          upcomingTrips,
          photoUrl: guest.photo_storage_path ? signed.get(guest.photo_storage_path) ?? null : null,
          passportMasked: maskIdNumber(guest.id_document_number),
          dateOfBirth: guest.date_of_birth,
          gender: guest.gender,
          notes: guest.notes,
          hasCompanyRate: companyHasCompanyRate(company.negotiated_rate_reference),
        };
      })
      .filter((row) => {
        if (q) {
          const hay = [row.name, row.email, row.phone, row.passportMasked].join(" ").toLowerCase();
          if (!hay.includes(q) && !(row.passportMasked && q.includes("passport"))) {
            const digits = q.replace(/[^0-9]/g, "");
            if (digits && !(row.phone ?? "").replace(/[^0-9]/g, "").includes(digits)) return false;
            if (!digits) return hay.includes(q);
          }
        }
        if (data.status && data.status !== "all" && row.guestStatus !== data.status) return false;
        if (data.vip === "yes" && !row.vip) return false;
        if (data.vip === "no" && row.vip) return false;
        if (data.groupLeader === "yes" && !row.groupLeader) return false;
        if (data.groupLeader === "no" && row.groupLeader) return false;
        if (data.nationality && data.nationality !== "all" && (row.nationality ?? "") !== data.nationality) {
          return false;
        }
        return true;
      });
    return {
      items,
      kpis: travelerKpis(items),
      hasCompanyRate: companyHasCompanyRate(company.negotiated_rate_reference),
    };
  });

export const COMPANY_CONTACT_PAGE_SIZE_OPTIONS = COMPANY_CONTACT_PAGE_SIZES;
