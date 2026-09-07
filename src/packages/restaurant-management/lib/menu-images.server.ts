/** Server-only helpers for menu image storage (private bucket + signed URLs). */
export const MENU_BUCKET = "menu-images";
export const STORAGE_PREFIX = "storage:";

export function isStorageRef(value: string | null | undefined): value is string {
  return !!value && value.startsWith(STORAGE_PREFIX);
}

export function storagePath(value: string): string {
  return value.slice(STORAGE_PREFIX.length);
}

/**
 * Turns stored image references into displayable URLs. Absolute/CDN URLs are
 * passed through; private-bucket references are signed server-side so the
 * bucket itself never needs public write or public read access.
 */
export async function resolveImageUrls(
  refs: (string | null)[],
): Promise<Map<string, string>> {
  const paths = Array.from(new Set(refs.filter(isStorageRef).map(storagePath)));
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from(MENU_BUCKET).createSignedUrls(paths, 3600);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(STORAGE_PREFIX + row.path, row.signedUrl);
  }
  return out;
}
