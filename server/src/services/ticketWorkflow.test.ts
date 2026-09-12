import { describe, expect, it, vi } from 'vitest';
import { calculateSlaDueAt, isSlaBreached, MAX_ESCALATION_LEVEL } from './ticketWorkflow.js';

describe('ticket workflow SLA rules', () => {
  it('assigns the documented SLA windows by priority', () => {
    const startedAt = new Date('2026-01-01T00:00:00.000Z');
    expect(calculateSlaDueAt('Critical', startedAt).toISOString()).toBe('2026-01-01T04:00:00.000Z');
    expect(calculateSlaDueAt('High', startedAt).toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(calculateSlaDueAt('Medium', startedAt).toISOString()).toBe('2026-01-03T00:00:00.000Z');
    expect(calculateSlaDueAt('Low', startedAt).toISOString()).toBe('2026-01-04T00:00:00.000Z');
  });

  it('does not report completed tickets as breached', () => {
    const now = new Date('2026-01-05T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const overdue = new Date('2026-01-04T23:59:59.000Z');
    expect(isSlaBreached(overdue, 'In Progress')).toBe(true);
    expect(isSlaBreached(overdue, 'Resolved')).toBe(false);
    expect(isSlaBreached(overdue, 'Closed')).toBe(false);
    vi.useRealTimers();
  });

  it('caps escalation at three levels', () => {
    expect(MAX_ESCALATION_LEVEL).toBe(3);
  });
});
