import type { JsonStats } from './api';

/**
 * Derive lifecycle phase index from jsonstats data.
 * This is reliable — based on actual state, not log pattern matching.
 *
 * Returns -1 if not running, 0-4 for lifecycle phases.
 */
export function derivePhaseFromStats(
  running: boolean,
  stats: JsonStats | undefined,
): number {
  if (!running) return -1;

  // Phase 0: Running (client process started)
  if (!stats) return 0;

  // Phase 1: TON Synced (ton_last_synced_at > 0)
  const tonSynced = stats.status?.ton_last_synced_at > 0;
  if (!tonSynced) return 0;

  // Phase 2: Responding (we got a jsonstats response = client initialized)
  // Always true if we have stats
  const hasProxyConn = stats.proxy_connections?.length > 0;
  if (!hasProxyConn) return 2;

  // Phase 3: Proxy connected (is_ready = true)
  const proxyReady = stats.proxy_connections[0]?.is_ready === true;
  if (!proxyReady) return 2;

  // Phase 4: Staked (tokens_payed > 0)
  const staked = (stats.proxies?.[0]?.tokens_payed ?? 0) > 0;
  if (!staked) return 3;

  return 4;
}
