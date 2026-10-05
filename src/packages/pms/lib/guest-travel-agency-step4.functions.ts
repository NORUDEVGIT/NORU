/**
 * Server Functions for Travel Agency Step 4:
 * Payment, Credit & Reservation Rules + Settings-driven Documents.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware.ts";
import { requireGuestManager } from "./guests.server.ts";
import {
  loadTravelAgencyStep4Config,
  validateTravelAgencyStep4,
  type TravelAgencyStep4Config,
  type TravelAgencyStep4Payload,
} from "./guest-travel-agency-step4.server.ts";

const idSchema = z.string().uuid();

export const getTravelAgencyStep4Config = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema.optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<TravelAgencyStep4Config> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadTravelAgencyStep4Config(
      supabaseAdmin as any,
      data.restaurantId,
      data.agencyId,
    );
  });

export const saveTravelAgencyStep4 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        agencyId: idSchema,
        billingCurrencyCode: z.string().trim().min(1, "Billing currency is required."),
        defaultPaymentMethodId: idSchema.optional().nullable(),
        paymentTiming: z.enum(["due_on_arrival", "due_on_departure", "prepaid", "credit_terms"]),
        defaultBillingRuleId: idSchema,
        billingInstruction: z.string().optional().nullable(),
        allowCredit: z.boolean().default(false),
        creditLimitAmount: z.number().min(0).optional().nullable(),
        creditDays: z.number().int().min(0).max(365).optional().nullable(),
        creditStatus: z.enum(["pending_approval", "approved", "suspended"]).optional().nullable(),
        defaultDepositPolicyId: idSchema.optional().nullable(),
        defaultCancellationPolicyId: idSchema.optional().nullable(),
        defaultNoShowPolicyId: idSchema.optional().nullable(),
        bookingNotes: z.string().max(500).optional().nullable(),
        documents: z
          .array(
            z.object({
              documentTypeId: idSchema,
              fileName: z.string().min(1),
              fileStoragePath: z.string().min(1),
              fileSizeBytes: z.number().optional(),
            }),
          )
          .optional(),
        mode: z.enum(["draft", "complete"]).default("complete"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const config = await loadTravelAgencyStep4Config(db, data.restaurantId, data.agencyId);

    // Validate server-side
    validateTravelAgencyStep4(data as TravelAgencyStep4Payload, config, data.mode);

    // Derive legacy payment terms text for backward compatibility
    let derivedPaymentTerms = "Due on Departure";
    if (data.paymentTiming === "due_on_arrival") derivedPaymentTerms = "Due on Arrival";
    else if (data.paymentTiming === "prepaid") derivedPaymentTerms = "Prepaid";
    else if (data.paymentTiming === "credit_terms") {
      derivedPaymentTerms = data.creditDays ? `Net ${data.creditDays} Days` : "Credit Terms";
    }

    // Persist to guest_account_masters
    const updateResult = await db
      .from("guest_account_masters")
      .update({
        billing_currency_code: data.billingCurrencyCode.trim().toUpperCase(),
        preferred_currency: data.billingCurrencyCode.trim().toUpperCase(),
        default_payment_method_id: data.defaultPaymentMethodId || null,
        payment_timing: data.paymentTiming,
        default_billing_rule_id: data.defaultBillingRuleId,
        billing_instruction: data.billingInstruction || null,
        payment_terms: derivedPaymentTerms,
        credit_account_enabled: data.allowCredit,
        credit_limit_amount: data.allowCredit ? data.creditLimitAmount ?? null : null,
        credit_days: data.allowCredit ? data.creditDays ?? null : null,
        credit_status: data.allowCredit ? data.creditStatus || "pending_approval" : null,
        default_deposit_policy_id: data.defaultDepositPolicyId || null,
        default_cancellation_policy_id: data.defaultCancellationPolicyId || null,
        default_no_show_policy_id: data.defaultNoShowPolicyId || null,
        booking_notes: data.bookingNotes || null,
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.agencyId);

    if (updateResult.error) {
      throw new Error(`Failed to save payment & reservation rules: ${updateResult.error.message}`);
    }

    // Link uploaded documents in guest_company_documents
    if (data.documents && data.documents.length > 0) {
      const docRows = data.documents.map((d) => ({
        restaurant_id: data.restaurantId,
        company_master_id: data.agencyId,
        document_type_id: d.documentTypeId,
        name: d.fileName,
        storage_path: d.fileStoragePath,
        uploaded_by_membership_id: me.id,
        review_status: "verified",
      }));

      const docInsert = await db.from("guest_company_documents").insert(docRows);
      if (docInsert.error) {
        console.error("Warning: Could not link some agency documents:", docInsert.error.message);
      }
    }

    return { success: true };
  });

export const createTravelAgencyDraftDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
        size: z.number().int().positive().max(12 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = data.contentType === "application/pdf" ? "pdf" : "jpg";
    const path = `${data.restaurantId}/travel-agents/drafts/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage.from("property-images").createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not start document upload.");
    return { ok: true as const, path, token: signed.token };
  });
