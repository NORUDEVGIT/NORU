/** Page a PostgREST read until a short page. A cap is not a complete blocker count. */

const PAGE_SIZE = 1000;
const MAX_ROWS = 200_000;

export async function selectAll<T>(
  page: (
    from: number,
    to: number,
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error("Night audit could not finish reading this property. Close stays unavailable.");
}

const ID_CHUNK = 200;

/** Load rows by id without a single `.in()` that PostgREST would cap. */
export async function selectByIds<T>(
  ids: readonly string[],
  load: (
    chunk: readonly string[],
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const chunk = ids.slice(index, index + ID_CHUNK);
    const { data, error } = await load(chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}
