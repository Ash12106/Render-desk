export const STATUS_TRANSITIONS = {
  Open: ['Open', 'In Progress'],
  'In Progress': ['Open', 'In Progress', 'Resolved'],
  Resolved: ['In Progress', 'Resolved', 'Closed'],
  Closed: ['Closed'],
} as const;

export type TicketStatus = keyof typeof STATUS_TRANSITIONS;

export class InvalidStatusTransitionError extends Error {
  statusCode = 409;

  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid status transition from ${from} to ${to}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export function isValidStatusTransition(from: string, to: string): to is TicketStatus {
  return (STATUS_TRANSITIONS[from as TicketStatus] as readonly string[] | undefined)?.includes(to) ?? false;
}

export function assertValidStatusTransition(from: string, to: string): asserts to is TicketStatus {
  if (!isValidStatusTransition(from, to)) {
    throw new InvalidStatusTransitionError(from, to);
  }
}
