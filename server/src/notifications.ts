import { Notification } from '../models/mongo.js';
import type mongoose from 'mongoose';

export interface StatusChangeNotification {
  ticketId: string;
  ticketTitle: string;
  recipient: string;
  oldStatus: string;
  newStatus: string;
}

export function simulateStatusChangeNotification(notification: StatusChangeNotification) {
  console.log('[Notification Simulation]', {
    event: 'ticket.status_changed',
    ...notification,
    delivered: true,
  });
}

export async function queueCustomerStatusNotification(
  notification: StatusChangeNotification & { customerId: mongoose.Types.ObjectId },
  session: mongoose.ClientSession,
) {
  const [saved] = await Notification.create(
    [
      {
        customerId: notification.customerId,
        ticketId: notification.ticketId,
        type: 'STATUS_CHANGE',
        message: `Your ticket "${notification.ticketTitle}" moved from ${notification.oldStatus} to ${notification.newStatus}.`,
      },
    ],
    { session },
  );
  return saved;
}
