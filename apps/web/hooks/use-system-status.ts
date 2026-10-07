import { systemStatusSchema } from '@debus/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';

export function useSystemStatus() {
  return useQuery({
    queryKey: ['system-status'],
    queryFn: () => apiRequest('/api/sistema/estado', systemStatusSchema),
    refetchInterval: 15_000,
  });
}
