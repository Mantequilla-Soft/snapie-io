import { describe, it, expect } from 'vitest'
import {
  HIVE_MAX_RECURRENT_TRANSFER_END_DATE_DAYS,
  PATRON_MAX_EXECUTIONS,
  PATRON_RECURRENCE_HOURS,
  maxRecurrentExecutions,
  recurrentTransferSpanDays,
} from './patronRecurrentTransfer'

describe('recurrentTransferSpanDays', () => {
  it('treats the first execution as immediate (span uses executions - 1)', () => {
    // Hive docs/tests: 2 executions with recurrence R lasts R hours, not 2R
    expect(recurrentTransferSpanDays(24, 2)).toBe(1)
    expect(recurrentTransferSpanDays(PATRON_RECURRENCE_HOURS, 2)).toBe(30)
  })
})

describe('maxRecurrentExecutions', () => {
  it('caps monthly recurrence within the 730-day Hive limit', () => {
    const max = maxRecurrentExecutions(PATRON_RECURRENCE_HOURS)
    expect(max).toBe(25)
    expect(recurrentTransferSpanDays(PATRON_RECURRENCE_HOURS, max)).toBeLessThanOrEqual(
      HIVE_MAX_RECURRENT_TRANSFER_END_DATE_DAYS,
    )
    expect(recurrentTransferSpanDays(PATRON_RECURRENCE_HOURS, max + 1)).toBeGreaterThan(
      HIVE_MAX_RECURRENT_TRANSFER_END_DATE_DAYS,
    )
  })

  it('matches Hive edge case: recurrence = 730*24/(executions-1) is still valid', () => {
    // From hive recurrent_transfer date-limit tests
    const executions = 2
    const recurrenceHours = HIVE_MAX_RECURRENT_TRANSFER_END_DATE_DAYS * 24 / (executions - 1)
    expect(recurrentTransferSpanDays(recurrenceHours, executions)).toBe(
      HIVE_MAX_RECURRENT_TRANSFER_END_DATE_DAYS,
    )
    expect(maxRecurrentExecutions(recurrenceHours)).toBeGreaterThanOrEqual(executions)
  })

  // Regression: previous support page used 64 monthly executions (~1890 days)
  it('rejects the old MAX_EXECUTIONS=64 monthly span as over the limit', () => {
    expect(recurrentTransferSpanDays(PATRON_RECURRENCE_HOURS, 64)).toBeGreaterThan(
      HIVE_MAX_RECURRENT_TRANSFER_END_DATE_DAYS,
    )
  })
})

describe('PATRON_MAX_EXECUTIONS', () => {
  it('is derived for monthly cadence and stays inside the protocol limit', () => {
    expect(PATRON_RECURRENCE_HOURS).toBe(720)
    expect(PATRON_MAX_EXECUTIONS).toBe(25)
    expect(recurrentTransferSpanDays(PATRON_RECURRENCE_HOURS, PATRON_MAX_EXECUTIONS)).toBe(720)
  })
})
