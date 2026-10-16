import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePlatformAdmin } from "./admin-authz";
import {
  leadSubmissionSchema,
  leadUpdateSchema,
  leadValidationMessage,
  leadStorageErrorMessage,
  type LeadStatus,
} from "./leads.ts";

export interface AdminLeadRow {
  id: string;
  createdAt: string;
  source: "request_demo" | "contact";
  name: string;
  email: string;
  company: string;
  phone: string | null;
  message: string | null;
  propertyType: string;
  status: LeadStatus;
  notes: string | null;
}

export const submitLead = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = leadSubmissionSchema.safeParse(input);
    if (!parsed.success) throw new Error(leadValidationMessage());
    return parsed.data;
  })
  .handler(async ({ data }) => {
    const { insertLead } = await import("./leads.server");
    await insertLead(data);
    return { ok: true as const };
  });

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminLeadRow[]> => {
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select(
        "id, created_at, source, name, email, company, phone, message, property_type, status, notes",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      throw new Error(leadStorageErrorMessage(error.message, "We couldn't load leads right now."));
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      source: row.source === "request_demo" ? "request_demo" : "contact",
      name: row.name,
      email: row.email,
      company: row.company,
      phone: row.phone,
      message: row.message,
      propertyType: row.property_type,
      status: row.status === "contacted" || row.status === "closed" ? row.status : "new",
      notes: row.notes,
    }));
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const parsed = leadUpdateSchema.safeParse(input);
    if (!parsed.success) throw new Error("That lead update is not valid.");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ status: data.status, notes: data.notes })
      .eq("id", data.id);
    if (error) {
      throw new Error(leadStorageErrorMessage(error.message, "We couldn't update that lead."));
    }
    return { ok: true as const };
  });
