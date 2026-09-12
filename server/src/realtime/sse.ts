import type { Request, Response } from 'express';

type EventAudience = {
  roles?: Array<'admin' | 'staff' | 'customer'>;
  customerId?: string;
  userId?: string;
};

export type WorkflowEvent = {
  type: 'ticket.created' | 'ticket.updated' | 'comment.created' | 'notification.created' | 'feedback.created';
  ticketId?: string;
  audience?: EventAudience;
};

type Subscriber = { response: Response; role: string; userId: string; customerId?: string };
const subscribers = new Set<Subscriber>();

function canReceive(subscriber: Subscriber, audience?: EventAudience) {
  if (!audience) return subscriber.role === 'admin';
  if (audience.userId && audience.userId === subscriber.userId) return true;
  if (audience.customerId && audience.customerId === subscriber.customerId) return true;
  return Boolean(audience.roles?.includes(subscriber.role as 'admin' | 'staff' | 'customer'));
}

export function eventsHandler(req: Request, res: Response) {
  const user = req.user;
  if (!user) return res.status(401).json({ success: false, message: 'Authentication required', data: null });

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const subscriber: Subscriber = {
    response: res,
    role: user.role,
    userId: user._id.toString(),
    customerId: user.customerId?.toString(),
  };
  subscribers.add(subscriber);
  res.write('event: connected\ndata: {"status":"ok"}\n\n');
  const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(subscriber);
  });
}

export function publishWorkflowEvent(event: WorkflowEvent) {
  const payload = `event: workflow\ndata: ${JSON.stringify({ type: event.type, ticketId: event.ticketId })}\n\n`;
  for (const subscriber of subscribers) {
    if (canReceive(subscriber, event.audience)) subscriber.response.write(payload);
  }
}
