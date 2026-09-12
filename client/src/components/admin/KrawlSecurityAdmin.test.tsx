/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KrawlSecurityAdmin } from './KrawlSecurityAdmin';

let client: QueryClient;
afterEach(() => {
  cleanup();
  client?.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function showDashboard(failure?: string) {
  localStorage.setItem('auth_user', JSON.stringify({ id: 'admin-id', role: 'admin' }));
  const fetchMock = vi.fn(async (url: string, _options?: RequestInit) => {
    const body = failure
      ? { success: false, message: failure, data: null }
      : url.endsWith('/health')
        ? { success: true, status: 'healthy', message: 'Krawl service is running' }
        : { success: true, data: url.endsWith('/stats') ? { total_accesses: 42 } : [] };
    return new Response(JSON.stringify(body), { status: failure ? 503 : 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <KrawlSecurityAdmin />
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('Krawl dashboard integration', () => {
  it('sends the current app account on every request', async () => {
    const fetchMock = showDashboard();
    expect(await screen.findByText('Healthy')).toBeInTheDocument();
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toContain('/api/admin/krawl/');
      expect(options?.headers).toMatchObject({ Authorization: 'Bearer admin-id' });
    }
  });
  it('shows errors instead of false empty results', async () => {
    showDashboard('Unable to connect to Krawl');
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(4));
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No suspicious activities detected')).not.toBeInTheDocument();
    expect(screen.queryByText('No malicious IPs detected')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
