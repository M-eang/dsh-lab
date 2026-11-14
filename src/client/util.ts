/**
 * Small pure helpers shared by the dock and the sidebar page.
 * @module dsh-lab/client/util
 */

/** Short "how long has this been up" label. */
export function formatAge(startedAt: number): string {
  const ms = Date.now() - startedAt
  if (ms < 60_000) return String(Math.max(1, Math.round(ms / 1000))) + 's'
  if (ms < 3_600_000) return String(Math.round(ms / 60_000)) + 'm'
  return String(Math.round(ms / 3_600_000)) + 'h'
}
