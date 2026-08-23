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

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ rows: T[]; error: unknown }> {
  const rows: T[] = []
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await page(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) return { rows, error }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < SUPABASE_PAGE_SIZE) return { rows, error: null }
  }
}
