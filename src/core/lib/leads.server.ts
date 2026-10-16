import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  LEAD_COOLDOWN_MS,
  leadCooldownExceeded,
  leadCooldownMessage,
  leadStorageErrorMessage,
  type LeadSubmission,
} from "./leads.ts";

export async function insertLead(submission: LeadSubmission): Promise<void> {
  const since = new Date(Date.now() - LEAD_COOLDOWN_MS).toISOString();
  const recent = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("email", submission.email)
    .gte("created_at", since);
  if (recent.error) {
    console.error("[insertLead:count]", recent.error.message);
    throw new Error(
      leadStorageErrorMessage(
        recent.error.message,
        "We couldn't send that request. Please try again.",
      ),
    );
  }
  if (leadCooldownExceeded(recent.count ?? 0)) {
    throw new Error(leadCooldownMessage());
  }

  const inserted = await supabaseAdmin.from("leads").insert({
    source: submission.source,
    name: submission.name,
    email: submission.email,
    company: submission.company,
    phone: submission.phone,
    message: submission.message,
    property_type: submission.propertyType,
  });
  if (inserted.error) {
    console.error("[insertLead]", inserted.error.message);
    throw new Error(
      leadStorageErrorMessage(
        inserted.error.message,
        "We couldn't send that request. Please try again.",
      ),
    );
  }
}
