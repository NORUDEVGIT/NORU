/**
 * Single-writer synchronization for Identity Document dual-storage.
 * Keeps pms_guest_profile_types.document_type_ids and
 * pms_guest_id_types.valid_for_profile_type_ids in lockstep.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export async function syncProfileTypeDocumentAssignments(
  db: DbClient,
  restaurantId: string,
  profileTypeId: string,
  assignedDocIds: string[],
  userId: string,
): Promise<void> {
  const targetDocIds = new Set(assignedDocIds);
  const docsRes = await db
    .from("pms_guest_id_types")
    .select("id, valid_for_profile_type_ids")
    .eq("restaurant_id", restaurantId);
  if (docsRes.error) return;

  const docs = (docsRes.data ?? []) as Array<{
    id: string;
    valid_for_profile_type_ids: string[] | null;
  }>;

  for (const doc of docs) {
    const current = new Set(doc.valid_for_profile_type_ids ?? []);
    const shouldHave = targetDocIds.has(doc.id);
    let changed = false;

    if (shouldHave && !current.has(profileTypeId)) {
      current.add(profileTypeId);
      changed = true;
    } else if (!shouldHave && current.has(profileTypeId)) {
      current.delete(profileTypeId);
      changed = true;
    }

    if (changed) {
      await db
        .from("pms_guest_id_types")
        .update({
          valid_for_profile_type_ids: Array.from(current),
          updated_by: userId,
        })
        .eq("id", doc.id)
        .eq("restaurant_id", restaurantId);
    }
  }
}

export async function syncDocumentTypeProfileAssignments(
  db: DbClient,
  restaurantId: string,
  documentTypeId: string,
  assignedProfileTypeIds: string[],
  userId: string,
): Promise<void> {
  const targetPtIds = new Set(assignedProfileTypeIds);
  const ptsRes = await db
    .from("pms_guest_profile_types")
    .select("id, document_type_ids")
    .eq("restaurant_id", restaurantId);
  if (ptsRes.error) return;

  const pts = (ptsRes.data ?? []) as Array<{
    id: string;
    document_type_ids: string[] | null;
  }>;

  for (const pt of pts) {
    const current = new Set(pt.document_type_ids ?? []);
    const shouldHave = targetPtIds.has(pt.id);
    let changed = false;

    if (shouldHave && !current.has(documentTypeId)) {
      current.add(documentTypeId);
      changed = true;
    } else if (!shouldHave && current.has(documentTypeId)) {
      current.delete(documentTypeId);
      changed = true;
    }

    if (changed) {
      await db
        .from("pms_guest_profile_types")
        .update({
          document_type_ids: Array.from(current),
          updated_by: userId,
        })
        .eq("id", pt.id)
        .eq("restaurant_id", restaurantId);
    }
  }
}
