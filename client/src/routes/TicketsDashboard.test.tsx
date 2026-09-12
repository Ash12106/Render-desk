/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TicketsDashboard } from './TicketsDashboard';
import { api } from '@/src/api';
import { ToastProvider } from '@/src/components/ui/Toast';
import React from 'react';

// Mock the API client
vi.mock('@/src/api', () => ({
  api: {
    getTickets: vi.fn(),
    getCustomers: vi.fn(),
    getTicketStats: vi.fn(),
  },
}));

describe('TicketsDashboard', () => {
  const renderDashboard = (initialEntry = '/tickets') => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <TicketsDashboard />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  };

  const mockTickets = [
    {
      id: 1,
      customerId: 1,
      customerName: 'Test Customer',
      title: 'First Test Ticket',
      description: 'Desc 1',
      priority: 'High',
      status: 'Open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state initially', () => {
    (api.getTickets as any).mockImplementation(() => new Promise(() => {})); // pending promise
    (api.getCustomers as any).mockResolvedValue([]);
    (api.getTicketStats as any).mockResolvedValue({ status: [], priority: [], resolution: [] });

    renderDashboard();

    // Our loading skeleton doesn't have text, but we can verify it doesn't show "No tickets" immediately
    expect(screen.queryByText('No tickets exist yet.')).toBeNull();
  });

  it('renders tickets after loading', async () => {
    (api.getTickets as any).mockResolvedValue({ tickets: mockTickets, total: 1 });
    (api.getCustomers as any).mockResolvedValue([{ id: 1, name: 'Test Customer' }]);
    (api.getTicketStats as any).mockResolvedValue({ status: [], priority: [], resolution: [] });

    renderDashboard();

    // Wait for tickets to load
    await waitFor(() => {
      expect(screen.getAllByText('First Test Ticket').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText(/Test Customer/i).length).toBeGreaterThan(0);
  });

  it('renders empty state if no tickets', async () => {
    (api.getTickets as any).mockResolvedValue({ tickets: [], total: 0 });
    (api.getCustomers as any).mockResolvedValue([]);
    (api.getTicketStats as any).mockResolvedValue({ status: [], priority: [], resolution: [] });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No tickets exist yet.')).toBeDefined();
    });
  });

  it('renders the kanban columns and status fallback control', async () => {
    (api.getTickets as any).mockResolvedValue({ tickets: mockTickets, total: 1 });
    (api.getCustomers as any).mockResolvedValue([{ id: 1, name: 'Test Customer' }]);
    (api.getTicketStats as any).mockResolvedValue({ status: [], priority: [], resolution: [] });

    renderDashboard('/tickets?view=kanban');

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Open tickets' })).toBeDefined();
      expect(screen.getByRole('region', { name: 'In Progress tickets' })).toBeDefined();
      expect(screen.getByRole('region', { name: 'Resolved tickets' })).toBeDefined();
      expect(screen.getByRole('region', { name: 'Closed tickets' })).toBeDefined();
      expect(screen.getByRole('combobox', { name: 'Move First Test Ticket to status' })).toBeDefined();
    });
  });
});
