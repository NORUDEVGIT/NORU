import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  cancellationPolicyDraftSchema,
  contractTypeDraftSchema,
  noShowPolicyDraftSchema,
  type CancellationPolicyRecord,
  type ContractTypeRecord,
  type NoShowPolicyRecord,
} from "./corporate-contracts.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

const idSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// 1. Contract Types Master Server Functions
// ---------------------------------------------------------------------------

export const listPmsContractTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        activeOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ContractTypeRecord[]> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    let query = db
      .from("pms_contract_types")
      .select("id, restaurant_id, code, name, description, active, display_order, created_at, updated_at")
      .eq("restaurant_id", data.restaurantId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (data.activeOnly) {
      query = query.eq("active", true);
    }

    const { data: rows, error } = await query;
    if (error) {
      if (error.code === "42P01" || error.message?.includes("pms_contract_types")) {
        return [];
      }
      throw new Error(`Failed to load contract types: ${error.message}`);
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      restaurantId: r.restaurant_id,
      code: r.code,
      name: r.name,
      description: r.description ?? null,
      active: Boolean(r.active),
      displayOrder: Number(r.display_order ?? 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });

export const savePmsContractType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draft: contractTypeDraftSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ContractTypeRecord> => {
    await requireRoomManager(context as never, data.restaurantId);
    const db: DbClient = context.supabase;
    const { draft } = data;

    // Verify code uniqueness per property
    const codeCheckQuery = db
      .from("pms_contract_types")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("code", draft.code);

    if (draft.id) {
      codeCheckQuery.neq("id", draft.id);
    }

    const { data: existingCode } = await codeCheckQuery.maybeSingle();
    if (existingCode) {
      throw new Error(`A contract type with code "${draft.code}" already exists.`);
    }

    const payload = {
      restaurant_id: data.restaurantId,
      code: draft.code,
      name: draft.name,
      description: draft.description?.trim() || null,
      active: draft.active,
      display_order: draft.displayOrder,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (draft.id) {
      result = await db
        .from("pms_contract_types")
        .update(payload)
        .eq("id", draft.id)
        .eq("restaurant_id", data.restaurantId)
        .select()
        .single();
    } else {
      result = await db
        .from("pms_contract_types")
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
    }

    if (result.error) {
      throw new Error(`Failed to save contract type: ${result.error.message}`);
    }

    const r = result.data;
    return {
      id: r.id,
      restaurantId: r.restaurant_id,
      code: r.code,
      name: r.name,
      description: r.description ?? null,
      active: Boolean(r.active),
      displayOrder: Number(r.display_order ?? 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

export const setPmsContractTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    await requireRoomManager(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    const { error } = await db
      .from("pms_contract_types")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);

    if (error) {
      throw new Error(`Failed to toggle contract type: ${error.message}`);
    }
    return { success: true };
  });

// ---------------------------------------------------------------------------
// 2. Cancellation Policies Master Server Functions
// ---------------------------------------------------------------------------

export const listPmsCancellationPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        activeOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CancellationPolicyRecord[]> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    let query = db
      .from("pms_rate_cancellation_policies")
      .select("id, restaurant_id, code, name, description, policy_kind, window_value, window_unit, cutoff_time, penalty_type, penalty_value, deadline_hours, active, created_at, updated_at")
      .eq("restaurant_id", data.restaurantId)
      .order("name", { ascending: true });

    if (data.activeOnly) {
      query = query.eq("active", true);
    }

    let { data: rows, error } = await query;
    if (error || !rows?.length) {
      const fallbackQuery = db
        .from("pms_cancellation_policies")
        .select("id, restaurant_id, code, name, description, cutoff_hours, penalty_type, penalty_value, refundable_before_cutoff, is_default, active, created_at, updated_at")
        .eq("restaurant_id", data.restaurantId)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
      const fallbackRes = data.activeOnly ? await fallbackQuery.eq("active", true) : await fallbackQuery;
      if (fallbackRes.data?.length) {
        return (fallbackRes.data as any[]).map((r) => ({
          id: r.id,
          restaurantId: r.restaurant_id,
          code: r.code,
          name: r.name,
          description: r.description ?? null,
          cutoffHours: Number(r.cutoff_hours ?? 24),
          penaltyType: r.penalty_type,
          penaltyValue: Number(r.penalty_value ?? 0),
          refundableBeforeCutoff: Boolean(r.refundable_before_cutoff),
          isDefault: Boolean(r.is_default),
          active: Boolean(r.active),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
      }
      if (error && error.code !== "42P01") {
        return [];
      }
    }

    return (rows ?? []).map((r: any) => {
      const policyKind = r.policy_kind || "flexible";
      const windowUnit = r.window_unit || "hours_before_arrival";
      const windowValue = r.window_value != null ? Number(r.window_value) : null;
      const cutoffHours = r.cutoff_hours != null
        ? Number(r.cutoff_hours)
        : r.deadline_hours != null
          ? Number(r.deadline_hours)
          : windowUnit === "days_before_arrival" && windowValue != null
            ? windowValue * 24
            : windowValue != null
              ? windowValue
              : (policyKind === "non_refundable" ? 0 : 24);

      const rawPenalty = String(r.penalty_type ?? "none").toLowerCase();
      const penaltyType: PolicyPenaltyType =
        rawPenalty === "percentage" || rawPenalty === "percent" || rawPenalty === "percent_stay"
          ? "percent_stay"
          : rawPenalty === "fixed" || rawPenalty === "fixed_amount"
            ? "fixed_amount"
            : rawPenalty === "first_night" || rawPenalty === "nights"
              ? "first_night"
              : rawPenalty === "full_stay"
                ? "full_stay"
                : "none";

      return {
        id: r.id,
        restaurantId: r.restaurant_id,
        code: r.code,
        name: r.name,
        description: r.description ?? null,
        cutoffHours,
        penaltyType,
        penaltyValue: Number(r.penalty_value ?? 0),
        refundableBeforeCutoff: r.refundable_before_cutoff !== undefined
          ? Boolean(r.refundable_before_cutoff)
          : policyKind !== "non_refundable",
        isDefault: Boolean(r.is_default),
        active: Boolean(r.active),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
  });

export const savePmsCancellationPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draft: cancellationPolicyDraftSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CancellationPolicyRecord> => {
    await requireRoomManager(context as never, data.restaurantId);
    const db: DbClient = context.supabase;
    const { draft } = data;

    // Check code uniqueness
    const codeCheckQuery = db
      .from("pms_cancellation_policies")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("code", draft.code);

    if (draft.id) {
      codeCheckQuery.neq("id", draft.id);
    }

    const { data: existingCode } = await codeCheckQuery.maybeSingle();
    if (existingCode) {
      throw new Error(`A cancellation policy with code "${draft.code}" already exists.`);
    }

    // Default policy rule: If setting isDefault to true, unset any existing default first
    if (draft.isDefault) {
      await db
        .from("pms_cancellation_policies")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("restaurant_id", data.restaurantId)
        .eq("is_default", true);
    }

    const payload = {
      restaurant_id: data.restaurantId,
      code: draft.code,
      name: draft.name,
      description: draft.description?.trim() || null,
      cutoff_hours: draft.cutoffHours,
      penalty_type: draft.penaltyType,
      penalty_value: draft.penaltyType === "none" || draft.penaltyType === "first_night" || draft.penaltyType === "full_stay"
        ? 0
        : draft.penaltyValue,
      refundable_before_cutoff: draft.refundableBeforeCutoff,
      is_default: draft.isDefault,
      active: draft.active,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (draft.id) {
      result = await db
        .from("pms_cancellation_policies")
        .update(payload)
        .eq("id", draft.id)
        .eq("restaurant_id", data.restaurantId)
        .select()
        .single();
    } else {
      result = await db
        .from("pms_cancellation_policies")
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
    }

    if (result.error) {
      throw new Error(`Failed to save cancellation policy: ${result.error.message}`);
    }

    const r = result.data;
    return {
      id: r.id,
      restaurantId: r.restaurant_id,
      code: r.code,
      name: r.name,
      description: r.description ?? null,
      cutoffHours: Number(r.cutoff_hours ?? 24),
      penaltyType: r.penalty_type,
      penaltyValue: Number(r.penalty_value ?? 0),
      refundableBeforeCutoff: Boolean(r.refundable_before_cutoff),
      isDefault: Boolean(r.is_default),
      active: Boolean(r.active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

export const setPmsCancellationPolicyActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    await requireRoomManager(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    const { error } = await db
      .from("pms_cancellation_policies")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);

    if (error) {
      throw new Error(`Failed to toggle cancellation policy: ${error.message}`);
    }
    return { success: true };
  });

// ---------------------------------------------------------------------------
// 3. No-Show Policies Master Server Functions
// ---------------------------------------------------------------------------

export const listPmsNoShowPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        activeOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<NoShowPolicyRecord[]> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    let query = db
      .from("pms_no_show_policies")
      .select("id, restaurant_id, code, name, description, penalty_type, penalty_value, release_hour, is_default, active, created_at, updated_at")
      .eq("restaurant_id", data.restaurantId)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    if (data.activeOnly) {
      query = query.eq("active", true);
    }

    const { data: rows, error } = await query;
    if (error) {
      if (error.code === "42P01" || error.message?.includes("pms_no_show_policies")) {
        return [];
      }
      throw new Error(`Failed to load no-show policies: ${error.message}`);
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      restaurantId: r.restaurant_id,
      code: r.code,
      name: r.name,
      description: r.description ?? null,
      penaltyType: r.penalty_type,
      penaltyValue: Number(r.penalty_value ?? 0),
      releaseHour: Number(r.release_hour ?? 18),
      isDefault: Boolean(r.is_default),
      active: Boolean(r.active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });

export const savePmsNoShowPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draft: noShowPolicyDraftSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<NoShowPolicyRecord> => {
    await requireRoomManager(context as never, data.restaurantId);
    const db: DbClient = context.supabase;
    const { draft } = data;

    // Check code uniqueness
    const codeCheckQuery = db
      .from("pms_no_show_policies")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("code", draft.code);

    if (draft.id) {
      codeCheckQuery.neq("id", draft.id);
    }

    const { data: existingCode } = await codeCheckQuery.maybeSingle();
    if (existingCode) {
      throw new Error(`A no-show policy with code "${draft.code}" already exists.`);
    }

    // Default policy rule: If setting isDefault to true, unset any existing default first
    if (draft.isDefault) {
      await db
        .from("pms_no_show_policies")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("restaurant_id", data.restaurantId)
        .eq("is_default", true);
    }

    const payload = {
      restaurant_id: data.restaurantId,
      code: draft.code,
      name: draft.name,
      description: draft.description?.trim() || null,
      penalty_type: draft.penaltyType,
      penalty_value: draft.penaltyType === "none" || draft.penaltyType === "first_night" || draft.penaltyType === "full_stay"
        ? 0
        : draft.penaltyValue,
      release_hour: draft.releaseHour,
      is_default: draft.isDefault,
      active: draft.active,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (draft.id) {
      result = await db
        .from("pms_no_show_policies")
        .update(payload)
        .eq("id", draft.id)
        .eq("restaurant_id", data.restaurantId)
        .select()
        .single();
    } else {
      result = await db
        .from("pms_no_show_policies")
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
    }

    if (result.error) {
      throw new Error(`Failed to save no-show policy: ${result.error.message}`);
    }

    const r = result.data;
    return {
      id: r.id,
      restaurantId: r.restaurant_id,
      code: r.code,
      name: r.name,
      description: r.description ?? null,
      penaltyType: r.penalty_type,
      penaltyValue: Number(r.penalty_value ?? 0),
      releaseHour: Number(r.release_hour ?? 18),
      isDefault: Boolean(r.is_default),
      active: Boolean(r.active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

export const setPmsNoShowPolicyActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    await requireRoomManager(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    const { error } = await db
      .from("pms_no_show_policies")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);

    if (error) {
      throw new Error(`Failed to toggle no-show policy: ${error.message}`);
    }
    return { success: true };
  });

// ---------------------------------------------------------------------------
// 4. Company & Contract Document Types Server Functions
// ---------------------------------------------------------------------------

export interface CompanyDocumentTypeRecord {
  id: string;
  restaurantId: string;
  name: string;
  code: string;
  description: string | null;
  required: boolean;
  appliesToContract: boolean;
  appliesToCompany: boolean;
  appliesToTravelAgency: boolean;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const listPmsCompanyDocumentTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        contractOnly: z.boolean().optional(),
        travelAgencyOnly: z.boolean().optional(),
        activeOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CompanyDocumentTypeRecord[]> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    let query = db
      .from("pms_company_document_types")
      .select("id, restaurant_id, name, code, description, required, applies_to_contract, applies_to_company, applies_to_travel_agency, display_order, active, created_at, updated_at")
      .eq("restaurant_id", data.restaurantId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (data.activeOnly) {
      query = query.eq("active", true);
    }
    if (data.contractOnly) {
      query = query.eq("applies_to_contract", true);
    }
    if (data.travelAgencyOnly) {
      query = query.eq("applies_to_travel_agency", true);
    }

    const { data: rows, error } = await query;
    if (error) {
      if (error.code === "42P01" || error.message?.includes("pms_company_document_types")) {
        return [];
      }
      throw new Error(`Failed to load company document types: ${error.message}`);
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      restaurantId: r.restaurant_id,
      name: r.name,
      code: r.code,
      description: r.description ?? null,
      required: Boolean(r.required),
      appliesToContract: r.applies_to_contract !== undefined ? Boolean(r.applies_to_contract) : true,
      appliesToCompany: r.applies_to_company !== undefined ? Boolean(r.applies_to_company) : true,
      appliesToTravelAgency: r.applies_to_travel_agency !== undefined ? Boolean(r.applies_to_travel_agency) : false,
      displayOrder: Number(r.display_order ?? 0),
      active: Boolean(r.active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });

export const savePmsCompanyDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema.optional(),
        name: z.string().trim().min(1, "Name is required.").max(120),
        code: z
          .string()
          .trim()
          .min(1, "Code is required.")
          .max(20)
          .regex(/^[A-Z][A-Z0-9_]{1,19}$/, "Code must start with letter and contain uppercase letters, numbers, underscores."),
        description: z.string().trim().max(500).optional().default(""),
        required: z.boolean().default(false),
        appliesToContract: z.boolean().optional(),
        appliesToCompany: z.boolean().default(true),
        appliesToTravelAgency: z.boolean().default(false),
        displayOrder: z.number().int().min(0).default(0),
        active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CompanyDocumentTypeRecord> => {
    await requireRoomManager(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    const appliesToCompany = Boolean(data.appliesToCompany);
    const payload = {
      restaurant_id: data.restaurantId,
      name: data.name,
      code: data.code,
      description: data.description?.trim() || null,
      required: data.required,
      applies_to_contract: data.appliesToContract ?? appliesToCompany,
      applies_to_company: appliesToCompany,
      applies_to_travel_agency: Boolean(data.appliesToTravelAgency),
      display_order: data.displayOrder,
      active: data.active,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (data.id) {
      result = await db
        .from("pms_company_document_types")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId)
        .select()
        .single();
    } else {
      result = await db
        .from("pms_company_document_types")
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
    }

    if (result.error) {
      throw new Error(`Failed to save company document type: ${result.error.message}`);
    }

    const r = result.data;
    return {
      id: r.id,
      restaurantId: r.restaurant_id,
      name: r.name,
      code: r.code,
      description: r.description ?? null,
      required: Boolean(r.required),
      appliesToContract: Boolean(r.applies_to_contract),
      appliesToCompany: Boolean(r.applies_to_company),
      appliesToTravelAgency: Boolean(r.applies_to_travel_agency),
      displayOrder: Number(r.display_order ?? 0),
      active: Boolean(r.active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

export const setPmsCompanyDocumentTypeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    await requireRoomManager(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    const { error } = await db
      .from("pms_company_document_types")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);

    if (error) {
      throw new Error(`Failed to toggle company document type: ${error.message}`);
    }
    return { success: true };
  });

export const setPmsCompanyDocumentTypeRequired = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
        required: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    await requireRoomManager(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    const { error } = await db
      .from("pms_company_document_types")
      .update({ required: data.required, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);

    if (error) {
      throw new Error(`Failed to toggle document type requirement: ${error.message}`);
    }
    return { success: true };
  });

export const deletePmsCompanyDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    await requireRoomManager(context as never, data.restaurantId);
    const db: DbClient = context.supabase;

    const { error } = await db
      .from("pms_company_document_types")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);

    if (error) {
      throw new Error(`Failed to delete company document type: ${error.message}`);
    }
    return { success: true };
  });

// ---------------------------------------------------------------------------
// 5. Composite Step 4 Config Loader
// ---------------------------------------------------------------------------

export interface CompanyContractCreateConfig {
  contractTypes: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    displayOrder: number;
    active: boolean;
  }>;
  currencies: Array<{
    code: string;
    isBase: boolean;
  }>;
  ratePlans: Array<{
    id: string;
    code: string;
    name: string;
    roomTypeId: string;
    roomTypeName: string;
    currency: string;
    active: boolean;
  }>;
  roomTypes: Array<{
    id: string;
    code: string;
    name: string;
    active: boolean;
  }>;
  guaranteePolicies: Array<{
    id: string;
    code: string;
    name: string;
    depositType: string;
    depositValue: number;
    required: boolean;
    isDefault: boolean;
    active: boolean;
    description: string | null;
  }>;
  cancellationPolicies: Array<{
    id: string;
    code: string;
    name: string;
    cutoffHours: number;
    penaltyType: string;
    penaltyValue: number;
    refundableBeforeCutoff: boolean;
    isDefault: boolean;
    active: boolean;
    description: string | null;
  }>;
  noShowPolicies: Array<{
    id: string;
    code: string;
    name: string;
    penaltyType: string;
    penaltyValue: number;
    releaseHour: number;
    isDefault: boolean;
    active: boolean;
    description: string | null;
  }>;
  contractDocumentTypes: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    required: boolean;
    displayOrder: number;
    active: boolean;
  }>;
  baseCurrency: string;
  defaultCurrency: string;
}

export const getCompanyContractCreateConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CompanyContractCreateConfig> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    let db: any = context.supabase;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (supabaseAdmin) {
        db = supabaseAdmin;
      }
    } catch {
      // Fallback to context.supabase
    }
    const { restaurantId } = data;

    // Load active contract types
    const contractTypesRes = await db
      .from("pms_contract_types")
      .select("id, code, name, description, display_order, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    // Load active room types
    let roomTypesRes = await db
      .from("room_types")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name", { ascending: true });

    if (roomTypesRes.error) {
      roomTypesRes = await db
        .from("room_types")
        .select("id, code, name")
        .eq("restaurant_id", restaurantId)
        .order("name", { ascending: true });
    }

    const roomTypeMap = new Map<string, string>();
    for (const rt of (roomTypesRes.data ?? []) as Array<Record<string, unknown>>) {
      roomTypeMap.set(String(rt.id), String(rt.name ?? rt.code ?? "Room"));
    }

    // Load active rate plans with room type join
    let ratePlansRes = await db
      .from("hotel_rate_plans")
      .select("id, code, name, room_type_id, currency, active")
      .eq("restaurant_id", restaurantId)
      .order("name", { ascending: true });

    if (ratePlansRes.error) {
      ratePlansRes = await db
        .from("hotel_rate_plans")
        .select("id, code, name, room_type_id, currency")
        .eq("restaurant_id", restaurantId)
        .order("name", { ascending: true });
    }

    // Load active deposit policies (Guarantee)
    const depositPoliciesRes = await db
      .from("pms_deposit_policies")
      .select("id, code, name, deposit_type, deposit_value, required, is_default, active, description")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    // Load active cancellation policies from Card 2 rates catalogue
    let cancellationPoliciesRes = await db
      .from("pms_rate_cancellation_policies")
      .select("id, code, name, description, policy_kind, window_value, window_unit, deadline_hours, penalty_type, penalty_value, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("name", { ascending: true });

    if (cancellationPoliciesRes.error || !cancellationPoliciesRes.data?.length) {
      const fallback = await db
        .from("pms_cancellation_policies")
        .select("id, code, name, cutoff_hours, penalty_type, penalty_value, refundable_before_cutoff, is_default, active, description")
        .eq("restaurant_id", restaurantId)
        .eq("active", true)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
      if (!fallback.error && fallback.data?.length) {
        cancellationPoliciesRes = fallback;
      }
    }

    // Load active no-show policies
    const noShowPoliciesRes = await db
      .from("pms_no_show_policies")
      .select("id, code, name, penalty_type, penalty_value, release_hour, is_default, active, description")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    // Load active company document types (applicable to company)
    const documentTypesRes = await db
      .from("pms_company_document_types")
      .select("id, code, name, description, required, applies_to_company, display_order, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    // Load property currencies (Card 1 base currency and supported currencies from settings)
    const restRes = await db
      .from("restaurants")
      .select("currency_code")
      .eq("id", restaurantId)
      .maybeSingle();

    const baseCurrency = String((restRes.data as any)?.currency_code ?? "").trim().toUpperCase() || "USD";
    const availableCodes = Array.from(new Set([baseCurrency, "USD", "EUR", "GBP", "ETB"].filter(Boolean)));
    const currencies = availableCodes.map((code) => ({
      code,
      isBase: code === baseCurrency,
    }));

    return {
      contractTypes: (contractTypesRes.data ?? []).map((ct: any) => ({
        id: ct.id,
        code: ct.code,
        name: ct.name,
        description: ct.description ?? null,
        displayOrder: Number(ct.display_order ?? 0),
        active: Boolean(ct.active),
      })),
      currencies,
      baseCurrency,
      defaultCurrency: baseCurrency,
      ratePlans: ((ratePlansRes.data ?? []) as Array<Record<string, unknown>>)
        .filter((rp) => rp.active !== false)
        .map((rp) => ({
          id: String(rp.id),
          code: String(rp.code ?? ""),
          name: String(rp.name ?? ""),
          roomTypeId: String(rp.room_type_id ?? ""),
          roomTypeName: roomTypeMap.get(String(rp.room_type_id ?? "")) ?? "Room",
          currency: String(rp.currency ?? baseCurrency).toUpperCase(),
          active: rp.active !== false,
        })),
      roomTypes: ((roomTypesRes.data ?? []) as Array<Record<string, unknown>>)
        .filter((rt) => rt.active !== false)
        .map((rt) => ({
          id: String(rt.id),
          code: String(rt.code ?? ""),
          name: String(rt.name ?? ""),
          active: rt.active !== false,
        })),
      guaranteePolicies: (depositPoliciesRes.data ?? []).map((dp: any) => ({
        id: dp.id,
        code: dp.code,
        name: dp.name,
        depositType: dp.deposit_type,
        depositValue: Number(dp.deposit_value ?? 0),
        required: Boolean(dp.required),
        isDefault: Boolean(dp.is_default),
        active: Boolean(dp.active),
        description: dp.description ?? null,
      })),
      cancellationPolicies: (cancellationPoliciesRes.data ?? []).map((cp: any) => {
        const policyKind = cp.policy_kind || "flexible";
        const windowUnit = cp.window_unit || "hours_before_arrival";
        const windowValue = cp.window_value != null ? Number(cp.window_value) : null;
        const cutoffHours = cp.cutoff_hours != null
          ? Number(cp.cutoff_hours)
          : cp.deadline_hours != null
            ? Number(cp.deadline_hours)
            : windowUnit === "days_before_arrival" && windowValue != null
              ? windowValue * 24
              : windowValue != null
                ? windowValue
                : (policyKind === "non_refundable" ? 0 : 24);

        const rawPenalty = String(cp.penalty_type ?? "none").toLowerCase();
        const penaltyType: PolicyPenaltyType =
          rawPenalty === "percentage" || rawPenalty === "percent" || rawPenalty === "percent_stay"
            ? "percent_stay"
            : rawPenalty === "fixed" || rawPenalty === "fixed_amount"
              ? "fixed_amount"
              : rawPenalty === "first_night" || rawPenalty === "nights"
                ? "first_night"
                : rawPenalty === "full_stay"
                  ? "full_stay"
                  : "none";

        return {
          id: cp.id,
          code: cp.code,
          name: cp.name,
          cutoffHours,
          penaltyType,
          penaltyValue: Number(cp.penalty_value ?? 0),
          refundableBeforeCutoff: cp.refundable_before_cutoff !== undefined
            ? Boolean(cp.refundable_before_cutoff)
            : policyKind !== "non_refundable",
          isDefault: Boolean(cp.is_default),
          active: Boolean(cp.active),
          description: cp.description ?? null,
        };
      }),
      noShowPolicies: (noShowPoliciesRes.data ?? []).map((nsp: any) => ({
        id: nsp.id,
        code: nsp.code,
        name: nsp.name,
        penaltyType: nsp.penalty_type,
        penaltyValue: Number(nsp.penalty_value ?? 0),
        releaseHour: Number(nsp.release_hour ?? 18),
        isDefault: Boolean(nsp.is_default),
        active: Boolean(nsp.active),
        description: nsp.description ?? null,
      })),
      contractDocumentTypes: (documentTypesRes.data ?? [])
        .filter((dt: any) => dt.applies_to_company !== false)
        .map((dt: any) => ({
          id: dt.id,
          code: dt.code,
          name: dt.name,
          description: dt.description ?? null,
          required: Boolean(dt.required),
          displayOrder: Number(dt.display_order ?? 0),
          active: Boolean(dt.active),
        })),
    };
  });
