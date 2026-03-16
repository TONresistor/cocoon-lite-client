import { useSSEEvents } from './useSSEContext';

/** Aggressive polling interval when SSE is disconnected (ms). */
const POLLING_FAST = 3_000;
/** Fallback polling interval when SSE is connected (ms). */
const POLLING_SLOW = 30_000;

/**
 * Returns a refetchInterval value based on SSE connection status.
 *
 * When SSE is connected, queries are already refreshed on events so polling
 * only serves as a safety net (30 s). When SSE is disconnected, aggressive
 * polling (3 s) keeps data fresh.
 *
 * @param fastMs  - interval while SSE is down  (default 3 000)
 * @param slowMs  - interval while SSE is up    (default 30 000)
 */
export function usePollingInterval(
  fastMs: number = POLLING_FAST,
  slowMs: number = POLLING_SLOW,
): number {
  const { connected } = useSSEEvents();
  return connected ? slowMs : fastMs;
}
