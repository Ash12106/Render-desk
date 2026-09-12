import { useEffect } from 'react';

/**
 * Subscribes through authenticated SSE using fetch so the existing Authorization
 * header continues to work. The event carries only an event type and ticket ID;
 * components refetch their permitted data from the normal API.
 */
export function useWorkflowEvents(onEvent: (event: { type: string; ticketId?: string }) => void) {
  useEffect(() => {
    const saved = localStorage.getItem('auth_user');
    let account: { id?: string } | null = null;
    try {
      account = saved ? JSON.parse(saved) : null;
    } catch {
      return;
    }
    if (!account?.id) return;

    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/events', {
          headers: { Authorization: `Bearer ${account!.id}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';
          for (const message of messages) {
            const data = message.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
            if (!data) continue;
            try {
              onEvent(JSON.parse(data));
            } catch {
              // Ignore malformed stream messages and keep the subscription alive.
            }
          }
        }
      } catch {
        // The existing query polling remains the fallback when a network or proxy blocks SSE.
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [onEvent]);
}
