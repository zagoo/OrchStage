/**
 * Query-string builder. Skips `undefined` / `null`, serialises booleans and
 * numbers, repeats array values (`?tag=a&tag=b`), and URI-encodes everything.
 */
export type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>
export type QueryParams = Record<string, QueryValue>
/**
 * Public boundary type. Domain query *interfaces* are not assignable to
 * `Record<string, QueryValue>` (TypeScript gives interfaces no implicit index
 * signature), so the API surface also accepts plain objects.
 */
export type QueryInput = QueryParams | object

export function buildQuery(params?: QueryInput): string {
  if (!params) return ''
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params as Record<string, QueryValue>)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v !== undefined && v !== null) usp.append(key, String(v))
      }
    } else {
      usp.append(key, String(value))
    }
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}
