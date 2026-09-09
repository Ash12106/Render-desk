import { afterEach, describe, expect, it, vi } from 'vitest';
import { simulateStatusChangeNotification } from './notifications.js';

describe('notification simulation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emits a structured status-change event', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    simulateStatusChangeNotification({
      ticketId: 'ticket-1',
      ticketTitle: 'Unable to sign in',
      recipient: 'customer@example.com',
      oldStatus: 'Open',
      newStatus: 'In Progress',
    });

    expect(logSpy).toHaveBeenCalledWith('[Notification Simulation]', {
      event: 'ticket.status_changed',
      ticketId: 'ticket-1',
      ticketTitle: 'Unable to sign in',
      recipient: 'customer@example.com',
      oldStatus: 'Open',
      newStatus: 'In Progress',
      delivered: true,
    });
  });
});
