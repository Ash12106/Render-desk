import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upstream = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.hoisted(() => {
  process.env.KRAWL_API_URL = 'http://krawl.test';
  process.env.KRAWL_DASHBOARD_PASSWORD = 'unit-test-password';
});
vi.mock('axios', () => ({ default: { create: vi.fn(() => upstream) } }));
import router from './krawl';

function app(role = 'admin') {
  const instance = express();
  instance.use((req, _res, next) => {
    Object.assign(req, { user: { role } });
    next();
  });
  instance.use(router);
  return instance;
}

beforeEach(() => {
  vi.resetAllMocks();
  upstream.post.mockResolvedValue({
    status: 200,
    data: { success: true },
    headers: { 'set-cookie': ['session=test-session; HttpOnly; Path=/', 'other=value; Path=/'] },
  });
});

describe('Krawl proxy', () => {
  it('checks health without dashboard authentication', async () => {
    upstream.get.mockResolvedValue({ status: 200, data: { status: 'ok' } });
    const response = await request(app()).get('/api/admin/krawl/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(upstream.post).not.toHaveBeenCalled();
  });
  it('forwards session cookies without cookie attributes', async () => {
    upstream.get.mockImplementation((url: string) => {
      if (url.includes('/attack-types'))
        return Promise.resolve({ status: 200, data: { attacks: [], pagination: { total: 12 } } });
      if (url.includes('/all-ips'))
        return Promise.resolve({ status: 200, data: { ips: [], pagination: { total: 4 } } });
      if (url.includes('/attackers'))
        return Promise.resolve({ status: 200, data: { attackers: [], pagination: { total_attackers: 2 } } });
      if (url.includes('/honeypot'))
        return Promise.resolve({ status: 200, data: { honeypots: [], pagination: { total: 3 } } });
      if (url.includes('/credentials'))
        return Promise.resolve({ status: 200, data: { credentials: [], pagination: { total: 1 } } });
      return Promise.resolve({ status: 200, data: { paths: [], pagination: { total: 5 } } });
    });
    const response = await request(app()).get('/api/admin/krawl/stats');
    expect(response.status).toBe(200);
    expect(response.body.data.total_accesses).toBe(12);
    expect(upstream.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/attack-types'),
      expect.objectContaining({
        headers: { Cookie: 'session=test-session; other=value' },
      }),
    );
  });
  it('reports unreachable services', async () => {
    upstream.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const response = await request(app()).get('/api/admin/krawl/health');
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ success: false, status: 'unhealthy' });
  });
  it('reports incorrect endpoints', async () => {
    upstream.get.mockResolvedValue({ status: 404, data: {} });
    const response = await request(app()).get('/api/admin/krawl/health');
    expect(response.status).toBe(502);
    expect(response.body.message).toContain('endpoint not found');
  });
  it.each(['stats', 'activities', 'ips', 'credentials'])(
    'does not disguise upstream failure as empty %s',
    async (route) => {
      upstream.get.mockResolvedValue({ status: 500, data: {} });
      const response = await request(app()).get('/api/admin/krawl/' + route);
      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({ success: false, data: null });
    },
  );
  it('rejects authentication without a session', async () => {
    upstream.post.mockResolvedValue({ status: 200, data: { success: true }, headers: {} });
    const response = await request(app()).get('/api/admin/krawl/stats');
    expect(response.status).toBe(502);
    expect(upstream.get).not.toHaveBeenCalled();
  });
  it('rejects a login page in place of API data', async () => {
    upstream.get.mockResolvedValue({ status: 200, data: '<html>Login</html>' });
    const response = await request(app()).get('/api/admin/krawl/activities');
    expect(response.status).toBe(502);
  });
  it('preserves pagination and valid empty results', async () => {
    upstream.get.mockResolvedValue({ status: 200, data: { ips: [] } });
    const response = await request(app()).get('/api/admin/krawl/ips?page=2&limit=10&category=attacker');
    expect(response.body).toEqual({ success: true, data: [] });
    expect(upstream.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/all-ips'),
      expect.objectContaining({
        params: { page: '2', limit: '10', category: 'attacker' },
      }),
    );
  });
  it('preserves administrator access', async () => {
    const response = await request(app('staff')).get('/api/admin/krawl/health');
    expect(response.status).toBe(403);
    expect(upstream.get).not.toHaveBeenCalled();
  });
});
