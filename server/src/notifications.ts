import { Notification } from '../models/mongo.js';
import type mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { logger } from './observability/logger.js';

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

/**
 * Delivers a status update after its in-app notification is committed. Email is
 * optional: development and in-app notifications continue to work without SMTP.
 */
export async function deliverCustomerStatusEmail(notification: StatusChangeNotification) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;
  const recipient = notification.recipient.trim().toLowerCase();
  const validRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) && recipient !== 'customer@example.com';
  if (!host || !user || !pass || !from || !validRecipient) {
    logger.info('notification_email_skipped', { ticketId: notification.ticketId, reason: 'smtp_not_configured' });
    return { delivered: false, reason: 'smtp_not_configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: recipient,
      subject: `Ticket update: ${notification.ticketTitle}`,
      text: `Your ticket "${notification.ticketTitle}" moved from ${notification.oldStatus} to ${notification.newStatus}.`,
    });
    logger.info('notification_email_delivered', { ticketId: notification.ticketId });
    return { delivered: true };
  } catch (error) {
    logger.warn('notification_email_failed', {
      ticketId: notification.ticketId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return { delivered: false, reason: 'delivery_failed' };
  }
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
