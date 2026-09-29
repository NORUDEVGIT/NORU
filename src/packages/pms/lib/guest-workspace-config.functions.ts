/**
 * Read-only Guest Profile operational configuration adapter.
 * Phase 1 Foundation
 *
 * Consolidates Card 4 Property Setup configuration into an authoritative read model
 * consumed by the Guest Profile workspace.
 * Writes remain owned by Property Setup.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireGuestManager } from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  PROFILE_TYPE_CREATE_BLOCKED,
  listingCreateAllowed,
  listingSectionFromCard4Code,
  type GuestListingSectionId,
  type ListingTypeConfigSnapshot,
} from "./guest-profile-listing";
import {
  GUEST_WORKSPACE_SECTIONS,
  domainFromCard4Code,
  type SupportedGuestProfileDomain,
} from "./guest-profile-domains";
import { normalizeFieldOptions } from "./guest-field-rules";

const idSchema = z.string().uuid();

export type GuestWorkspaceTypeConfig = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  icon: string;
  active: boolean;
  section: GuestListingSectionId | null;
  domain: SupportedGuestProfileDomain | null;
  requiredFieldIds: string[];
  documentTypeIds: string[];
  preferenceTypeIds: string[];
  defaults?: {
    countryId: string | null;
    languageId: string | null;
    currencyId: string | null;
    communicationChannelId: string | null;
    guestTypeId: string | null;
  };
  updatedAt?: string;
};

export type GuestWorkspaceRequiredFieldConfig = {
  id: string;
  name: string;
  code: string;
  fieldType: string;
  description: string | null;
  required: boolean;
  checkIn: boolean;
  reservation: boolean;
  active: boolean;
  displayOrder: number;
  options: Array<{ id: string; label: string; value: string; active?: boolean }>;
  documentTypeIds: string[];
  updatedAt?: string;
};

export type GuestWorkspaceIdentityDocTypeConfig = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  issuingCountryRequired: boolean;
  expiryDateRequired: boolean;
  documentNumberRequired: boolean;
  scanImageAllowed: boolean;
  requiredAtCheckIn: boolean;
  active: boolean;
  validForProfileTypeIds: string[];
  displayOrder: number;
  updatedAt?: string;
};

export type GuestWorkspacePreferenceTypeConfig = {
  id: string;
  categoryId: string;
  name: string;
  code: string;
  valueType: string;
  options: Array<{ id: string; label: string; value: string; active: boolean }>;
  required: boolean;
  active: boolean;
  displayOrder: number;
  updatedAt?: string;
};

export type GuestWorkspacePreferenceCategoryConfig = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  displayOrder: number;
  types: GuestWorkspacePreferenceTypeConfig[];
  updatedAt?: string;
};

export type GuestWorkspacePreferenceOptionConfig = {
  id: string;
  category: string;
  code: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type GuestWorkspaceBusinessTypeConfig = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  requiredFieldIds: string[];
  creditAccountAllowed: boolean;
  taxIdRequired: boolean;
  contactRequired: boolean;
  updatedAt?: string;
};

export type GuestWorkspaceCompanyBusinessConfig = {
  types: GuestWorkspaceBusinessTypeConfig[];
  settings: {
    enabled: boolean;
    defaultBusinessTypeId: string | null;
    autoApproval: boolean;
  } | null;
};

export type GuestWorkspaceGroupTypeConfig = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  updatedAt?: string;
};

export type GuestWorkspaceCommunicationConfig = {
  channels: Array<{
    id: string;
    channelType: string;
    provider: string;
    senderName: string;
    active: boolean;
  }>;
  defaults: {
    defaultGuestChannelId: string | null;
    defaultInternalChannelId: string | null;
    defaultMarketingChannelId: string | null;
    defaultLanguage: string;
    timezone: string;
    dateFormat: string;
    timeFormat: string;
    replyToEmail: string | null;
    guestNotificationsEnabled: boolean;
    currencyCode: string;
  } | null;
};

export type GuestWorkspaceConfig = {
  available: boolean;
  lastUpdatedAt: string | null;
  types: GuestWorkspaceTypeConfig[];
  requiredFields: GuestWorkspaceRequiredFieldConfig[];
  identityDocumentTypes: GuestWorkspaceIdentityDocTypeConfig[];
  preferenceCategories: GuestWorkspacePreferenceCategoryConfig[];
  preferenceOptions: GuestWorkspacePreferenceOptionConfig[];
  companyBusiness: GuestWorkspaceCompanyBusinessConfig;
  groupTypes: GuestWorkspaceGroupTypeConfig[];
  communication: GuestWorkspaceCommunicationConfig;
};

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    isMissingSchemaError(error) ||
    error.code === "42P01" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  );
}

export async function loadGuestWorkspaceConfig(
  restaurantId: string,
): Promise<GuestWorkspaceConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [
    typesRes,
    fieldsRes,
    idDocsRes,
    prefCatsRes,
    prefTypesRes,
    prefOptsRes,
    bizTypesRes,
    bizSettingsRes,
    groupTypesRes,
    commsChannelsRes,
    commsDefaultsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("pms_guest_profile_types")
      .select(
        "id, name, code, description, icon, active, required_field_ids, document_type_ids, preference_type_ids, defaults, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("name"),
    supabaseAdmin
      .from("pms_guest_fields")
      .select(
        "id, name, code, field_type, description, options, required, check_in, reservation, active, display_order, document_type_ids, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("display_order"),
    supabaseAdmin
      .from("pms_guest_id_types")
      .select(
        "id, name, code, description, issuing_country_required, expiry_date_required, document_number_required, scan_image_allowed, required_at_check_in, active, valid_for_profile_type_ids, display_order, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("display_order"),
    supabaseAdmin
      .from("pms_guest_preference_categories")
      .select("id, name, code, description, active, display_order, updated_at")
      .eq("restaurant_id", restaurantId)
      .order("display_order"),
    supabaseAdmin
      .from("pms_guest_preference_types")
      .select(
        "id, category_id, name, code, value_type, options, required, active, display_order, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("display_order"),
    supabaseAdmin
      .from("pms_preference_options")
      .select("id, category, code, name, active, sort_order")
      .eq("restaurant_id", restaurantId)
      .order("category")
      .order("sort_order"),
    supabaseAdmin
      .from("pms_business_profile_types")
      .select(
        "id, name, code, description, active, required_field_ids, credit_account_allowed, tax_id_required, contact_required, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("name"),
    supabaseAdmin
      .from("pms_business_profile_settings")
      .select("enabled, default_business_type_id, auto_approval")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    supabaseAdmin
      .from("pms_group_types")
      .select("id, name, code, description, active, sort_order, updated_at")
      .eq("restaurant_id", restaurantId)
      .order("sort_order"),
    supabaseAdmin
      .from("pms_communication_channels")
      .select("id, channel_type, provider, sender_name, active")
      .eq("restaurant_id", restaurantId)
      .order("channel_type"),
    supabaseAdmin
      .from("pms_communication_defaults")
      .select(
        "default_guest_channel_id, default_internal_channel_id, default_marketing_channel_id, default_language, timezone, date_format, time_format, reply_to_email, guest_notifications_enabled, currency_code",
      )
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  if (typesRes.error && isMissingTable(typesRes.error)) {
    return {
      available: false,
      lastUpdatedAt: null,
      types: [],
      requiredFields: [],
      identityDocumentTypes: [],
      preferenceCategories: [],
      preferenceOptions: [],
      companyBusiness: { types: [], settings: null },
      groupTypes: [],
      communication: { channels: [], defaults: null },
    };
  }

  if (typesRes.error) throw new Error(typesRes.error.message);

  const rawTypes = (typesRes.data ?? []) as Array<{
    id: string;
    name: string;
    code: string;
    description: string | null;
    icon: string;
    active: boolean;
    required_field_ids: string[] | null;
    document_type_ids: string[] | null;
    preference_type_ids: string[] | null;
    defaults: unknown;
    updated_at: string;
  }>;

  const types: GuestWorkspaceTypeConfig[] = rawTypes.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? null,
    icon: row.icon || "user",
    active: row.active,
    section: listingSectionFromCard4Code(row.code),
    domain: domainFromCard4Code(row.code),
    requiredFieldIds: row.required_field_ids ?? [],
    documentTypeIds: row.document_type_ids ?? [],
    preferenceTypeIds: row.preference_type_ids ?? [],
    defaults: (row.defaults as GuestWorkspaceTypeConfig["defaults"]) ?? undefined,
    updatedAt: row.updated_at,
  }));

  const requiredFields: GuestWorkspaceRequiredFieldConfig[] = (fieldsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    fieldType: row.field_type ?? "text",
    description: row.description ?? null,
    required: Boolean(row.required),
    checkIn: Boolean(row.check_in),
    reservation: Boolean(row.reservation),
    active: Boolean(row.active),
    displayOrder: Number(row.display_order ?? 0),
    options: normalizeFieldOptions(row.options),
    documentTypeIds: Array.isArray(row.document_type_ids)
      ? (row.document_type_ids as string[])
      : [],
    updatedAt: row.updated_at,
  }));

  const identityDocumentTypes: GuestWorkspaceIdentityDocTypeConfig[] = (idDocsRes.data ?? []).map(
    (row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description ?? null,
      issuingCountryRequired: Boolean(row.issuing_country_required),
      expiryDateRequired: Boolean(row.expiry_date_required),
      documentNumberRequired: Boolean(row.document_number_required),
      scanImageAllowed: Boolean(row.scan_image_allowed),
      requiredAtCheckIn: Boolean(row.required_at_check_in),
      active: Boolean(row.active),
      validForProfileTypeIds: Array.isArray(row.valid_for_profile_type_ids)
        ? (row.valid_for_profile_type_ids as string[])
        : [],
      displayOrder: Number(row.display_order ?? 0),
      updatedAt: row.updated_at,
    }),
  );

  const rawPrefTypes = prefTypesRes.data ?? [];
  const preferenceCategories: GuestWorkspacePreferenceCategoryConfig[] = (
    prefCatsRes.data ?? []
  ).map((cat) => {
    const matchingTypes = rawPrefTypes
      .filter((t) => t.category_id === cat.id)
      .map((t) => ({
        id: t.id,
        categoryId: t.category_id,
        name: t.name,
        code: t.code,
        valueType: t.value_type ?? "single_select",
        options: Array.isArray(t.options) ? t.options : [],
        required: Boolean(t.required),
        active: Boolean(t.active),
        displayOrder: Number(t.display_order ?? 0),
        updatedAt: t.updated_at,
      }));

    return {
      id: cat.id,
      name: cat.name,
      code: cat.code,
      description: cat.description ?? null,
      active: Boolean(cat.active),
      displayOrder: Number(cat.display_order ?? 0),
      types: matchingTypes,
      updatedAt: cat.updated_at,
    };
  });

  const preferenceOptions: GuestWorkspacePreferenceOptionConfig[] = (prefOptsRes.data ?? []).map(
    (row) => ({
      id: row.id,
      category: row.category,
      code: row.code,
      name: row.name,
      active: Boolean(row.active),
      sortOrder: Number(row.sort_order ?? 0),
    }),
  );

  const businessTypes: GuestWorkspaceBusinessTypeConfig[] = (bizTypesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? null,
    active: Boolean(row.active),
    requiredFieldIds: Array.isArray(row.required_field_ids) ? row.required_field_ids : [],
    creditAccountAllowed: Boolean(row.credit_account_allowed),
    taxIdRequired: Boolean(row.tax_id_required),
    contactRequired: Boolean(row.contact_required),
    updatedAt: row.updated_at,
  }));

  const companyBusiness: GuestWorkspaceCompanyBusinessConfig = {
    types: businessTypes,
    settings: bizSettingsRes.data
      ? {
          enabled: Boolean(bizSettingsRes.data.enabled),
          defaultBusinessTypeId: bizSettingsRes.data.default_business_type_id ?? null,
          autoApproval: Boolean(bizSettingsRes.data.auto_approval),
        }
      : null,
  };

  const groupTypes: GuestWorkspaceGroupTypeConfig[] = (groupTypesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? null,
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order ?? 0),
    updatedAt: row.updated_at,
  }));

  const communicationChannels = (commsChannelsRes.data ?? []).map((row) => ({
    id: row.id,
    channelType: row.channel_type,
    provider: row.provider,
    senderName: row.sender_name,
    active: Boolean(row.active),
  }));

  const communicationDefaults = commsDefaultsRes.data
    ? {
        defaultGuestChannelId: commsDefaultsRes.data.default_guest_channel_id ?? null,
        defaultInternalChannelId: commsDefaultsRes.data.default_internal_channel_id ?? null,
        defaultMarketingChannelId: commsDefaultsRes.data.default_marketing_channel_id ?? null,
        defaultLanguage: commsDefaultsRes.data.default_language ?? "en",
        timezone: commsDefaultsRes.data.timezone ?? "UTC",
        dateFormat: commsDefaultsRes.data.date_format ?? "YYYY-MM-DD",
        timeFormat: commsDefaultsRes.data.time_format ?? "24h",
        replyToEmail: commsDefaultsRes.data.reply_to_email ?? null,
        guestNotificationsEnabled: Boolean(commsDefaultsRes.data.guest_notifications_enabled),
        currencyCode: commsDefaultsRes.data.currency_code ?? "USD",
      }
    : null;

  const timestamps = [
    ...types.map((t) => t.updatedAt),
    ...requiredFields.map((f) => f.updatedAt),
    ...identityDocumentTypes.map((d) => d.updatedAt),
    ...preferenceCategories.map((c) => c.updatedAt),
    ...businessTypes.map((b) => b.updatedAt),
    ...groupTypes.map((g) => g.updatedAt),
  ].filter(Boolean) as string[];

  const lastUpdatedAt = timestamps.length > 0 ? timestamps.sort().reverse()[0] : null;

  return {
    available: true,
    lastUpdatedAt,
    types,
    requiredFields,
    identityDocumentTypes,
    preferenceCategories,
    preferenceOptions,
    companyBusiness,
    groupTypes,
    communication: {
      channels: communicationChannels,
      defaults: communicationDefaults,
    },
  };
}

export function isDomainCreateAllowed(
  a: SupportedGuestProfileDomain | GuestWorkspaceConfig,
  b: SupportedGuestProfileDomain | GuestWorkspaceConfig,
): boolean {
  const domain = (typeof a === "string" ? a : b) as SupportedGuestProfileDomain;
  const config = (typeof a === "object" ? a : b) as GuestWorkspaceConfig;
  if (!config || config.available === false) return true;
  const match = config.types?.find((t) => t.domain === domain);
  if (!match) return true;
  return match.active;
}

export function assertDomainCreateAllowed(
  config: GuestWorkspaceConfig,
  domain: SupportedGuestProfileDomain,
): void {
  if (!isDomainCreateAllowed(domain, config)) {
    const section = GUEST_WORKSPACE_SECTIONS.find((s) => s.domain === domain);
    const title = section?.title
      ? section.title.endsWith("ies")
        ? section.title.slice(0, -3) + "y"
        : section.title.replace(/s$/, "")
      : domain;
    throw new Error(`${title} profiles are inactive in Property Setup.`);
  }
}

export async function assertListingCreateAllowed(
  restaurantId: string,
  section: GuestListingSectionId,
): Promise<void> {
  const config: ListingTypeConfigSnapshot = await loadGuestWorkspaceConfig(restaurantId);
  if (!listingCreateAllowed(section, config)) {
    throw new Error(PROFILE_TYPE_CREATE_BLOCKED);
  }
}

export const getGuestWorkspaceConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GuestWorkspaceConfig> => {
    await requireGuestManager(context as never, data.restaurantId);
    return loadGuestWorkspaceConfig(data.restaurantId);
  });
