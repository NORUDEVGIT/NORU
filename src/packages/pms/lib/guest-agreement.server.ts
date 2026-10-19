/**
 * Seeds one editable Guest Agreement draft when a property has no version.
 * Does not update a property that already has agreement configuration.
 */
import { defaultGuestAgreementPackage } from "@/packages/pms/lib/guest-agreement-defaults";
import {
  renderGuestAgreementBody,
  shouldSeedGuestAgreement,
} from "@/packages/pms/lib/guest-agreement-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = any;

export async function seedGuestAgreementDraft(
  db: UntypedDb,
  restaurantId: string,
  actorMembershipId: string | null = null,
): Promise<"seeded" | "exists"> {
  const existing = await db
    .from("pms_registration_agreement_versions")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);
  if (!shouldSeedGuestAgreement((existing.data ?? []).length)) return "exists";

  const agreement = defaultGuestAgreementPackage();
  const inserted = await db.from("pms_registration_agreement_versions").insert({
    restaurant_id: restaurantId,
    version_label: "1",
    body: renderGuestAgreementBody(agreement),
    active: false,
    title: agreement.title,
    intro: agreement.intro,
    lead_in: agreement.leadIn,
    acknowledgement_title: agreement.acknowledgementTitle,
    acknowledgement_intro: agreement.acknowledgementIntro,
    agreement_sections: agreement.sections,
    acknowledgements: agreement.acknowledgements,
    ...(actorMembershipId ? { created_by_membership_id: actorMembershipId } : {}),
  });
  if (inserted.error) {
    if (inserted.error.code === "23505") return "exists";
    throw new Error(inserted.error.message);
  }
  return "seeded";
}
