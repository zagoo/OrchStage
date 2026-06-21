/**
 * RFC-4122 v4 UUID generation, wrapped behind a function so it can be stubbed in
 * tests. The server keys sequences by `id` (a UUID primary key), so forking a new
 * sequence version requires a fresh id — see api/canvas.persistSequenceEdit.
 */
export function genUuid(): string {
  return crypto.randomUUID()
}
