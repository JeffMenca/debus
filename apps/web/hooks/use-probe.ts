import { probeCreatedSchema, probeStatusSchema } from '@debus/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { probeFinished } from '@/lib/system-view';

const POLL_MS = 1500;

export function useProbe() {
  const emit = useMutation({
    mutationFn: () => apiRequest('/api/system/probes', probeCreatedSchema, { method: 'POST' }),
  });
  const probeId = emit.data?.probeId;
  const startedAt = emit.submittedAt;
  const deliveries = useQuery({
    queryKey: ['probe', probeId],
    queryFn: () => apiRequest(`/api/system/probes/${probeId}`, probeStatusSchema),
    enabled: Boolean(probeId),
    // Elapsed time is measured at each poll, so the last render always reflects the final state.
    refetchInterval: (query) =>
      probeFinished(query.state.data, query.state.dataUpdatedAt - startedAt) ? false : POLL_MS,
  });

  return {
    send: () => emit.mutate(),
    isSending: emit.isPending,
    status: deliveries.data,
    elapsedMs: deliveries.dataUpdatedAt ? deliveries.dataUpdatedAt - startedAt : 0,
    error: emit.error ?? deliveries.error,
  };
}
