/**
 * Reading a whole table's worth of rows past PostgREST's server-side cap.
 *
 * PostgREST caps a response at 1,000 rows (db-max-rows), and `.range()` cannot
 * lift it — so a query with no paging silently loses everything past the first
 * thousand. This pages through instead, stopping as soon as a page comes back
 * short.
 *
 * Lived in app/(app)/questions/page.tsx, where the cap was first hit. It moved
 * here once the โจทย์ pickers turned out to need the same thing: they were
 * loading the bank with a single unpaged query, so a teacher past a thousand
 * questions could not find the tail of their own คลัง.
 */
export const SUPABASE_PAGE_SIZE = 1000
export const SUPABASE_IN_FILTER_CHUNK_SIZE = 200

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  options: { maxRows?: number } = {},
): Promise<{ rows: T[]; error: unknown }> {
  const rows: T[] = []
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY
  if (!Number.isInteger(maxRows) && maxRows !== Number.POSITIVE_INFINITY) {
    throw new TypeError('maxRows must be a positive integer')
  }
  if (maxRows <= 0) throw new TypeError('maxRows must be a positive integer')

  for (let from = 0; from < maxRows; from += SUPABASE_PAGE_SIZE) {
    const pageSize = Math.min(SUPABASE_PAGE_SIZE, maxRows - from)
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { rows, error }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) return { rows, error: null }
  }

  return { rows, error: null }
}

/**
 * Run `.in(column, values)` lookups in bounded chunks so a large classroom does
 * not overflow URL/query limits. The caller remains responsible for RLS and for
 * selecting only the columns it needs.
 */
export async function fetchRowsInChunks<T, TValue>(
  values: TValue[],
  query: (chunk: TValue[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunkSize = SUPABASE_IN_FILTER_CHUNK_SIZE,
): Promise<{ rows: T[]; error: unknown }> {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new TypeError('chunkSize must be a positive integer')
  }

  const rows: T[] = []
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    const { data, error } = await query(values.slice(offset, offset + chunkSize))
    if (error) return { rows, error }
    rows.push(...(data ?? []))
  }
  return { rows, error: null }
}
