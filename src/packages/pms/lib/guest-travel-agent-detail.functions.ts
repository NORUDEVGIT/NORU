/**
 * Travel Agency Detail workspace APIs.
 * Rows stay on guest_account_masters.account_type = travel_agent.
 * Contacts/documents reuse guest_company_* tables. Reservations reuse hotel_reservations.
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
import { requireCashieringAccess } from "./cashiering.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { ROOM_BUCKET, signRoomImages } from "./rooms.server";
import { guestStayAccessForRole } from "./guests.functions";
import { nightsBetween } from "./reservation-dates";
import { propertyToday } from "./reservations.server";
import { uuidFirstSegment } from "./guest-profile-listing";
import {
  COMPANY_CONTACT_DEFAULT_PAGE_SIZE,
  COMPANY_CONTACT_STATUSES,
  COMPANY_NOTE_CATEGORIES,
  COMPANY_NOTE_VISIBILITIES,
  agreementStatus,
  contactMethodKpis,
  distinctDepartmentCount,
  distinctDepartmentNames,
} from "./guest-company-detail-workspace";
import type { CompanyContactRow } from "./guest-company-detail.functions";
import { getCompanyContactCatalogues } from "./guest-company-detail.functions";
import {
  TA_ALLOTMENT_STATUSES,
  TA_BOOKING_ACCESS,
  TA_COMMISSION_ENTRY_STATUSES,
  TA_COMMISSION_PLAN_TYPES,
  TA_NOTIFICATION_EVENTS,
  commissionEntryTotals,
  parseLegacyCommissionRate,
  travelAgentBillingTotals,
  travelAgentDocumentKpis,
  travelAgentDocumentStatus,
  travelAgentOverviewKpis,
  travelAgentReservationKpis,
  latestNoteById,
} from "./guest-travel-agent-detail-workspace";
import { AGENCY_TYPES } from "./guest-profile-travel-agency";
import { GUEST_ACCOUNT_STATUSES } from "./guest-profile-wave4";
import { sendGuestAccountMessage } from "./guest-privacy.functions";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

function unavailable(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && isMissingSchemaError(error));
}

const TA_MASTER_COLUMNS =
  "id, name, trade_name, code, email, phone, phone_alt, email_alt, address_line1, address_line2, city, region, country, postal_code, website, notes, account_status, agency_type, agency_type_other, primary_contact_name, billing_contact_name, iata_license_number, license_expiry_date, tax_id, business_registration_number, commission_label, commission_type, commission_currency_note, contract_reference, contract_start_date, contract_end_date, contract_status, contract_signed_with, payment_terms, credit_limit_note, billing_instruction, negotiated_rate_reference, logo_storage_path, preferred_currency, market_segment_id, booking_access, max_advance_booking_days, min_stay_nights, max_stay_nights, group_bookings_allowed, credit_limit_amount, created_at, updated_at";

export type TravelAgentMasterRow = {
  id: string;
  name: string;
  trade_name: string | null;
  code: string | null;
  email: string | null;
  phone: string | null;
  phone_alt: string | null;
  email_alt: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postal_code: string | null;
  website: string | null;
  notes: string | null;
  account_status: string;
  agency_type: string | null;
  agency_type_other: string | null;
  primary_contact_name: string | null;
  billing_contact_name: string | null;
  iata_license_number: string | null;
  license_expiry_date: string | null;
  tax_id: string | null;
  business_registration_number: string | null;
  commission_label: string | null;
  commission_type: string | null;
  commission_currency_note: string | null;
  contract_reference: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_status: string | null;
  contract_signed_with: string | null;
  payment_terms: string | null;
  credit_limit_note: string | null;
  billing_instruction: string | null;
  negotiated_rate_reference: string | null;
  logo_storage_path: string | null;
  preferred_currency: string | null;
  market_segment_id: string | null;
  booking_access: string | null;
  max_advance_booking_days: number | null;
  min_stay_nights: number | null;
  max_stay_nights: number | null;
  group_bookings_allowed: boolean | null;
  credit_limit_amount: number | null;
  created_at: string;
  updated_at: string;
};

export async function loadTravelAgentMaster(
  db: { from: (table: string) => any },
  restaurantId: string,
  agencyId: string,
): Promise<TravelAgentMasterRow> {
  let result = await db
    .from("guest_account_masters")
    .select(TA_MASTER_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .eq("id", agencyId)
    .eq("account_type", "travel_agent")
    .maybeSingle();
  if (result.error && (result.error.code === "42703" || result.error.code === "PGRST204")) {
    result = await db
      .from("guest_account_masters")
      .select(
        "id, name, trade_name, code, email, phone, address_line1, city, country, website, notes, account_status, agency_type, agency_type_other, primary_contact_name, billing_contact_name, iata_license_number, license_expiry_date, tax_id, business_registration_number, commission_label, commission_type, commission_currency_note, contract_reference, contract_start_date, contract_end_date, contract_status, contract_signed_with, payment_terms, credit_limit_note, billing_instruction, negotiated_rate_reference, logo_storage_path, created_at, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .eq("id", agencyId)
      .eq("account_type", "travel_agent")
      .maybeSingle();
  }
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("That Travel Agency could not be found.");
  return result.data as TravelAgentMasterRow;
}

async function loadTravelAgentReservations(
  db: { from: (table: string) => any },
  restaurantId: string,
  agencyId: string,
) {
  const result = await db
    .from("hotel_reservations")
    .select(
      "id, confirmation_number, guest_id, arrival_date, departure_date, status, currency, room_subtotal, room_type_id, rate_plan_id, source, room_types!hotel_reservations_type_same_property ( name ), guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("travel_agent_master_id", agencyId)
    .order("arrival_date", { ascending: false })
    .limit(400);
  if (result.error) {
    const bare = await db
      .from("hotel_reservations")
      .select(
        "id, confirmation_number, guest_id, arrival_date, departure_date, status, currency, room_subtotal, room_type_id, rate_plan_id, source",
      )
      .eq("restaurant_id", restaurantId)
      .eq("travel_agent_master_id", agencyId)
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

function mapAgency(agency: TravelAgentMasterRow, logoUrl: string | null) {
  return {
    id: agency.id,
    name: agency.name,
    tradeName: agency.trade_name,
    code: agency.code,
    email: agency.email,
    phone: agency.phone,
    phoneAlt: agency.phone_alt,
    emailAlt: agency.email_alt,
    addressLine1: agency.address_line1,
    addressLine2: agency.address_line2,
    city: agency.city,
    region: agency.region,
    country: agency.country,
    postalCode: agency.postal_code,
    website: agency.website,
    notes: agency.notes,
    accountStatus: agency.account_status,
    agencyType: agency.agency_type,
    agencyTypeOther: agency.agency_type_other,
    primaryContactName: agency.primary_contact_name,
    billingContactName: agency.billing_contact_name,
    iataLicenseNumber: agency.iata_license_number,
    licenseExpiryDate: agency.license_expiry_date,
    taxId: agency.tax_id,
    businessRegistrationNumber: agency.business_registration_number,
    paymentTerms: agency.payment_terms,
    creditLimitNote: agency.credit_limit_note,
    billingInstruction: agency.billing_instruction,
    creditLimitAmount: agency.credit_limit_amount == null ? null : Number(agency.credit_limit_amount),
    preferredCurrency: agency.preferred_currency,
    marketSegmentId: agency.market_segment_id,
    bookingAccess: agency.booking_access === "restricted" ? "restricted" : "open",
    maxAdvanceBookingDays: agency.max_advance_booking_days,
    minStayNights: agency.min_stay_nights,
    maxStayNights: agency.max_stay_nights,
    groupBookingsAllowed: agency.group_bookings_allowed !== false,
    logoUrl,
    partnerSince: agency.created_at,
    updatedAt: agency.updated_at,
  };
}

export const getTravelAgentDetailWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, agencyId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const agency = await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const signed = agency.logo_storage_path ? await signRoomImages([agency.logo_storage_path]) : new Map<string, string>();
    const access = guestStayAccessForRole(me.role);
    const reservations = await loadTravelAgentReservations(db, data.restaurantId, data.agencyId);
    const links = await db
      .from("guest_account_links")
      .select("guest_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.agencyId);
    const guestIds = new Set(((links.data ?? []) as Array<{ guest_id: string }>).map((row) => row.guest_id));
    for (const row of reservations) if (row.guest_id) guestIds.add(row.guest_id);
    const plans = await db
      .from("pms_agency_commission_plans")
      .select("id, commission_type, rate_value, currency, active, effective_on, expires_on")
      .eq("restaurant_id", data.restaurantId)
      .eq("agency_master_id", data.agencyId)
      .eq("active", true)
      .order("effective_on", { ascending: false });
    const planRows = unavailable(plans.error)
      ? []
      : ((plans.data ?? []) as Array<{
          commission_type: string;
          rate_value: number;
          currency: string;
        }>);
    const entries = await db
      .from("pms_agency_commission_entries")
      .select("amount, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("agency_master_id", data.agencyId);
    const entryRows = unavailable(entries.error)
      ? []
      : ((entries.data ?? []) as Array<{ amount: number; status: string }>);
    const activePlan = planRows[0] ?? null;
    const defaultRateLabel = activePlan
      ? activePlan.commission_type === "percent"
        ? `${Number(activePlan.rate_value)}%`
        : `${activePlan.currency} ${Number(activePlan.rate_value)}`
      : agency.commission_type === "percent" && parseLegacyCommissionRate(agency.commission_label) != null
        ? `${parseLegacyCommissionRate(agency.commission_label)}%`
        : null;
    const kpis = travelAgentOverviewKpis({
      bookingCount: reservations.length,
      guestCount: guestIds.size,
      commissionTotal: commissionEntryTotals(entryRows).earned,
      commissionConfigured: Boolean(activePlan || defaultRateLabel),
      defaultRateLabel,
    });
    const today = propertyToday("UTC");
    const agreementsRes = await db
      .from("pms_corporate_agreements")
      .select("id, code, name, contract_number, valid_from, valid_to, active")
      .eq("restaurant_id", data.restaurantId)
      .eq("company_id", data.agencyId)
      .order("valid_from", { ascending: false });
    const agreements = unavailable(agreementsRes.error)
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
      agency: mapAgency(
        agency,
        agency.logo_storage_path ? signed.get(agency.logo_storage_path) ?? null : null,
      ),
      folioAccess: access.folio,
      kpis,
      commission: {
        configured: Boolean(activePlan),
        defaultRateLabel,
        totals: commissionEntryTotals(entryRows),
      },
      recentBookings: reservations.slice(0, 5).map((row) => ({
        id: row.id,
        confirmationNumber: row.confirmation_number,
        guestId: row.guest_id ?? null,
        guestName:
          [row.guest_profiles?.first_name, row.guest_profiles?.last_name].filter(Boolean).join(" ").trim() ||
          "Guest",
        arrivalDate: row.arrival_date,
        departureDate: row.departure_date,
        status: row.status,
        roomLabel: row.room_types?.name?.trim() || "Reservation",
        nights: nightsBetween(row.arrival_date, row.departure_date),
        total: access.folio && row.room_subtotal != null ? Number(row.room_subtotal) : null,
        currency: row.currency ?? null,
      })),
      agreements,
    };
  });

export const setTravelAgentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        status: z.enum(["active", "inactive"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const updated = await db
      .from("guest_account_masters")
      .update({ account_status: data.status })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.agencyId)
      .eq("account_type", "travel_agent");
    if (updated.error) throw new Error(updated.error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "status_changed",
      newValues: { account_status: data.status },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const createTravelAgentLogoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        size: z.number().int().positive().max(8 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadTravelAgentMaster(admin(supabaseAdmin), data.restaurantId, data.agencyId);
    const ext = GUEST_IMAGE_EXT_BY_TYPE[data.contentType] ?? "jpg";
    const path = `${data.restaurantId}/travel-agents/${data.agencyId}/logo/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage.from(ROOM_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not start the logo upload.");
    return { ok: true as const, path, token: signed.token };
  });

export const saveTravelAgentLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, agencyId: idSchema, path: z.string().min(1).max(400) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const prefix = `${data.restaurantId}/travel-agents/${data.agencyId}/`;
    if (!data.path.startsWith(prefix)) throw new Error("That logo path is not valid for this agency.");
    const updated = await db
      .from("guest_account_masters")
      .update({ logo_storage_path: data.path })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.agencyId);
    if (updated.error) throw new Error(updated.error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "logo_updated",
      newValues: { logo_storage_path: data.path },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

const CONTACT_COLUMNS =
  "id, company_master_id, name, code, position, department_id, phone, email, whatsapp, photo_storage_path, status, is_primary, notes, created_at, updated_at";

async function decorateTaContacts(
  db: { from: (table: string) => any },
  restaurantId: string,
  rows: Array<{
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
  }>,
): Promise<CompanyContactRow[]> {
  const departmentIds = [...new Set(rows.map((row) => row.department_id).filter(Boolean))] as string[];
  const departments = new Map<string, string>();
  if (departmentIds.length > 0) {
    const result = await db.from("pms_departments").select("id, name").eq("restaurant_id", restaurantId).in("id", departmentIds);
    for (const row of (result.data ?? []) as Array<{ id: string; name: string }>) departments.set(row.id, row.name);
  }
  const signed = await signRoomImages(
    rows.map((row) => row.photo_storage_path).filter((path): path is string => Boolean(path)),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    position: row.position,
    departmentId: row.department_id,
    departmentName: row.department_id ? departments.get(row.department_id) ?? null : null,
    phone: row.phone,
    email: row.email,
    whatsapp: row.whatsapp ?? null,
    photoUrl: row.photo_storage_path ? signed.get(row.photo_storage_path) ?? null : null,
    photoStoragePath: row.photo_storage_path,
    status: row.status === "inactive" ? "inactive" : "active",
    isPrimary: row.is_primary,
    notes: row.notes,
    roleIds: [],
    roleNames: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export const listTravelAgentContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        q: z.string().max(120).optional(),
        status: z.enum(["all", ...COMPANY_CONTACT_STATUSES]).optional(),
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
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    let query = db
      .from("guest_company_contacts")
      .select(CONTACT_COLUMNS, { count: "exact" })
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.agencyId)
      .order("is_primary", { ascending: false })
      .order("name");
    const q = data.q?.trim();
    if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,position.ilike.%${q}%`);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.primary === "yes") query = query.eq("is_primary", true);
    if (data.primary === "no") query = query.eq("is_primary", false);
    const offset = data.offset ?? 0;
    const limit = data.limit ?? COMPANY_CONTACT_DEFAULT_PAGE_SIZE;
    const result = await query.range(offset, offset + limit - 1);
    if (unavailable(result.error)) {
      return { items: [] as CompanyContactRow[], total: 0, offset, limit, kpis: emptyContactKpis(), available: false };
    }
    if (result.error) throw new Error(result.error.message);
    const all = await db
      .from("guest_company_contacts")
      .select("id, name, position, phone, email, department_id, is_primary, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.agencyId);
    const allRows = (all.data ?? []) as Array<{
      id: string;
      name: string;
      position?: string | null;
      phone: string | null;
      email: string | null;
      department_id: string | null;
      is_primary: boolean;
      status?: string;
    }>;
    const items = await decorateTaContacts(db, data.restaurantId, (result.data ?? []) as never);
    const primary = allRows.find((row) => row.is_primary);
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
        departments: distinctDepartmentCount(allRows.map((row) => ({ departmentId: row.department_id }))),
        departmentNames: distinctDepartmentNames(
          allRows.map((row) => ({ departmentId: row.department_id })),
          new Map(),
        ),
      },
      available: true,
    };
  });

function emptyContactKpis() {
  return {
    primaryName: null as string | null,
    primaryPosition: null as string | null,
    primaryId: null as string | null,
    total: 0,
    active: 0,
    inactive: 0,
    methods: { phone: 0, email: 0, whatsapp: 0 },
    departments: 0,
    departmentNames: [] as string[],
  };
}

export const saveTravelAgentContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
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
        photoStoragePath: z.string().max(400).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const email = normalizeEmail(data.email);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
    const phone = blankToNull(data.phone);
    const status = data.status ?? "active";
    const isPrimary = data.isPrimary ?? false;
    if (isPrimary) {
      await db
        .from("guest_company_contacts")
        .update({ is_primary: false })
        .eq("restaurant_id", data.restaurantId)
        .eq("company_master_id", data.agencyId)
        .eq("is_primary", true);
    }
    const payload = {
      restaurant_id: data.restaurantId,
      company_master_id: data.agencyId,
      name: data.name.trim(),
      position: blankToNull(data.position),
      department_id: data.departmentId || null,
      phone,
      email,
      whatsapp: blankToNull(data.whatsapp),
      phone_normalized: normalizePhone(phone),
      email_normalized: email,
      status,
      is_primary: isPrimary,
      notes: blankToNull(data.notes),
      photo_storage_path: blankToNull(data.photoStoragePath),
    };
    let contactId = data.id ?? "";
    if (data.id) {
      const updated = await db
        .from("guest_company_contacts")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .eq("company_master_id", data.agencyId)
        .select("id")
        .single();
      if (updated.error) throw new Error(updated.error.message);
      contactId = updated.data.id;
    } else {
      const inserted = await db
        .from("guest_company_contacts")
        .insert({
          ...payload,
          code: `CNT-${(uuidFirstSegment(crypto.randomUUID()) ?? "CONT").toUpperCase()}`,
        })
        .select("id")
        .single();
      if (inserted.error) throw new Error(inserted.error.message);
      contactId = inserted.data.id;
    }
    if (isPrimary) {
      await db
        .from("guest_account_masters")
        .update({ primary_contact_name: data.name.trim() })
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.agencyId);
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: data.id ? "contact_updated" : "contact_created",
      newValues: { contactId, name: data.name, isPrimary },
      actorMembershipId: me.id,
    });
    return { id: contactId };
  });

export const setTravelAgentContactPrimary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, agencyId: idSchema, contactId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const contact = await db
      .from("guest_company_contacts")
      .select("id, name, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.agencyId)
      .eq("id", data.contactId)
      .maybeSingle();
    if (!contact.data) throw new Error("That contact person could not be found.");
    if (contact.data.status === "inactive") throw new Error("Activate the contact before setting them as primary.");
    await db
      .from("guest_company_contacts")
      .update({ is_primary: false })
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.agencyId)
      .eq("is_primary", true);
    const updated = await db.from("guest_company_contacts").update({ is_primary: true }).eq("id", data.contactId);
    if (updated.error) throw new Error(updated.error.message);
    await db
      .from("guest_account_masters")
      .update({ primary_contact_name: contact.data.name })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.agencyId);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "primary_contact_changed",
      newValues: { contactId: data.contactId, name: contact.data.name },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const createTravelAgentContactPhotoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        size: z.number().int().positive().max(8 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadTravelAgentMaster(admin(supabaseAdmin), data.restaurantId, data.agencyId);
    const ext = GUEST_IMAGE_EXT_BY_TYPE[data.contentType] ?? "jpg";
    const path = `${data.restaurantId}/travel-agents/${data.agencyId}/contacts/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage.from(ROOM_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not start the photo upload.");
    return { ok: true as const, path, token: signed.token };
  });

export { getCompanyContactCatalogues as getTravelAgentContactCatalogues };

export const listTravelAgentReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        q: z.string().max(120).optional(),
        status: z.string().max(40).optional(),
        from: z.string().max(20).optional(),
        to: z.string().max(20).optional(),
        roomTypeId: idSchema.optional(),
        ratePlanId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const access = guestStayAccessForRole(me.role);
    const rows = await loadTravelAgentReservations(db, data.restaurantId, data.agencyId);
    const rateIds = [...new Set(rows.map((row) => row.rate_plan_id).filter(Boolean))] as string[];
    const rateNames = new Map<string, string>();
    if (rateIds.length > 0) {
      const rates = await db.from("hotel_rate_plans").select("id, name").eq("restaurant_id", data.restaurantId).in("id", rateIds);
      for (const row of (rates.data ?? []) as Array<{ id: string; name: string }>) rateNames.set(row.id, row.name);
    }
    const commissions = await db
      .from("pms_agency_commission_entries")
      .select("reservation_id, amount, currency, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("agency_master_id", data.agencyId);
    const commissionByRes = new Map<string, { amount: number; currency: string; status: string }>();
    if (!unavailable(commissions.error)) {
      for (const row of (commissions.data ?? []) as Array<{
        reservation_id: string;
        amount: number;
        currency: string;
        status: string;
      }>) {
        commissionByRes.set(row.reservation_id, {
          amount: Number(row.amount),
          currency: row.currency,
          status: row.status,
        });
      }
    }
    const mapped = rows.map((row) => ({
      id: row.id,
      confirmationNumber: row.confirmation_number,
      guestId: row.guest_id ?? null,
      guestName:
        [row.guest_profiles?.first_name, row.guest_profiles?.last_name].filter(Boolean).join(" ").trim() || "Guest",
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
      status: row.status,
      roomLabel: row.room_types?.name?.trim() || "Reservation",
      roomTypeId: row.room_type_id ?? null,
      ratePlanId: row.rate_plan_id ?? null,
      ratePlanName: row.rate_plan_id ? rateNames.get(row.rate_plan_id) ?? null : null,
      source: row.source ?? null,
      nights: nightsBetween(row.arrival_date, row.departure_date),
      total: access.folio && row.room_subtotal != null ? Number(row.room_subtotal) : null,
      currency: row.currency ?? null,
      commission: access.folio ? commissionByRes.get(row.id) ?? null : null,
    }));
    const q = data.q?.trim().toLowerCase();
    const items = mapped.filter((row) => {
      if (q && ![row.confirmationNumber, row.guestName, row.roomLabel, row.ratePlanName].join(" ").toLowerCase().includes(q)) {
        return false;
      }
      if (data.status && data.status !== "all" && row.status !== data.status) return false;
      if (data.from && row.arrivalDate < data.from) return false;
      if (data.to && row.departureDate > data.to) return false;
      if (data.roomTypeId && row.roomTypeId !== data.roomTypeId) return false;
      if (data.ratePlanId && row.ratePlanId !== data.ratePlanId) return false;
      return true;
    });
    return {
      items,
      folioAccess: access.folio,
      kpis: travelAgentReservationKpis(mapped, propertyToday("UTC")),
      filters: {
        roomTypes: [...new Map(mapped.filter((row) => row.roomTypeId).map((row) => [row.roomTypeId, row.roomLabel])).entries()].map(
          ([id, name]) => ({ id: id!, name }),
        ),
        ratePlans: [...new Map(mapped.filter((row) => row.ratePlanId).map((row) => [row.ratePlanId, row.ratePlanName ?? "Rate"])).entries()].map(
          ([id, name]) => ({ id: id!, name }),
        ),
      },
    };
  });

export const addTravelAgentNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        note: z.string().trim().min(1).max(2000),
        category: z.enum(COMPANY_NOTE_CATEGORIES).optional(),
        visibility: z.enum(COMPANY_NOTE_VISIBILITIES).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const agency = await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const next = [agency.notes?.trim(), data.note.trim()].filter(Boolean).join("\n\n");
    const updated = await db
      .from("guest_account_masters")
      .update({ notes: next })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.agencyId);
    if (updated.error) throw new Error(updated.error.message);
    const noteId = crypto.randomUUID();
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "note_added",
      notes: data.note.trim(),
      newValues: {
        noteId,
        category: data.category ?? "general",
        visibility: data.visibility ?? "internal",
        archived: false,
      },
      actorMembershipId: me.id,
    });
    return { ok: true as const, noteId };
  });

export const listTravelAgentNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
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
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const history = await db
      .from("guest_account_history")
      .select("id, event_type, notes, new_values, actor_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.agencyId)
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
      archived: row.event_type === "note_archived" || row.new_values?.archived === true,
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

export const updateTravelAgentNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        noteId: z.string().uuid(),
        note: z.string().trim().min(1).max(2000),
        category: z.enum(COMPANY_NOTE_CATEGORIES).optional(),
        visibility: z.enum(COMPANY_NOTE_VISIBILITIES).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    await loadTravelAgentMaster(
      admin((await import("@/integrations/supabase/client.server")).supabaseAdmin),
      data.restaurantId,
      data.agencyId,
    );
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
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

export const archiveTravelAgentNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, agencyId: idSchema, noteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "note_archived",
      newValues: { noteId: data.noteId, archived: true },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

const DEFAULT_TA_DOC_TYPES = [
  { name: "Agency License", code: "AGENCY_LICENSE" },
  { name: "IATA Certificate", code: "IATA_CERT" },
  { name: "Business Registration", code: "BUSINESS_REG" },
  { name: "Tax Document", code: "TAX_DOCUMENT" },
  { name: "Contract", code: "CONTRACT" },
  { name: "Other", code: "OTHER" },
];

async function ensureTravelAgentDocumentTypes(db: { from: (table: string) => any }, restaurantId: string) {
  const existing = await db
    .from("pms_company_document_types")
    .select("id, name, code, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (existing.error && isMissingSchemaError(existing.error)) return [];
  if (existing.error) throw new Error(existing.error.message);
  const rows = (existing.data ?? []) as Array<{ id: string; name: string; code: string; active: boolean }>;
  const missing = DEFAULT_TA_DOC_TYPES.filter((type) => !rows.some((row) => row.code === type.code));
  if (missing.length === 0) return rows;
  const inserted = await db
    .from("pms_company_document_types")
    .insert(missing.map((type) => ({ restaurant_id: restaurantId, ...type })))
    .select("id, name, code, active");
  if (inserted.error) return rows;
  return [...rows, ...((inserted.data ?? []) as Array<{ id: string; name: string; code: string; active: boolean }>)];
}

export const listTravelAgentDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, agencyId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const types = await ensureTravelAgentDocumentTypes(db, data.restaurantId);
    const docs = await db
      .from("guest_company_documents")
      .select(
        "id, document_type_id, name, reference_number, issue_date, expiry_date, review_status, storage_path, reviewed_at, created_at",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.agencyId)
      .order("created_at", { ascending: false });
    if (docs.error && isMissingSchemaError(docs.error)) {
      return { types, items: [], kpis: travelAgentDocumentKpis([], propertyToday("UTC")), available: false };
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
      reviewed_at: string | null;
      created_at: string;
    }>).map((row) => {
      const status = travelAgentDocumentStatus({
        reviewStatus: row.review_status,
        expiryDate: row.expiry_date,
        today,
      });
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
    return { types, items, kpis: travelAgentDocumentKpis(items, today), available: true };
  });

export const createTravelAgentDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
        size: z.number().int().positive().max(12 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadTravelAgentMaster(admin(supabaseAdmin), data.restaurantId, data.agencyId);
    const ext = data.contentType === "application/pdf" ? "pdf" : (GUEST_IMAGE_EXT_BY_TYPE[data.contentType] ?? "jpg");
    const path = `${data.restaurantId}/travel-agents/${data.agencyId}/docs/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage.from(ROOM_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not start the document upload.");
    return { ok: true as const, path, token: signed.token };
  });

export const saveTravelAgentDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
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
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const types = await ensureTravelAgentDocumentTypes(db, data.restaurantId);
    const type = types.find((row) => row.id === data.typeId);
    if (!type) throw new Error("Select a configured document type.");
    const prefix = `${data.restaurantId}/travel-agents/${data.agencyId}/`;
    if (data.path && !data.path.startsWith(prefix)) throw new Error("That document path is not valid for this agency.");
    const payload = {
      restaurant_id: data.restaurantId,
      company_master_id: data.agencyId,
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
        .eq("company_master_id", data.agencyId);
      if (updated.error) throw new Error(updated.error.message);
      await recordGuestAccountEvent({
        restaurantId: data.restaurantId,
        masterId: data.agencyId,
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
      masterId: data.agencyId,
      eventType: "document_uploaded",
      newValues: { documentId: inserted.data.id },
      notes: data.name,
      actorMembershipId: me.id,
    });
    return { id: inserted.data.id as string };
  });

export const reviewTravelAgentDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
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
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
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
      .eq("company_master_id", data.agencyId);
    if (updated.error) throw new Error(updated.error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: data.reviewStatus === "verified" ? "document_verified" : "document_rejected",
      newValues: { documentId: data.documentId },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const deleteTravelAgentDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, agencyId: idSchema, documentId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadTravelAgentMaster(admin(supabaseAdmin), data.restaurantId, data.agencyId);
    const result = await admin(supabaseAdmin)
      .from("guest_company_documents")
      .delete()
      .eq("id", data.documentId)
      .eq("restaurant_id", data.restaurantId)
      .eq("company_master_id", data.agencyId);
    if (result.error) throw new Error(result.error.message);
    return { ok: true as const };
  });

export const listTravelAgentAgreements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        status: z.string().max(40).optional(),
        q: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const agency = await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const today = propertyToday("UTC");
    let agreements = await db
      .from("pms_corporate_agreements")
      .select(
        "id, code, name, contract_number, valid_from, valid_to, currency_code, description, active, signed_at, signed_by, file_storage_path",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("company_id", data.agencyId)
      .order("valid_from", { ascending: false });
    if (agreements.error && (agreements.error.code === "42703" || agreements.error.code === "PGRST204")) {
      agreements = await db
        .from("pms_corporate_agreements")
        .select("id, code, name, contract_number, valid_from, valid_to, currency_code, description, active")
        .eq("restaurant_id", data.restaurantId)
        .eq("company_id", data.agencyId)
        .order("valid_from", { ascending: false });
    }
    if (agreements.error && isMissingSchemaError(agreements.error)) {
      return { items: [], kpis: { total: 0, active: 0, expiring: 0, expired: 0 } };
    }
    if (agreements.error) throw new Error(agreements.error.message);
    if ((agreements.data ?? []).length === 0 && agency.contract_reference) {
      const seeded = await db
        .from("pms_corporate_agreements")
        .insert({
          restaurant_id: data.restaurantId,
          company_id: data.agencyId,
          code: `TA${(uuidFirstSegment(data.agencyId) ?? "AGMT").toUpperCase()}`.slice(0, 20),
          name: agency.contract_reference.slice(0, 120),
          contract_number: agency.contract_reference.slice(0, 40),
          valid_from: agency.contract_start_date || today,
          valid_to: agency.contract_end_date || today,
          currency_code: "ETB",
          description: agency.contract_signed_with ? `Signed with ${agency.contract_signed_with}` : null,
          active: agency.contract_status !== "expired",
          signed_by: agency.contract_signed_with,
        })
        .select(
          "id, code, name, contract_number, valid_from, valid_to, currency_code, description, active, signed_at, signed_by, file_storage_path",
        );
      if (!seeded.error) agreements = seeded;
    }
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
        signedAt: row.signed_at ? String(row.signed_at) : null,
        signedBy: row.signed_by ? String(row.signed_by) : null,
        fileStoragePath: row.file_storage_path ? String(row.file_storage_path) : null,
      };
    });
    const q = data.q?.trim().toLowerCase();
    const filtered = items.filter((row) => {
      if (data.status && data.status !== "all" && row.status !== data.status) return false;
      if (q && ![row.name, row.code, row.contractNumber].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    return {
      items: filtered,
      kpis: {
        total: items.length,
        active: items.filter((row) => row.status === "active").length,
        expiring: items.filter((row) => row.status === "expiring").length,
        expired: items.filter((row) => row.status === "expired").length,
      },
    };
  });

export const saveTravelAgentAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        id: idSchema.optional(),
        name: z.string().trim().min(1).max(120),
        contractNumber: z.string().trim().min(1).max(40),
        validFrom: z.string().min(8).max(20),
        validTo: z.string().min(8).max(20),
        currencyCode: z.string().regex(/^[A-Z]{3}$/),
        description: z.string().max(500).optional().nullable(),
        active: z.boolean().optional(),
        signedBy: z.string().max(120).optional().nullable(),
        signedAt: z.string().max(20).optional().nullable(),
        fileStoragePath: z.string().max(400).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const payload = {
      restaurant_id: data.restaurantId,
      company_id: data.agencyId,
      name: data.name.trim(),
      contract_number: data.contractNumber.trim(),
      valid_from: data.validFrom,
      valid_to: data.validTo,
      currency_code: data.currencyCode,
      description: blankToNull(data.description),
      active: data.active !== false,
      signed_by: blankToNull(data.signedBy),
      signed_at: blankToNull(data.signedAt),
      file_storage_path: blankToNull(data.fileStoragePath),
    };
    if (data.id) {
      const updated = await db
        .from("pms_corporate_agreements")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .eq("company_id", data.agencyId);
      if (updated.error) throw new Error(updated.error.message);
      await recordGuestAccountEvent({
        restaurantId: data.restaurantId,
        masterId: data.agencyId,
        eventType: "agreement_updated",
        newValues: { agreementId: data.id },
        actorMembershipId: me.id,
      });
      return { id: data.id };
    }
    const inserted = await db
      .from("pms_corporate_agreements")
      .insert({
        ...payload,
        code: `TA${(uuidFirstSegment(crypto.randomUUID()) ?? "AGMT").toUpperCase()}`.slice(0, 20),
      })
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "agreement_created",
      newValues: { agreementId: inserted.data.id },
      actorMembershipId: me.id,
    });
    return { id: inserted.data.id as string };
  });

export const expireTravelAgentAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, agencyId: idSchema, agreementId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const updated = await db
      .from("pms_corporate_agreements")
      .update({ active: false })
      .eq("id", data.agreementId)
      .eq("restaurant_id", data.restaurantId)
      .eq("company_id", data.agencyId);
    if (updated.error) throw new Error(updated.error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "agreement_updated",
      newValues: { agreementId: data.agreementId, active: false },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const listTravelAgentBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        status: z.string().max(40).optional(),
        q: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const agency = await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const access = guestStayAccessForRole(me.role);
    const moneyAvailable = access.folio;
    const reservations = await loadTravelAgentReservations(db, data.restaurantId, data.agencyId);
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
        .select("id, folio_number, status, reservation_id")
        .eq("restaurant_id", data.restaurantId)
        .in("reservation_id", reservationIds);
      const folioRows = (folios.data ?? []) as Array<{
        id: string;
        folio_number: string;
        status: string;
        reservation_id: string | null;
      }>;
      const reservationById = new Map(reservations.map((row) => [row.id, row]));
      if (folioRows.length > 0) {
        const txns = await db
          .from("folio_transactions")
          .select("id, folio_id, description, amount, posted_at, transaction_type")
          .eq("restaurant_id", data.restaurantId)
          .in("folio_id", folioRows.map((row) => row.id))
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
              ? [reservation.guest_profiles?.first_name, reservation.guest_profiles?.last_name].filter(Boolean).join(" ").trim() ||
                "Guest"
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
    const totals = travelAgentBillingTotals(
      transactions.map((row) => ({ amount: row.debit - row.credit, folioStatus: row.status })),
    );
    const commissions = await db
      .from("pms_agency_commission_entries")
      .select("amount, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("agency_master_id", data.agencyId);
    const commissionTotals = unavailable(commissions.error)
      ? { earned: 0, approved: 0, settled: 0, outstanding: 0 }
      : commissionEntryTotals((commissions.data ?? []) as Array<{ amount: number; status: string }>);
    return {
      summary: {
        accountStatus: agency.account_status,
        paymentTerms: agency.payment_terms,
        creditLimitNote: agency.credit_limit_note,
        creditLimitAmount: agency.credit_limit_amount == null ? null : Number(agency.credit_limit_amount),
        billingInstruction: agency.billing_instruction,
        billingContact: agency.billing_contact_name || agency.primary_contact_name,
        moneyAvailable,
        commission: moneyAvailable ? commissionTotals : null,
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

export const updateTravelAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        code: z.string().max(40).optional().nullable(),
        agencyType: z.enum(AGENCY_TYPES).optional().nullable(),
        agencyTypeOther: z.string().max(80).optional().nullable(),
        accountStatus: z.enum(GUEST_ACCOUNT_STATUSES).optional(),
        primaryContactName: z.string().max(120).optional().nullable(),
        email: z.string().max(200).optional().nullable(),
        phone: z.string().max(60).optional().nullable(),
        website: z.string().max(200).optional().nullable(),
        addressLine1: z.string().max(200).optional().nullable(),
        addressLine2: z.string().max(200).optional().nullable(),
        city: z.string().max(80).optional().nullable(),
        region: z.string().max(80).optional().nullable(),
        country: z.string().max(80).optional().nullable(),
        postalCode: z.string().max(20).optional().nullable(),
        notes: z.string().max(4000).optional().nullable(),
        preferredCurrency: z.string().regex(/^[A-Z]{3}$/).optional().nullable(),
        marketSegmentId: idSchema.optional().nullable(),
        bookingAccess: z.enum(TA_BOOKING_ACCESS).optional(),
        maxAdvanceBookingDays: z.number().int().min(0).max(3650).optional().nullable(),
        minStayNights: z.number().int().min(1).max(365).optional().nullable(),
        maxStayNights: z.number().int().min(1).max(365).optional().nullable(),
        groupBookingsAllowed: z.boolean().optional(),
        paymentTerms: z.string().max(120).optional().nullable(),
        billingInstruction: z.string().max(4000).optional().nullable(),
        creditLimitNote: z.string().max(200).optional().nullable(),
        creditLimitAmount: z.number().min(0).max(1_000_000_000).optional().nullable(),
        allowedRoomTypeIds: z.array(idSchema).max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const email = normalizeEmail(data.email);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
    const payload = {
      code: blankToNull(data.code),
      agency_type: blankToNull(data.agencyType),
      agency_type_other: data.agencyType === "other" ? blankToNull(data.agencyTypeOther) : null,
      account_status: data.accountStatus,
      primary_contact_name: blankToNull(data.primaryContactName),
      email,
      phone: blankToNull(data.phone),
      website: blankToNull(data.website),
      address_line1: blankToNull(data.addressLine1),
      address_line2: blankToNull(data.addressLine2),
      city: blankToNull(data.city),
      region: blankToNull(data.region),
      country: blankToNull(data.country),
      postal_code: blankToNull(data.postalCode),
      notes: blankToNull(data.notes),
      preferred_currency: blankToNull(data.preferredCurrency),
      market_segment_id: data.marketSegmentId || null,
      booking_access: data.bookingAccess,
      max_advance_booking_days: data.maxAdvanceBookingDays ?? null,
      min_stay_nights: data.minStayNights ?? null,
      max_stay_nights: data.maxStayNights ?? null,
      group_bookings_allowed: data.groupBookingsAllowed,
      payment_terms: blankToNull(data.paymentTerms),
      billing_instruction: blankToNull(data.billingInstruction),
      credit_limit_note: blankToNull(data.creditLimitNote),
      credit_limit_amount: data.creditLimitAmount ?? null,
    };
    const cleaned = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
    const updated = await db
      .from("guest_account_masters")
      .update(cleaned)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.agencyId)
      .eq("account_type", "travel_agent");
    if (updated.error && (updated.error.code === "42703" || updated.error.code === "PGRST204")) {
      const fallback = { ...cleaned };
      delete fallback.preferred_currency;
      delete fallback.market_segment_id;
      delete fallback.booking_access;
      delete fallback.max_advance_booking_days;
      delete fallback.min_stay_nights;
      delete fallback.max_stay_nights;
      delete fallback.group_bookings_allowed;
      delete fallback.credit_limit_amount;
      const retry = await db
        .from("guest_account_masters")
        .update(fallback)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.agencyId);
      if (retry.error) throw new Error(retry.error.message);
    } else if (updated.error) {
      throw new Error(updated.error.message);
    }
    if (data.allowedRoomTypeIds) {
      await db
        .from("pms_agency_allowed_room_types")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("agency_master_id", data.agencyId);
      if (data.allowedRoomTypeIds.length > 0) {
        await db.from("pms_agency_allowed_room_types").insert(
          data.allowedRoomTypeIds.map((roomTypeId) => ({
            restaurant_id: data.restaurantId,
            agency_master_id: data.agencyId,
            room_type_id: roomTypeId,
          })),
        );
      }
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "settings_changed",
      newValues: { keys: Object.keys(cleaned) },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const listTravelAgentSettingsCatalogues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, agencyId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const segments = await db
      .from("pms_market_segments")
      .select("id, name, code, active")
      .eq("restaurant_id", data.restaurantId)
      .order("name");
    const rooms = await db
      .from("room_types")
      .select("id, name")
      .eq("restaurant_id", data.restaurantId)
      .order("name");
    const allowed = await db
      .from("pms_agency_allowed_room_types")
      .select("room_type_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("agency_master_id", data.agencyId);
    return {
      marketSegments: unavailable(segments.error)
        ? []
        : ((segments.data ?? []) as Array<{ id: string; name: string; code: string; active: boolean }>),
      roomTypes: unavailable(rooms.error)
        ? []
        : ((rooms.data ?? []) as Array<{ id: string; name: string }>),
      allowedRoomTypeIds: unavailable(allowed.error)
        ? []
        : ((allowed.data ?? []) as Array<{ room_type_id: string }>).map((row) => row.room_type_id),
    };
  });

export const listTravelAgentCommissionPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, agencyId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const plans = await db
      .from("pms_agency_commission_plans")
      .select("id, commission_type, rate_value, currency, effective_on, expires_on, agreement_id, active, notes")
      .eq("restaurant_id", data.restaurantId)
      .eq("agency_master_id", data.agencyId)
      .order("effective_on", { ascending: false });
    if (unavailable(plans.error)) return { items: [], available: false };
    if (plans.error) throw new Error(plans.error.message);
    return {
      available: true,
      items: ((plans.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        commissionType: String(row.commission_type),
        rateValue: Number(row.rate_value),
        currency: String(row.currency),
        effectiveOn: String(row.effective_on),
        expiresOn: row.expires_on ? String(row.expires_on) : null,
        agreementId: row.agreement_id ? String(row.agreement_id) : null,
        active: row.active !== false,
        notes: row.notes ? String(row.notes) : null,
      })),
    };
  });

export const saveTravelAgentCommissionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        id: idSchema.optional(),
        commissionType: z.enum(TA_COMMISSION_PLAN_TYPES),
        rateValue: z.number().min(0).max(1000000),
        currency: z.string().regex(/^[A-Z]{3}$/),
        effectiveOn: z.string().min(8).max(20),
        expiresOn: z.string().max(20).optional().nullable(),
        agreementId: idSchema.optional().nullable(),
        active: z.boolean().optional(),
        notes: z.string().max(400).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const payload = {
      restaurant_id: data.restaurantId,
      agency_master_id: data.agencyId,
      commission_type: data.commissionType,
      rate_value: data.rateValue,
      currency: data.currency,
      effective_on: data.effectiveOn,
      expires_on: blankToNull(data.expiresOn),
      agreement_id: data.agreementId || null,
      active: data.active !== false,
      notes: blankToNull(data.notes),
    };
    if (data.id) {
      const updated = await db
        .from("pms_agency_commission_plans")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .eq("agency_master_id", data.agencyId);
      if (updated.error) throw new Error(updated.error.message);
    } else {
      const inserted = await db.from("pms_agency_commission_plans").insert(payload).select("id").single();
      if (inserted.error) throw new Error(inserted.error.message);
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "commission_configured",
      newValues: { type: data.commissionType, rateValue: data.rateValue },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const listTravelAgentCommissionEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        status: z.string().max(40).optional(),
        from: z.string().max(20).optional(),
        to: z.string().max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const access = guestStayAccessForRole(me.role);
    const entries = await db
      .from("pms_agency_commission_entries")
      .select("id, reservation_id, plan_id, basis_amount, amount, currency, status, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("agency_master_id", data.agencyId)
      .order("created_at", { ascending: false });
    if (unavailable(entries.error)) {
      return { items: [], totals: commissionEntryTotals([]), folioAccess: access.folio, available: false };
    }
    if (entries.error) throw new Error(entries.error.message);
    const rows = (entries.data ?? []) as Array<{
      id: string;
      reservation_id: string;
      plan_id: string | null;
      basis_amount: number;
      amount: number;
      currency: string;
      status: string;
      created_at: string;
    }>;
    const reservationIds = [...new Set(rows.map((row) => row.reservation_id))];
    const reservations = reservationIds.length
      ? await db
          .from("hotel_reservations")
          .select("id, confirmation_number, guest_id, arrival_date, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )")
          .eq("restaurant_id", data.restaurantId)
          .in("id", reservationIds)
      : { data: [], error: null };
    const reservationById = new Map(
      ((reservations.data ?? []) as Array<{
        id: string;
        confirmation_number: string;
        guest_id: string | null;
        arrival_date: string;
        guest_profiles?: { first_name: string | null; last_name: string | null } | null;
      }>).map((row) => [row.id, row]),
    );
    const items = rows
      .filter((row) => {
        if (data.status && data.status !== "all" && row.status !== data.status) return false;
        if (data.from && row.created_at.slice(0, 10) < data.from) return false;
        if (data.to && row.created_at.slice(0, 10) > data.to) return false;
        return true;
      })
      .map((row) => {
        const reservation = reservationById.get(row.reservation_id);
        return {
          id: row.id,
          reservationId: row.reservation_id,
          confirmationNumber: reservation?.confirmation_number ?? row.reservation_id,
          guestId: reservation?.guest_id ?? null,
          guestName: reservation
            ? [reservation.guest_profiles?.first_name, reservation.guest_profiles?.last_name].filter(Boolean).join(" ").trim() ||
              "Guest"
            : "Guest",
          arrivalDate: reservation?.arrival_date ?? null,
          basisAmount: access.folio ? Number(row.basis_amount) : null,
          amount: access.folio ? Number(row.amount) : null,
          currency: row.currency,
          status: row.status,
          createdAt: row.created_at,
        };
      });
    return {
      items,
      totals: access.folio ? commissionEntryTotals(rows) : commissionEntryTotals([]),
      folioAccess: access.folio,
      available: true,
      canSettle: me.role === "owner" || me.role === "manager",
    };
  });

export const updateTravelAgentCommissionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        entryId: idSchema,
        status: z.enum(TA_COMMISSION_ENTRY_STATUSES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.status === "settled") {
      await requireCashieringAccess(context as never, data.restaurantId);
    } else {
      await requireGuestManager(context as never, data.restaurantId);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const updated = await db
      .from("pms_agency_commission_entries")
      .update({ status: data.status })
      .eq("id", data.entryId)
      .eq("restaurant_id", data.restaurantId)
      .eq("agency_master_id", data.agencyId);
    if (updated.error) throw new Error(updated.error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "commission_updated",
      newValues: { entryId: data.entryId, status: data.status },
      actorMembershipId: null,
    });
    return { ok: true as const };
  });

export const listTravelAgentAllotments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, agencyId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const rows = await db
      .from("pms_agency_allotments")
      .select("id, room_type_id, allocated_qty, start_date, end_date, release_days, status, notes")
      .eq("restaurant_id", data.restaurantId)
      .eq("agency_master_id", data.agencyId)
      .order("start_date", { ascending: false });
    if (unavailable(rows.error)) return { items: [], available: false };
    if (rows.error) throw new Error(rows.error.message);
    const typeIds = [...new Set(((rows.data ?? []) as Array<{ room_type_id: string }>).map((row) => row.room_type_id))];
    const types = typeIds.length
      ? await db.from("room_types").select("id, name").eq("restaurant_id", data.restaurantId).in("id", typeIds)
      : { data: [] };
    const names = new Map(((types.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
    return {
      available: true,
      items: ((rows.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        roomTypeId: String(row.room_type_id),
        roomTypeName: names.get(String(row.room_type_id)) ?? "Room type",
        allocatedQty: Number(row.allocated_qty),
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        releaseDays: Number(row.release_days ?? 0),
        status: String(row.status),
        notes: row.notes ? String(row.notes) : null,
      })),
    };
  });

export const saveTravelAgentAllotment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        id: idSchema.optional(),
        roomTypeId: idSchema,
        allocatedQty: z.number().int().min(0).max(5000),
        startDate: z.string().min(8).max(20),
        endDate: z.string().min(8).max(20),
        releaseDays: z.number().int().min(0).max(365).optional(),
        status: z.enum(TA_ALLOTMENT_STATUSES).optional(),
        notes: z.string().max(400).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const payload = {
      restaurant_id: data.restaurantId,
      agency_master_id: data.agencyId,
      room_type_id: data.roomTypeId,
      allocated_qty: data.allocatedQty,
      start_date: data.startDate,
      end_date: data.endDate,
      release_days: data.releaseDays ?? 0,
      status: data.status ?? "active",
      notes: blankToNull(data.notes),
    };
    if (data.id) {
      const updated = await db
        .from("pms_agency_allotments")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .eq("agency_master_id", data.agencyId);
      if (updated.error) throw new Error(updated.error.message);
    } else {
      const inserted = await db.from("pms_agency_allotments").insert(payload);
      if (inserted.error) throw new Error(inserted.error.message);
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "allotment_changed",
      newValues: { roomTypeId: data.roomTypeId, allocatedQty: data.allocatedQty },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const listTravelAgentNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, agencyId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    const prefs = await db
      .from("pms_agency_notification_prefs")
      .select("event_key, channel, enabled")
      .eq("restaurant_id", data.restaurantId)
      .eq("agency_master_id", data.agencyId);
    if (unavailable(prefs.error)) return { items: [], available: false };
    if (prefs.error) throw new Error(prefs.error.message);
    const byKey = new Map(
      ((prefs.data ?? []) as Array<{ event_key: string; enabled: boolean }>).map((row) => [row.event_key, row.enabled]),
    );
    return {
      available: true,
      items: TA_NOTIFICATION_EVENTS.map((eventKey) => ({
        eventKey,
        channel: "email" as const,
        enabled: Boolean(byKey.get(eventKey)),
      })),
    };
  });

export const saveTravelAgentNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        items: z.array(
          z.object({
            eventKey: z.enum(TA_NOTIFICATION_EVENTS),
            enabled: z.boolean(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadTravelAgentMaster(db, data.restaurantId, data.agencyId);
    for (const item of data.items) {
      const upserted = await db.from("pms_agency_notification_prefs").upsert({
        restaurant_id: data.restaurantId,
        agency_master_id: data.agencyId,
        event_key: item.eventKey,
        channel: "email",
        enabled: item.enabled,
      });
      if (upserted.error) throw new Error(upserted.error.message);
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.agencyId,
      eventType: "settings_changed",
      newValues: { notifications: data.items },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export async function notifyTravelAgentBookingEvent(options: {
  restaurantId: string;
  agencyId: string;
  eventKey: (typeof TA_NOTIFICATION_EVENTS)[number];
  body: string;
}): Promise<{ sent: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const pref = await admin(supabaseAdmin)
    .from("pms_agency_notification_prefs")
    .select("enabled")
    .eq("restaurant_id", options.restaurantId)
    .eq("agency_master_id", options.agencyId)
    .eq("event_key", options.eventKey)
    .eq("channel", "email")
    .maybeSingle();
  if (unavailable(pref.error) || !pref.data?.enabled) return { sent: false };
  try {
    await sendGuestAccountMessage({
      data: {
        restaurantId: options.restaurantId,
        accountId: options.agencyId,
        body: options.body,
      },
    });
    return { sent: true };
  } catch {
    return { sent: false };
  }
}
