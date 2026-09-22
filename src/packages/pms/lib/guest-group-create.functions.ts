/**
 * Register New Group workflow APIs.
 * Group rows stay on guest_account_masters. Catalogues stay in PMS settings.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMissingSchemaError } from "./pms-set2-structure";
import { requireGuestManager } from "./guests.server";
import {
  parseGuestGroupCreateHold,
  draftToGroupOperations,
  filled,
  type GuestGroupCreateDraft,
  type GuestGroupCreateMemberDraft,
  type GuestGroupCreateStepId,
  type GroupCreateCatalogueOption,
} from "./guest-group-create-workspace";
import { addGroupMember, createGroupMemberGuest, saveGroupMaster } from "./guest-group-detail.functions";
import { loadGroupTypes } from "./guest-group-types";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

export type GroupCreateContext = {
  catalogues: {
    groupTypes: GroupCreateCatalogueOption[];
    marketSegments: GroupCreateCatalogueOption[];
    sourceCodes: GroupCreateCatalogueOption[];
    roomTypes: GroupCreateCatalogueOption[];
    ratePlans: GroupCreateCatalogueOption[];
    mealPlans: GroupCreateCatalogueOption[];
    packages: GroupCreateCatalogueOption[];
    paymentMethods: GroupCreateCatalogueOption[];
    channels: GroupCreateCatalogueOption[];
    currencies: string[];
  };
  defaultCurrency: string;
  draft: { id: string; payload: GuestGroupCreateDraft; step: GuestGroupCreateStepId } | null;
};

function mapOption(row: Record<string, unknown>): GroupCreateCatalogueOption {
  return {
    id: String(row.id),
    name: String(row.name ?? row.code ?? ""),
    code: row.code == null ? null : String(row.code),
    active: row.active == null ? true : Boolean(row.active),
  };
}

async function loadOptionalOptions(
  db: { from: (table: string) => any },
  table: string,
  restaurantId: string,
  columns = "id, name, code, active",
): Promise<GroupCreateCatalogueOption[]> {
  const result = await db.from(table).select(columns).eq("restaurant_id", restaurantId).order("name");
  if (result.error && (isMissingSchemaError(result.error) || result.error.code === "42P01")) return [];
  if (result.error) return [];
  return ((result.data ?? []) as Array<Record<string, unknown>>).map(mapOption);
}

export const getGroupCreateContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GroupCreateContext> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const [
      groupTypes,
      marketSegments,
      sourceCodes,
      roomTypes,
      ratePlans,
      mealPlans,
      packages,
      paymentMethods,
      channels,
      restaurant,
      draft,
    ] = await Promise.all([
      loadGroupTypes(data.restaurantId, db),
      loadOptionalOptions(db, "pms_market_segments", data.restaurantId),
      loadOptionalOptions(db, "pms_source_codes", data.restaurantId),
      loadOptionalOptions(db, "room_types", data.restaurantId),
      loadOptionalOptions(db, "hotel_rate_plans", data.restaurantId),
      loadOptionalOptions(db, "pms_meal_plans", data.restaurantId),
      loadOptionalOptions(db, "pms_packages", data.restaurantId),
      loadOptionalOptions(db, "pms_payment_methods", data.restaurantId),
      loadOptionalOptions(db, "distribution_channels", data.restaurantId),
      db.from("restaurants").select("currency_code").eq("id", data.restaurantId).maybeSingle(),
      db
        .from("pms_group_create_drafts")
        .select("id, payload")
        .eq("restaurant_id", data.restaurantId)
        .eq("created_by_membership_id", me.id)
        .maybeSingle(),
    ]);

    let savedDraft: { id: string; payload: GuestGroupCreateDraft; step: GuestGroupCreateStepId } | null = null;
    if (!draft.error && draft.data) {
      const parsed = parseGuestGroupCreateHold(draft.data.payload);
      if (parsed) {
        savedDraft = { id: draft.data.id, payload: parsed.draft, step: parsed.step };
      }
    }

    const defaultCurrency = String(restaurant.data?.currency_code ?? "").trim();
    return {
      catalogues: {
        groupTypes: (groupTypes ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          active: row.active,
        })),
        marketSegments,
        sourceCodes,
        roomTypes,
        ratePlans,
        mealPlans,
        packages,
        paymentMethods,
        channels,
        currencies: defaultCurrency ? [defaultCurrency] : [],
      },
      defaultCurrency,
      draft: savedDraft,
    };
  });

export const saveGroupCreateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, payload: z.record(z.unknown()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const existing = await db
      .from("pms_group_create_drafts")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("created_by_membership_id", me.id)
      .maybeSingle();
    if (existing.error && isMissingSchemaError(existing.error)) {
      throw new Error("Group drafts are unavailable until their migration is applied.");
    }
    if (existing.data) {
      const updated = await db
        .from("pms_group_create_drafts")
        .update({ payload: data.payload, updated_at: new Date().toISOString() })
        .eq("id", existing.data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) throw new Error(updated.error.message);
      return { id: existing.data.id as string };
    }
    const inserted = await db
      .from("pms_group_create_drafts")
      .insert({
        restaurant_id: data.restaurantId,
        created_by_membership_id: me.id,
        payload: data.payload,
      })
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    return { id: inserted.data.id as string };
  });

export const deleteGroupCreateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await admin(supabaseAdmin)
      .from("pms_group_create_drafts")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("created_by_membership_id", me.id);
    if (result.error && !isMissingSchemaError(result.error)) throw new Error(result.error.message);
    return { ok: true as const };
  });

export const loadGroupCreateCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        masterId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await admin(supabaseAdmin)
      .from("guest_account_masters")
      .select("id, name, payment_terms, credit_limit_note, credit_limit_amount, credit_account_enabled")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.masterId)
      .maybeSingle();
    if (result.error && isMissingSchemaError(result.error)) {
      return {
        id: data.masterId,
        name: null as string | null,
        paymentTerms: null as string | null,
        creditLimitNote: null as string | null,
        creditLimitAmount: null as number | null,
        creditAccountEnabled: null as boolean | null,
      };
    }
    if (result.error) throw new Error(result.error.message);
    const row = result.data as
      | {
          id: string;
          name: string | null;
          payment_terms?: string | null;
          credit_limit_note?: string | null;
          credit_limit_amount?: number | string | null;
          credit_account_enabled?: boolean | null;
        }
      | null;
    return {
      id: data.masterId,
      name: row?.name ?? null,
      paymentTerms: row?.payment_terms ?? null,
      creditLimitNote: row?.credit_limit_note ?? null,
      creditLimitAmount: row?.credit_limit_amount == null ? null : Number(row.credit_limit_amount),
      creditAccountEnabled: row?.credit_account_enabled ?? null,
    };
  });

async function persistMembers(
  restaurantId: string,
  groupId: string,
  members: GuestGroupCreateMemberDraft[],
): Promise<GuestGroupCreateMemberDraft[]> {
  const next: GuestGroupCreateMemberDraft[] = [];
  for (const member of members) {
    if (member.guestId) {
      try {
        await addGroupMember({
          data: {
            restaurantId,
            groupId,
            guestId: member.guestId,
            memberStatus: member.status,
            specialRequests: member.specialRequests || null,
          },
        });
      } catch (error) {
        if (!(error instanceof Error) || !/already a member/i.test(error.message)) throw error;
      }
      next.push(member);
      continue;
    }
    if (!filled(member.firstName) && !filled(member.guestName)) continue;
    const created = await createGroupMemberGuest({
      data: {
        restaurantId,
        groupId,
        firstName: filled(member.firstName) ? member.firstName : member.guestName,
        lastName: member.lastName || null,
        email: member.email || null,
        phone: member.phone || null,
        memberStatus: member.status,
        specialRequests: member.specialRequests || null,
      },
    });
    next.push({
      ...member,
      guestId: created.guestId,
    });
  }
  return next;
}

async function persistGroupOperations(
  restaurantId: string,
  groupId: string,
  draft: GuestGroupCreateDraft,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await admin(supabaseAdmin)
    .from("guest_account_masters")
    .update({ group_operations: draftToGroupOperations(draft) })
    .eq("restaurant_id", restaurantId)
    .eq("id", groupId)
    .eq("account_type", "group");
  if (result.error && !isMissingSchemaError(result.error) && result.error.code !== "42703") {
    throw new Error(result.error.message);
  }
}

export const persistGroupCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draft: z.custom<GuestGroupCreateDraft>(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const draft = data.draft;
    const saved = await saveGroupMaster({
      data: {
        restaurantId: data.restaurantId,
        groupId: draft.groupId || undefined,
        account: {
          name: draft.name,
          code: draft.codeManual && filled(draft.code) ? draft.code : draft.code || null,
          email: draft.contactEmail || null,
          phone: draft.contactPhone || null,
          notes: draft.notes || null,
          specialRequests: draft.specialRequests || null,
          accountStatus: "pending",
          groupTypeId: draft.groupTypeId || null,
          marketSegmentId: draft.marketSegmentId || null,
          sourceCodeId: draft.sourceCodeId || null,
          companyMasterId: draft.companyMasterId || null,
          travelAgentMasterId: draft.travelAgentMasterId || null,
          primaryContactGuestId: draft.primaryContactGuestId || null,
          primaryContactName: draft.primaryContactName || null,
          arrivalDate: draft.arrivalDate || null,
          departureDate: draft.departureDate || null,
          expectedPax:
            draft.expectedPax.trim() === "" || Number.isNaN(Number(draft.expectedPax))
              ? null
              : Number(draft.expectedPax),
          expectedRooms:
            draft.expectedRooms.trim() === "" || Number.isNaN(Number(draft.expectedRooms))
              ? null
              : Number(draft.expectedRooms),
        },
      },
    });
    const members = await persistMembers(data.restaurantId, saved.id, draft.members);
    await persistGroupOperations(data.restaurantId, saved.id, draft);
    return {
      id: saved.id,
      code: saved.code,
      members,
    };
  });
