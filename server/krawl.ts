import express, { Request, Response } from 'express';
import axios from 'axios';

const router = express.Router();

// Local development uses the published Compose port; containers use http://krawl:5000.
const KRAWL_API_URL = process.env.KRAWL_API_URL;
const KRAWL_DASHBOARD_PASSWORD = process.env.KRAWL_DASHBOARD_PASSWORD;
const KRAWL_DASHBOARD_SECRET_PATH =
  '/' + (process.env.KRAWL_DASHBOARD_SECRET_PATH || '/security-dashboard-secret').replace(/^\/+|\/+$/g, '');

const krawlClient = axios.create({
  baseURL: KRAWL_API_URL,
  timeout: 10000,
  maxRedirects: 0,
  validateStatus: () => true,
});

function requireAdmin(req: Request, res: Response, next: express.NextFunction) {
  if ((req as Request & { user?: { role: string } }).user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required.', data: null });
  }
  next();
}

class KrawlError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
  ) {
    super(message);
  }
}

function checkResponse(status: number, data: unknown, operation: string) {
  if (status !== 200) {
    throw new KrawlError(
      status === 401 || status === 403
        ? 'Krawl rejected authentication. Check the dashboard password and session configuration.'
        : status === 404
          ? 'Krawl endpoint not found. Check the dashboard path and deployed Krawl API version.'
          : 'Krawl ' + operation + ' returned HTTP ' + status + '.',
    );
  }
  if (!data || typeof data !== 'object' || (data as { success?: boolean }).success === false) {
    throw new KrawlError(
      'Krawl ' + operation + ' returned an invalid response. Check the configured service URL and API version.',
    );
  }
}

function sendFailure(res: Response, error: unknown, health = false) {
  // Do not log Axios request objects: they contain the upstream password and cookies.
  const message =
    error instanceof KrawlError
      ? error.message
      : 'Unable to connect to Krawl. Check that the service is running and KRAWL_API_URL is reachable from the app server (local Compose port: 5001; container port: 5000).';
  res.status(error instanceof KrawlError ? error.statusCode : 503).json({
    success: false,
    message,
    ...(health ? { status: 'unhealthy' } : { data: null }),
  });
}

async function getDashboardData(endpoint: string, params?: Record<string, unknown>) {
  if (!KRAWL_API_URL || !KRAWL_DASHBOARD_PASSWORD) {
    throw new KrawlError('Krawl configuration is incomplete. Set KRAWL_API_URL and KRAWL_DASHBOARD_PASSWORD.');
  }
  const auth = await krawlClient.post(KRAWL_DASHBOARD_SECRET_PATH + '/api/auth', {
    password: KRAWL_DASHBOARD_PASSWORD,
  });
  checkResponse(auth.status, auth.data, 'authentication');
  // Axios in Node does not retain cookies, even with withCredentials: true.
  const cookies = auth.headers['set-cookie'];
  const cookie = (Array.isArray(cookies) ? cookies : cookies ? [cookies] : [])
    .map((value: string) => value.split(';')[0])
    .filter(Boolean)
    .join('; ');
  if (!cookie)
    throw new KrawlError('Krawl authentication did not return a session cookie. Check the deployed Krawl API version.');

  const response = await krawlClient.get(KRAWL_DASHBOARD_SECRET_PATH + endpoint, {
    params,
    headers: { Cookie: cookie },
  });
  checkResponse(response.status, response.data, 'API');
  return response.data;
}

router.get('/api/admin/krawl/health', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const response = await krawlClient.get(KRAWL_DASHBOARD_SECRET_PATH + '/healthz');
    if (response.status === 404) {
      throw new KrawlError('Krawl endpoint not found. Check the dashboard path and deployed Krawl API version.');
    }
    if (response.status !== 200 || response.data?.status !== 'ok') {
      throw new KrawlError('Krawl health check returned an unexpected response.');
    }
    res.json({ success: true, status: 'healthy', message: 'Krawl service is running' });
  } catch (error) {
    sendFailure(res, error, true);
  }
});

router.get('/api/admin/krawl/stats', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [attacks, ips, attackers, honeypot, credentials, paths] = await Promise.all([
      getDashboardData('/api/attack-types?page=1&page_size=1'),
      getDashboardData('/api/all-ips?page=1&page_size=1'),
      getDashboardData('/api/attackers?page=1&page_size=1'),
      getDashboardData('/api/honeypot?page=1&page_size=1'),
      getDashboardData('/api/credentials?page=1&page_size=1'),
      getDashboardData('/api/top-paths?page=1&page_size=1'),
    ]);
    res.json({
      success: true,
      data: {
        total_accesses: attacks.pagination?.total,
        unique_ips: ips.pagination?.total,
        unique_paths: paths.pagination?.total,
        suspicious_accesses: attacks.pagination?.total,
        honeypot_caught: honeypot.pagination?.total,
        credentials_captured: credentials.pagination?.total,
        unique_attackers: attackers.pagination?.total_attackers,
      },
    });
  } catch (error) {
    sendFailure(res, error);
  }
});

// Preserve the existing API contract, but never turn upstream failures into empty results.
for (const [route, endpoint, key, defaultLimit] of [
  ['activities', '/api/attack-types', 'attacks', 20],
  ['ips', '/api/all-ips', 'ips', 50],
  ['credentials', '/api/credentials', 'credentials', 50],
] as const) {
  router.get('/api/admin/krawl/' + route, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { page = 1, limit = defaultLimit, category } = req.query;
      const params: Record<string, unknown> = { page, limit };
      if (route === 'ips' && typeof category === 'string') params.category = category;
      const response = await getDashboardData(endpoint, params);
      const data = Array.isArray(response) ? response : (response.items ?? response[key]);
      if (!Array.isArray(data)) {
        throw new KrawlError('Krawl returned an unexpected list format. Check the deployed Krawl API version.');
      }
      res.json({ success: true, data });
    } catch (error) {
      sendFailure(res, error);
    }
  });
}

export default router;
