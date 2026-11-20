/** Hive chain timestamps are UTC but often omit a trailing `Z`. */

const HAS_EXPLICIT_TZ = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Append `Z` when the string has no timezone; leave `Z` / ±offsets unchanged. */
export function normalizeHiveTimestamp(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return HAS_EXPLICIT_TZ.test(trimmed) ? trimmed : `${trimmed}Z`;
}

/** Parse a Hive timestamp as UTC. A Date passes through as a copy, and a
 *  missing or non-string value gives an Invalid Date instead of throwing. */
export function parseHiveDate(value: string | Date | null | undefined): Date {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value !== 'string') return new Date(NaN);
  return new Date(normalizeHiveTimestamp(value));
}

/** Milliseconds since epoch, or null when the value is empty / unparseable. */
export function parseHiveDateMs(value: string | undefined | null): number | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(normalizeHiveTimestamp(trimmed));
  return Number.isNaN(ms) ? null : ms;
}
