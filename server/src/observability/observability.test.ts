import { describe, expect, it } from 'vitest';
import { livenessHandler } from './health.js';
import { requestContext } from './requestContext.js';

function responseRecorder() {
  let body: unknown;
  const headers = new Map<string, string>();
  return {
    response: {
      json(value: unknown) {
        body = value;
      },
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    },
    getBody: () => body,
    getHeader: (name: string) => headers.get(name),
  };
}

describe('observability helpers', () => {
  it('returns a liveness response without depending on MongoDB', () => {
    const recorder = responseRecorder();
    livenessHandler({} as any, recorder.response as any);
    expect(recorder.getBody()).toMatchObject({ status: 'ok', service: 'support-ops-desk' });
  });

  it('preserves a safe caller request ID and returns it in the response', () => {
    const recorder = responseRecorder();
    const request = { header: () => 'request_12345678' } as any;
    let nextCalled = false;
    requestContext(request, recorder.response as any, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(request.requestId).toBe('request_12345678');
    expect(recorder.getHeader('X-Request-Id')).toBe('request_12345678');
  });

  it('replaces malformed caller request IDs', () => {
    const recorder = responseRecorder();
    const request = { header: () => 'unsafe id with spaces' } as any;
    requestContext(request, recorder.response as any, () => undefined);
    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(recorder.getHeader('X-Request-Id')).toBe(request.requestId);
  });
});
