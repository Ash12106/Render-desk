import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const KRAWL_API_BASE = '/api/admin/krawl';

// Hook for fetching Krawl stats (admin only)
export const useKrawlStats = () => {
  return useQuery({
    queryKey: ['krawl', 'admin-stats'],
    queryFn: async () => {
      const response = await axios.get(`${KRAWL_API_BASE}/stats`);
      return response.data.data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};

// Hook for fetching recent activities (admin only)
export const useKrawlActivities = (page = 1) => {
  return useQuery({
    queryKey: ['krawl', 'admin-activities', page],
    queryFn: async () => {
      const response = await axios.get(`${KRAWL_API_BASE}/activities`, {
        params: { page, limit: 20 },
      });
      return response.data.data;
    },
    refetchInterval: 20000, // Refetch every 20 seconds
  });
};

// Hook for fetching IP reputation data (admin only)
export const useKrawlIPs = (page = 1, category?: string) => {
  return useQuery({
    queryKey: ['krawl', 'admin-ips', page, category],
    queryFn: async () => {
      const response = await axios.get(`${KRAWL_API_BASE}/ips`, {
        params: { page, limit: 50, ...(category && { category }) },
      });
      return response.data.data;
    },
    refetchInterval: 60000, // Refetch every 60 seconds
  });
};

// Hook for fetching Krawl service health (admin only)
export const useKrawlHealth = () => {
  return useQuery({
    queryKey: ['krawl', 'admin-health'],
    queryFn: async () => {
      const response = await axios.get(`${KRAWL_API_BASE}/health`);
      return response.data;
    },
    refetchInterval: 10000, // Check every 10 seconds
  });
};

// Hook for getting dashboard path
export const useKrawlDashboardPath = () => {
  return useQuery({
    queryKey: ['krawl', 'dashboardPath'],
    queryFn: async () => {
      const response = await axios.get(`${KRAWL_API_BASE}/dashboard-path`);
      return response.data;
    },
  });
};

// Hook for authenticating with Krawl
export const useKrawlAuth = () => {
  return async (password: string) => {
    const response = await axios.post(`${KRAWL_API_BASE}/auth`, { password });
    return response.data;
  };
};
