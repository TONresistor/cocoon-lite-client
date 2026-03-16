import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSSE, type SSEEvent } from './useSSE';
import { QK } from '../lib/queryKeys';

const LIFECYCLE_QUERIES = [QK.clientStatus, QK.jsonStats, QK.models];

const EVENT_QUERY_MAP: Record<string, readonly (readonly string[])[]> = {
  starting: LIFECYCLE_QUERIES,
  stopping: LIFECYCLE_QUERIES,
  stopped: LIFECYCLE_QUERIES,
  fatal: LIFECYCLE_QUERIES,
  exit: LIFECYCLE_QUERIES,
  initialized: LIFECYCLE_QUERIES,
  connection_ready: [QK.clientStatus, QK.jsonStats, QK.models],
  proxy_ready: [QK.clientStatus, QK.jsonStats, QK.models],
  proxy_connecting: [QK.jsonStats],
  staked: [QK.jsonStats, QK.walletInfo],
  ton_synced: [QK.jsonStats, QK.walletInfo],
  listening: [QK.clientStatus],
};

const DEFAULT_QUERIES = [QK.clientStatus];

export function useSSEQuerySync(url?: string) {
  const queryClient = useQueryClient();

  const onEvent = useCallback(
    (event: SSEEvent) => {
      const keys = EVENT_QUERY_MAP[event.type] || DEFAULT_QUERIES;
      for (const queryKey of keys) {
        // refetchQueries forces an immediate refetch — more reliable than
        // invalidateQueries which can skip queries stuck in error/fetching state.
        queryClient.refetchQueries({ queryKey: [...queryKey], type: 'active' });
      }
    },
    [queryClient],
  );

  return useSSE(url, onEvent);
}
