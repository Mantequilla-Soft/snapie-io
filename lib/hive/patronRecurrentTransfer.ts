/** Hive protocol: HIVE_MAX_RECURRENT_TRANSFER_END_DATE */
export const HIVE_MAX_RECURRENT_TRANSFER_END_DATE_DAYS = 730

/** ~monthly cadence for Snapie patron recurring HBD support. */
export const PATRON_RECURRENCE_HOURS = 24 * 30

/**
 * Span from create/edit until the final scheduled trigger, in days.
 * On a new recurrent_transfer the first execution is immediate, so the
 * remaining (executions - 1) intervals determine the end date.
 */
export function recurrentTransferSpanDays(recurrenceHours: number, executions: number): number {
  if (recurrenceHours <= 0) throw new Error('recurrenceHours must be > 0')
  if (executions < 2) throw new Error('executions must be >= 2')
  return (recurrenceHours * (executions - 1)) / 24
}

/**
 * Largest executions count that still fits within Hive's end-date limit
 * for a given recurrence (hours).
 */
export function maxRecurrentExecutions(
  recurrenceHours: number,
  maxEndDateDays = HIVE_MAX_RECURRENT_TRANSFER_END_DATE_DAYS,
): number {
  if (recurrenceHours <= 0) throw new Error('recurrenceHours must be > 0')
  // recurrenceHours * (executions - 1) / 24 <= maxEndDateDays
  return Math.floor((maxEndDateDays * 24) / recurrenceHours) + 1
}

/** Safe monthly patron subscription length (~720 days with 25 executions). */
export const PATRON_MAX_EXECUTIONS = maxRecurrentExecutions(PATRON_RECURRENCE_HOURS)
