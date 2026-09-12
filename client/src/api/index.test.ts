/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './index';

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('API response handling', () => {
  it('returns database records unchanged', async () => {
    const records = [{ id: 'customer-id', name: 'Customer from database' }];
    respond(records);
    await expect(api.getCustomers()).resolves.toEqual(records);
  });
  it('sends the current account on requests', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'staff-id' }));
    const fetchMock = respond([]);
    await api.getCustomers();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/customers',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer staff-id' }),
      }),
    );
  });
  it('tolerates malformed local storage', async () => {
    localStorage.setItem('auth_user', '{');
    respond([]);
    await expect(api.getCustomers()).resolves.toEqual([]);
  });
  it('does not disguise a database outage as empty data', async () => {
    respond({ success: false, message: 'Database unavailable', data: null }, 503);
    await expect(api.getCustomers()).rejects.toThrow('Database unavailable');
  });
  it('rejects failure envelopes even with a successful HTTP status', async () => {
    respond({ success: false, message: 'Failed to fetch records', data: [] });
    await expect(api.getCustomers()).rejects.toThrow('Failed to fetch records');
  });
  it('rejects HTML served in place of API JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>App</html>')));
    await expect(api.getCustomers()).rejects.toThrow('invalid response');
  });
  it('accepts a successful deletion with no response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.deleteTicket('ticket-id')).resolves.toBeUndefined();
  });
  it('preserves field validation details', async () => {
    respond({ success: false, message: 'Validation failed', fields: { title: 'Required' } }, 400);
    await expect(api.createTicket({})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { title: 'Required' },
    });
  });
});
