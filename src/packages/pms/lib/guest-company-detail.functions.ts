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
  companyBillingTotals,
  companyDocumentKpis,
  companyDocumentStatus,
  companyHasCompanyRate,
  companyOverviewKpis,
  companyReservationKpis,
  contactMethodKpis,
  distinctDepartmentCount,
  distinctDepartmentNames,
  isTravelAgencyBusinessType,
  latestNoteById,
  travelerKpis,
  travelerTypeLabel,
  COMPANY_NOTE_CATEGORIES,
  COMPANY_NOTE_VISIBILITIES,
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
  guestId: string | null;
  guestName: string;
  arrivalDate: string;
  departureDate: string;
  status: string;
  roomLabel: string;
  roomTypeId: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  source: string | null;
  nights: number;
  total: number | null;
  currency: string | null;
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
      "id, confirmation_number, guest_id, arrival_date, departure_date, status, currency, room_subtotal, room_type_id, rate_plan_id, source, room_types!hotel_reservations_type_same_property ( name ), guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("company_master_id", companyId)
    .order("arrival_date", { ascending: false })
    .limit(400);
  if (result.error) {
    const bare = await db
      .from("hotel_reservations")
      .select("id, confirmation_number, guest_id, arrival_date, departure_date, status, currency, room_subtotal, room_type_id, rate_plan_id, source")
      .eq("restaurant_id", restaurantId)
      .eq("company_master_id", companyId)
      .order("arrival_date", { ascending: false })
      .limit(400);
    if (bare.error) throw new Error(bare.error.message);
    return (bare.data ?? []) as Array<{
      id: string;
      confirmation_number: string;
      guest_id?: string | null;
      arrival_date: string;
      departure_date: string;
      status: string;
      currency?: string | null;
      room_subtotal?: number | null;
      folio_balance?: number | null;
      room_type_id?: string | null;
      rate_plan_id?: string | null;
      source?: string | null;
      room_types?: { name: string } | null;
      guest_profiles?: { first_name: string | null; last_name: string | null } | null;
    }>;
  }
  return (result.data ?? []) as Array<{
    id: string;
    confirmation_number: string;
    guest_id?: string | null;
    arrival_date: string;
    departure_date: string;
    status: string;
    currency?: string | null;
    room_subtotal?: number | null;
    folio_balance?: number | null;
    room_type_id?: string | null;
    rate_plan_id?: string | null;
    source?: string | null;
    room_types?: { name: string } | null;
    guest_profiles?: { first_name: string | null; last_name: string | null } | null;
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
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        note: z.string().trim().min(1).max(2000),
        category: z.enum(COMPANY_NOTE_CATEGORIES).optional(),
        visibility: z.enum(COMPANY_NOTE_VISIBILITIES).optional(),
        relatedGuestId: idSchema.optional().nullable(),
        relatedReservationId: idSchema.optional().nullable(),
      })
      .parse(input),
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
    const noteId = crypto.randomUUID();
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.companyId,
      eventType: "note_added",
      notes: data.note.trim(),
      newValues: {
        noteId,
        category: data.category ?? "general",
        visibility: data.visibility ?? "internal",
        relatedGuestId: data.relatedGuestId ?? null,
        relatedReservationId: data.relatedReservationId ?? null,
        archived: false,
      },
      actorMembershipId: me.id,
    });
    return { ok: true as const, noteId };
  });

export const listCompanyReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        q: z.string().max(120).optional(),
        status: z.string().max(40).optional(),
        from: z.string().max(20).optional(),
        to: z.string().max(20).optional(),
        source: z.string().max(80).optional(),
        roomTypeId: idSchema.optional(),
        ratePlanId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const rows = await loadCompanyReservations(db, data.restaurantId, data.companyId);
    const rateIds = [...new Set(rows.map((row) => row.rate_plan_id).filter(Boolean))] as string[];
    const rateNames = new Map<string, string>();
    if (rateIds.length > 0) {
      const rates = await db.from("hotel_rate_plans").select("id, name").eq("restaurant_id", data.restaurantId).in("id", rateIds);
      for (const row of (rates.data ?? []) as Array<{ id: string; name: string }>) rateNames.set(row.id, row.name);
    }
    const mapped: CompanyReservationRow[] = rows.map((row) => ({
      id: row.id,
      confirmationNumber: row.confirmation_number,
      guestId: row.guest_id ?? null,
      guestName: [row.guest_profiles?.first_name, row.guest_profiles?.last_name].filter(Boolean).join(" ").trim() || "Guest",
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
      status: row.status,
      roomLabel: row.room_types?.name?.trim() || "Reservation",
      roomTypeId: row.room_type_id ?? null,
      ratePlanId: row.rate_plan_id ?? null,
      ratePlanName: row.rate_plan_id ? rateNames.get(row.rate_plan_id) ?? null : null,
      source: row.source ?? null,
      nights: nightsBetween(row.arrival_date, row.departure_date),
      total: row.room_subtotal == null ? null : Number(row.room_subtotal),
      currency: row.currency ?? null,
    }));
    const q = data.q?.trim().toLowerCase();
    const items = mapped.filter((row) => {
      if (q && ![row.confirmationNumber, row.guestName, row.roomLabel, row.ratePlanName].join(" ").toLowerCase().includes(q)) {
        return false;
      }
      if (data.status && data.status !== "all" && row.status !== data.status) return false;
      if (data.from && row.arrivalDate < data.from) return false;
      if (data.to && row.departureDate > data.to) return false;
      if (data.source && data.source !== "all" && (row.source ?? "") !== data.source) return false;
      if (data.roomTypeId && row.roomTypeId !== data.roomTypeId) return false;
      if (data.ratePlanId && row.ratePlanId !== data.ratePlanId) return false;
      return true;
    });
    return {
      items,
      kpis: companyReservationKpis(mapped, propertyToday("UTC")),
      filters: {
        sources: [...new Set(mapped.map((row) => row.source).filter(Boolean))] as string[],
        roomTypes: [...new Map(mapped.filter((row) => row.roomTypeId).map((row) => [row.roomTypeId, row.roomLabel])).entries()].map(([id, name]) => ({ id: id!, name })),
        ratePlans: [...new Map(mapped.filter((row) => row.ratePlanId).map((row) => [row.ratePlanId, row.ratePlanName ?? "Rate"])).entries()].map(([id, name]) => ({ id: id!, name })),
      },
    };
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
          stays: stays.map((stay) => ({
            arrival: stay.arrival,
            departure: stay.departure,
            status: stay.status,
          })),
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

export const listCompanyNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        q: z.string().max(120).optional(),
        category: z.string().max(40).optional(),
        visibility: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadCompanyMaster(db, data.restaurantId, data.companyId);
    const history = await db
      .from("guest_account_history")
      .select("id, event_type, notes, new_values, actor_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.companyId)
      .in("event_type", ["note_added", "note_updated", "note_archived"])
      .order("created_at", { ascending: false })
      .limit(300);
    if (history.error) throw new Error(history.error.message);
    const actorIds = [
      ...new Set(
        ((history.data ?? []) as Array<{ actor_membership_id: string | null }>)
          .map((row) => row.actor_membership_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const actors = new Map<string, string>();
    if (actorIds.length > 0) {
      const members = await db.from("restaurant_memberships").select("id, display_name, email").in("id", actorIds);
      for (const row of (members.data ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>) {
        actors.set(row.id, row.display_name || row.email || "Staff");
      }
    }
    const events = ((history.data ?? []) as Array<{
      id: string;
      event_type: string;
      notes: string | null;
      new_values: Record<string, unknown> | null;
      actor_membership_id: string | null;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      noteId: String(row.new_values?.noteId ?? row.id),
      content: row.notes ?? "",
      category: String(row.new_values?.category ?? "general"),
      visibility: String(row.new_values?.visibility ?? "internal"),
      relatedGuestId: (row.new_values?.relatedGuestId as string | null) ?? null,
      relatedReservationId: (row.new_values?.relatedReservationId as string | null) ?? null,
      archived: row.event_type === "note_archived" || row.new_values?.archived === true,
      authorId: row.actor_membership_id,
      authorName: row.actor_membership_id ? actors.get(row.actor_membership_id) ?? "Staff" : "Staff",
      createdAt: row.created_at,
    }));
    const latest = latestNoteById(events).filter((row) => !row.archived);
    const q = data.q?.trim().toLowerCase();
    return {
      items: latest.filter((row) => {
        if (q && !`${row.content} ${row.authorName}`.toLowerCase().includes(q)) return false;
        if (data.category && data.category !== "all" && row.category !== data.category) return false;
        if (data.visibility && data.visibility !== "all" && row.visibility !== data.visibility) return false;
        return true;
      }),
    };
  });

export const updateCompanyNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        noteId: z.string().uuid(),
        note: z.string().trim().min(1).max(2000),
        category: z.enum(COMPANY_NOTE_CATEGORIES).optional(),
        visibility: z.enum(COMPANY_NOTE_VISIBILITIES).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    await loadCompanyMaster(admin((await import("@/integrations/supabase/client.server")).supabaseAdmin), data.restaurantId, data.companyId);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.companyId,
      eventType: "note_updated",
      notes: data.note.trim(),
      newValues: {
        noteId: data.noteId,
        category: data.category ?? "general",
        visibility: data.visibility ?? "internal",
        archived: false,
      },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const archiveCompanyNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, companyId: idSchema, noteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.companyId,
      eventType: "note_archived",
      newValues: { noteId: data.noteId, archived: true },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const listCompanyHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        eventType: z.string().max(60).optional(),
        from: z.string().max(40).optional(),
        to: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadCompanyMaster(db, data.restaurantId, data.companyId);
    let query = db
      .from("guest_account_history")
      .select("id, event_type, notes, new_values, actor_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.eventType && data.eventType !== "all") query = query.eq("event_type", data.eventType);
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) query = query.lte("created_at", `${data.to}T23:59:59.999Z`);
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    const actorIds = [
      ...new Set(
        ((result.data ?? []) as Array<{ actor_membership_id: string | null }>)
          .map((row) => row.actor_membership_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const actors = new Map<string, string>();
    if (actorIds.length > 0) {
      const members = await db.from("restaurant_memberships").select("id, display_name, email").in("id", actorIds);
      for (const row of (members.data ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>) {
        actors.set(row.id, row.display_name || row.email || "Staff");
      }
    }
    return {
      items: ((result.data ?? []) as Array<{
        id: string;
        event_type: string;
        notes: string | null;
        new_values: Record<string, unknown> | null;
        actor_membership_id: string | null;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        eventType: row.event_type,
        notes: row.notes,
        related: row.new_values?.relatedReservationId || row.new_values?.noteId || row.new_values?.documentId || null,
        actorName: row.actor_membership_id ? actors.get(row.actor_membership_id) ?? "Staff" : "Staff",
        createdAt: row.created_at,
      })),
    };
  });

export const listCompanyBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        status: z.string().max(40).optional(),
        q: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const company = await db
      .from("guest_account_masters")
      .select("id, name, account_status, payment_terms, credit_limit_note, credit_account_enabled, primary_contact_name, billing_contact_name")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.companyId)
      .eq("account_type", "company")
      .maybeSingle();
    if (company.error) throw new Error(company.error.message);
    if (!company.data) throw new Error("That company could not be found.");
    const access = guestStayAccessForRole(me.role);
    const moneyAvailable = access.folio;
    const reservations = await loadCompanyReservations(db, data.restaurantId, data.companyId);
    const reservationIds = reservations.map((row) => row.id);
    const transactions: Array<{
      id: string;
      date: string;
      reference: string;
      guestName: string;
      reservationId: string | null;
      confirmationNumber: string | null;
      description: string;
      debit: number;
      credit: number;
      status: string;
      folioId: string;
    }> = [];
    if (moneyAvailable && reservationIds.length > 0) {
      const folios = await db
        .from("guest_folios")
        .select("id, folio_number, status, reservation_id, guest_id")
        .eq("restaurant_id", data.restaurantId)
        .in("reservation_id", reservationIds);
      const folioRows = (folios.data ?? []) as Array<{
        id: string;
        folio_number: string;
        status: string;
        reservation_id: string | null;
        guest_id: string;
      }>;
      const folioIds = folioRows.map((row) => row.id);
      const reservationById = new Map(reservations.map((row) => [row.id, row]));
      if (folioIds.length > 0) {
        const txns = await db
          .from("folio_transactions")
          .select("id, folio_id, description, amount, posted_at, transaction_type")
          .eq("restaurant_id", data.restaurantId)
          .in("folio_id", folioIds)
          .order("posted_at", { ascending: true });
        for (const txn of (txns.data ?? []) as Array<{
          id: string;
          folio_id: string;
          description: string | null;
          amount: number | string;
          posted_at: string;
          transaction_type: string;
        }>) {
          const folio = folioRows.find((row) => row.id === txn.folio_id);
          const reservation = folio?.reservation_id ? reservationById.get(folio.reservation_id) : undefined;
          const amount = Number(txn.amount);
          transactions.push({
            id: txn.id,
            date: txn.posted_at,
            reference: folio?.folio_number ?? txn.id,
            guestName: reservation
              ? [reservation.guest_profiles?.first_name, reservation.guest_profiles?.last_name].filter(Boolean).join(" ").trim() || "Guest"
              : "Guest",
            reservationId: folio?.reservation_id ?? null,
            confirmationNumber: reservation?.confirmation_number ?? null,
            description: txn.description || txn.transaction_type,
            debit: amount >= 0 ? amount : 0,
            credit: amount < 0 ? -amount : 0,
            status: folio?.status ?? "open",
            folioId: txn.folio_id,
          });
        }
      }
    }
    const q = data.q?.trim().toLowerCase();
    const items = transactions.filter((row) => {
      if (data.status && data.status !== "all" && row.status !== data.status) return false;
      if (q && ![row.reference, row.guestName, row.confirmationNumber, row.description].join(" ").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    let running = 0;
    const withBalance = items.map((row) => {
      running += row.debit - row.credit;
      return { ...row, balance: Math.round(running * 100) / 100 };
    });
    const totals = companyBillingTotals(
      transactions.map((row) => ({ amount: row.debit - row.credit, folioStatus: row.status })),
    );
    return {
      summary: {
        accountStatus: company.data.account_status,
        paymentTerms: (company.data as { payment_terms?: string | null }).payment_terms ?? null,
        creditAccountEnabled: Boolean((company.data as { credit_account_enabled?: boolean }).credit_account_enabled),
        creditLimitNote: (company.data as { credit_limit_note?: string | null }).credit_limit_note ?? null,
        billingContact:
          (company.data as { billing_contact_name?: string | null }).billing_contact_name ||
          company.data.primary_contact_name ||
          null,
        moneyAvailable,
        canOperate: moneyAvailable,
      },
      kpis: moneyAvailable
        ? {
            outstanding: totals.outstanding,
            totalRevenue: totals.charges,
            paid: totals.credits,
            pending: transactions.filter((row) => row.status === "open").length,
          }
        : null,
      items: withBalance,
      actorRole: me.role,
    };
  });

const DEFAULT_COMPANY_DOC_TYPES = [
  { name: "Trade License", code: "TRADE_LICENSE" },
  { name: "Tax Certificate", code: "TAX_CERTIFICATE" },
  { name: "Contract", code: "CONTRACT" },
  { name: "Other", code: "OTHER" },
];

async function ensureCompanyDocumentTypes(db: { from: (table: string) => any }, restaurantId: string) {
  const existing = await db
    .from("pms_company_document_types")
    .select("id, name, code, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (existing.error && isMissingSchemaError(existing.error)) return [];
  if (existing.error) throw new Error(existing.error.message);
  const rows = (existing.data ?? []) as Array<{ id: string; name: string; code: string; active: boolean }>;
  if (rows.length > 0) return rows;
  const inserted = await db
    .from("pms_company_document_types")
    .insert(DEFAULT_COMPANY_DOC_TYPES.map((type) => ({ restaurant_id: restaurantId, ...type })))
    .select("id, name, code, active");
  if (inserted.error) return rows;
  return (inserted.data ?? []) as Array<{ id: string; name: string; code: string; active: boolean }>;
}

export const listCompanyDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, companyId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadCompanyMaster(db, data.restaurantId, data.companyId);
    const types = await ensureCompanyDocumentTypes(db, data.restaurantId);
    const docs = await db
      .from("guest_company_documents")
      .select(
        "id, document_type_id, name, reference_number, issue_date, expiry_date, review_status, storage_path, uploaded_by_membership_id, reviewed_at, created_at",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.companyId)
      .order("created_at", { ascending: false });
    if (docs.error && isMissingSchemaError(docs.error)) {
      return { types, items: [], kpis: companyDocumentKpis([], propertyToday("UTC")), available: false };
    }
    if (docs.error) throw new Error(docs.error.message);
    const today = propertyToday("UTC");
    const typeById = new Map(types.map((type) => [type.id, type]));
    const paths = ((docs.data ?? []) as Array<{ storage_path: string | null }>)
      .map((row) => row.storage_path)
      .filter((path): path is string => Boolean(path));
    const signed = await signRoomImages(paths);
    const items = ((docs.data ?? []) as Array<{
      id: string;
      document_type_id: string;
      name: string;
      reference_number: string | null;
      issue_date: string | null;
      expiry_date: string | null;
      review_status: "pending" | "verified" | "rejected";
      storage_path: string | null;
      uploaded_by_membership_id: string | null;
      reviewed_at: string | null;
      created_at: string;
    }>).map((row) => {
      const status = companyDocumentStatus({ reviewStatus: row.review_status, expiryDate: row.expiry_date, today });
      return {
        id: row.id,
        typeId: row.document_type_id,
        typeName: typeById.get(row.document_type_id)?.name ?? "Document",
        name: row.name,
        referenceNumber: row.reference_number,
        issueDate: row.issue_date,
        expiryDate: row.expiry_date,
        reviewStatus: row.review_status,
        status,
        previewUrl: row.storage_path ? signed.get(row.storage_path) ?? null : null,
        storagePath: row.storage_path,
        uploadedAt: row.created_at,
        reviewedAt: row.reviewed_at,
      };
    });
    return { types, items, kpis: companyDocumentKpis(items, today), available: true };
  });

export const createCompanyDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
        size: z.number().int().positive().max(12 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    await loadCompanyMaster(admin((await import("@/integrations/supabase/client.server")).supabaseAdmin), data.restaurantId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = data.contentType === "application/pdf" ? "pdf" : (GUEST_IMAGE_EXT_BY_TYPE[data.contentType] ?? "jpg");
    const path = `${data.restaurantId}/companies/${data.companyId}/docs/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage.from(ROOM_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not start the document upload.");
    return { ok: true as const, path, token: signed.token };
  });

export const saveCompanyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        documentId: idSchema.optional(),
        typeId: idSchema,
        name: z.string().trim().min(1).max(200),
        referenceNumber: z.string().max(80).optional().nullable(),
        issueDate: z.string().max(20).optional().nullable(),
        expiryDate: z.string().max(20).optional().nullable(),
        path: z.string().min(1).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadCompanyMaster(db, data.restaurantId, data.companyId);
    const types = await ensureCompanyDocumentTypes(db, data.restaurantId);
    const type = types.find((row) => row.id === data.typeId);
    if (!type) throw new Error("Select a configured document type.");
    if (!type.active && !data.documentId) throw new Error("That document type is inactive.");
    const prefix = `${data.restaurantId}/companies/${data.companyId}/`;
    if (data.path && !data.path.startsWith(prefix)) throw new Error("That document path is not valid for this company.");
    const payload = {
      restaurant_id: data.restaurantId,
      company_master_id: data.companyId,
      document_type_id: data.typeId,
      name: data.name.trim(),
      reference_number: blankToNull(data.referenceNumber),
      issue_date: blankToNull(data.issueDate),
      expiry_date: blankToNull(data.expiryDate),
      ...(data.path ? { storage_path: data.path, uploaded_by_membership_id: me.id } : {}),
    };
    if (data.documentId) {
      const updated = await db
        .from("guest_company_documents")
        .update(payload)
        .eq("id", data.documentId)
        .eq("restaurant_id", data.restaurantId)
        .eq("company_master_id", data.companyId);
      if (updated.error) throw new Error(updated.error.message);
      await recordGuestAccountEvent({
        restaurantId: data.restaurantId,
        masterId: data.companyId,
        eventType: data.path ? "document_replaced" : "document_uploaded",
        newValues: { documentId: data.documentId },
        notes: data.name,
        actorMembershipId: me.id,
      });
      return { id: data.documentId };
    }
    const inserted = await db.from("guest_company_documents").insert(payload).select("id").single();
    if (inserted.error) throw new Error(inserted.error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.companyId,
      eventType: "document_uploaded",
      newValues: { documentId: inserted.data.id },
      notes: data.name,
      actorMembershipId: me.id,
    });
    return { id: inserted.data.id as string };
  });

export const reviewCompanyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        documentId: idSchema,
        reviewStatus: z.enum(["verified", "rejected"]),
        reviewNote: z.string().max(400).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const updated = await db
      .from("guest_company_documents")
      .update({
        review_status: data.reviewStatus,
        reviewed_by_membership_id: me.id,
        reviewed_at: new Date().toISOString(),
        review_note: blankToNull(data.reviewNote),
      })
      .eq("id", data.documentId)
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.companyId);
    if (updated.error) throw new Error(updated.error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.companyId,
      eventType: data.reviewStatus === "verified" ? "document_verified" : "document_rejected",
      newValues: { documentId: data.documentId },
      notes: data.reviewNote ?? data.reviewStatus,
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const deleteCompanyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, companyId: idSchema, documentId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await admin(supabaseAdmin)
      .from("guest_company_documents")
      .delete()
      .eq("id", data.documentId)
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.companyId);
    if (result.error) throw new Error(result.error.message);
    return { ok: true as const };
  });

export const listCompanyContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        companyId: idSchema,
        status: z.string().max(40).optional(),
        q: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadCompanyMaster(db, data.restaurantId, data.companyId);
    const today = propertyToday("UTC");
    let agreements = await db
      .from("pms_corporate_agreements")
      .select(
        "id, code, name, contract_number, valid_from, valid_to, currency_code, description, active, auto_renew, notice_period_days, signed_at, signed_by, file_storage_path",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("company_id", data.companyId)
      .order("valid_from", { ascending: false });
    if (agreements.error && (agreements.error.code === "42703" || agreements.error.code === "PGRST204")) {
      agreements = await db
        .from("pms_corporate_agreements")
        .select("id, code, name, contract_number, valid_from, valid_to, currency_code, description, active")
        .eq("restaurant_id", data.restaurantId)
        .eq("company_id", data.companyId)
        .order("valid_from", { ascending: false });
    }
    if (agreements.error && isMissingSchemaError(agreements.error)) return { items: [], rates: [], kpis: { total: 0, active: 0, expiring: 0, expired: 0 } };
    if (agreements.error) throw new Error(agreements.error.message);
    const items = ((agreements.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const status = agreementStatus(
        { active: row.active !== false, validFrom: String(row.valid_from ?? ""), validTo: String(row.valid_to ?? "") },
        today,
      );
      return {
        id: String(row.id),
        code: String(row.code ?? ""),
        name: String(row.name ?? ""),
        contractNumber: String(row.contract_number ?? row.code ?? ""),
        validFrom: String(row.valid_from ?? ""),
        validTo: String(row.valid_to ?? ""),
        currencyCode: String(row.currency_code ?? ""),
        description: String(row.description ?? ""),
        active: row.active !== false,
        status,
        autoRenew: row.auto_renew === true,
        noticePeriodDays: row.notice_period_days == null ? null : Number(row.notice_period_days),
        signedAt: row.signed_at ? String(row.signed_at) : null,
        signedBy: row.signed_by ? String(row.signed_by) : null,
        fileStoragePath: row.file_storage_path ? String(row.file_storage_path) : null,
      };
    });
    const ids = items.map((row) => row.id);
    const rates = ids.length
      ? await db
          .from("pms_contract_rates")
          .select("id, agreement_id, room_type_id, rate_kind, amount, valid_from, valid_to, active")
          .eq("restaurant_id", data.restaurantId)
          .in("agreement_id", ids)
      : { data: [], error: null };
    const q = data.q?.trim().toLowerCase();
    const filtered = items.filter((row) => {
      if (data.status && data.status !== "all" && row.status !== data.status) return false;
      if (q && ![row.name, row.code, row.contractNumber].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    return {
      items: filtered,
      rates: ((rates.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        agreementId: String(row.agreement_id),
        roomTypeId: String(row.room_type_id),
        rateKind: String(row.rate_kind),
        amount: Number(row.amount ?? 0),
        validFrom: String(row.valid_from ?? ""),
        validTo: String(row.valid_to ?? ""),
        active: row.active !== false,
      })),
      kpis: {
        total: items.length,
        active: items.filter((row) => row.status === "active").length,
        expiring: items.filter((row) => row.status === "expiring").length,
        expired: items.filter((row) => row.status === "expired").length,
      },
    };
  });

