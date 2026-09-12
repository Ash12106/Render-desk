export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';

const SLA_HOURS: Record<TicketPriority, number> = {
  Low: 72,
  Medium: 48,
  High: 24,
  Critical: 4,
};

export function calculateSlaDueAt(priority: TicketPriority, startedAt = new Date()) {
  return new Date(startedAt.getTime() + SLA_HOURS[priority] * 60 * 60 * 1000);
}

export function isSlaBreached(slaDueAt?: Date | null, status?: string) {
  if (!slaDueAt || status === 'Resolved' || status === 'Closed') return false;
  return slaDueAt.getTime() < Date.now();
}

export const MAX_ESCALATION_LEVEL = 3;
