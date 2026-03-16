import { useQuery } from '@tanstack/react-query';
import { clientApi, proxyApi, walletApi, type JsonStats } from '../lib/api';
import { formatTon } from '../lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { useSSEEvents } from '../hooks/useSSEContext';
import { usePollingInterval } from '../hooks/usePollingInterval';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';

// Lifecycle phases — derived from jsonstats data, not SSE events
const LIFECYCLE_PHASES = [
  { key: 'running', label: 'Running' },
  { key: 'ton_synced', label: 'TON Synced' },
  { key: 'responding', label: 'Initialized' },
  { key: 'proxy_connected', label: 'Proxy Connected' },
  { key: 'staked', label: 'Staked' },
] as const;

/**
 * Derive lifecycle phase index from jsonstats data.
 * This is reliable — based on actual state, not log pattern matching.
 */
function derivePhaseFromStats(
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

export default function Dashboard() {
  const { events } = useSSEEvents();
  const pollingInterval = usePollingInterval();

  const { data: clientStatus, isLoading: clientLoading } = useQuery({
    queryKey: ['clientStatus'],
    queryFn: clientApi.getStatus,
    refetchInterval: pollingInterval,
  });

  const isRunning = clientStatus?.running === true;

  const { data: stats } = useQuery({
    queryKey: ['jsonStats'],
    queryFn: proxyApi.getJsonStats,
    refetchInterval: pollingInterval,
    enabled: isRunning,
  });

  const { data: walletInfo, isLoading: walletLoading } = useQuery({
    queryKey: ['walletInfo'],
    queryFn: walletApi.getInfo,
    refetchInterval: pollingInterval,
  });

  const { data: models } = useQuery({
    queryKey: ['models'],
    queryFn: proxyApi.getModels,
    enabled: isRunning,
    refetchInterval: pollingInterval,
  });

  // Derive lifecycle phase from actual data
  const phaseIndex = derivePhaseFromStats(isRunning, stats);
  const isFullyReady = phaseIndex >= 4;

  // Proxy details from jsonstats
  const proxyConn = stats?.proxy_connections?.[0];
  const proxyInfo = stats?.proxies?.[0];
  const isProxyReady = proxyConn?.is_ready === true;
  const isStaked = (proxyInfo?.tokens_payed ?? 0) > 0;

  // Human-readable status
  const statusLabel = !isRunning
    ? 'Stopped'
    : isFullyReady
      ? 'Ready'
      : phaseIndex >= 3
        ? 'Proxy Connected'
        : phaseIndex >= 2
          ? 'Waiting for Proxy...'
          : phaseIndex >= 1
            ? 'TON Synced'
            : 'Starting...';

  const statusVariant: 'success' | 'default' | 'secondary' = isFullyReady
    ? 'success'
    : isRunning
      ? 'default'
      : 'secondary';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {/* Status */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          {clientLoading ? (
            <Skeleton className="h-14 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">Status</span>
                <Badge variant={statusVariant} className="text-[10px] px-2 py-0">{statusLabel}</Badge>
              </div>
              {isRunning && !isFullyReady && (
                <div className="mt-2.5 flex items-center gap-1.5">
                  {LIFECYCLE_PHASES.map((phase, i) => (
                    <div
                      key={phase.key}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        i <= phaseIndex
                          ? 'bg-ton-blue'
                          : i === phaseIndex + 1
                            ? 'bg-ton-blue animate-pulse'
                            : 'bg-zinc-700',
                      )}
                    />
                  ))}
                  <span className="ml-1 text-[11px] text-zinc-500">
                    {LIFECYCLE_PHASES[phaseIndex]?.label ?? 'Starting'}
                  </span>
                </div>
              )}
              <div className="mt-2.5 flex items-center gap-3 text-[11px] text-zinc-500">
                {clientStatus?.uptime != null && clientStatus.uptime > 0 && (
                  <span>
                    {clientStatus.uptime >= 3600
                      ? `${Math.floor(clientStatus.uptime / 3600)}h ${Math.floor((clientStatus.uptime % 3600) / 60)}m`
                      : clientStatus.uptime >= 60
                        ? `${Math.floor(clientStatus.uptime / 60)}m ${clientStatus.uptime % 60}s`
                        : `${clientStatus.uptime}s`}
                  </span>
                )}
                {clientStatus?.httpPort && (
                  <span className="font-mono">:{clientStatus.httpPort}</span>
                )}
                {stats?.status?.ton_last_synced_at ? (
                  <span>
                    synced {new Date(stats.status.ton_last_synced_at * 1000).toLocaleTimeString()}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Balances */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          {walletLoading ? (
            <Skeleton className="h-14 w-full" />
          ) : walletInfo ? (
            <>
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">Balances</span>
              <div className="mt-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Owner</span>
                  <span className="font-mono text-sm text-zinc-200">
                    {walletInfo.owner.balance ? formatTon(walletInfo.owner.balance.nano) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">COCOON</span>
                  <span className="font-mono text-sm text-zinc-200">
                    {walletInfo.cocoon.balance ? formatTon(walletInfo.cocoon.balance.nano) : '—'}
                  </span>
                </div>
                {stats?.wallet?.balance != null && (
                  <div className="flex items-center justify-between border-t border-zinc-800 pt-1.5">
                    <span className="text-xs text-zinc-500">Staking</span>
                    <span className="font-mono text-sm text-zinc-200">
                      {formatTon(stats.wallet.balance.toString())}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">Balances</span>
              <p className="mt-2.5 text-xs text-zinc-600">No wallet</p>
            </>
          )}
        </div>

        {/* Proxy */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">Proxy</span>
            {isRunning && stats && (
              <Badge variant={isProxyReady ? 'success' : 'secondary'} className="text-[10px] px-2 py-0">
                {isProxyReady ? 'Connected' : proxyConn ? 'Connecting' : 'Waiting'}
              </Badge>
            )}
          </div>
          {!isRunning ? (
            <p className="mt-2.5 text-xs text-zinc-600">Offline</p>
          ) : !stats ? (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-zinc-500">
              <Loader2 size={10} className="animate-spin" />
              Waiting...
            </div>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Staking</span>
                <span className={cn('text-xs font-medium', isStaked ? 'text-green-400' : 'text-zinc-500')}>
                  {isStaked ? 'Active' : 'Pending'}
                </span>
              </div>
              {proxyInfo && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Tokens</span>
                  <span className="font-mono text-xs text-zinc-400">{proxyInfo.tokens_payed}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Active</span>
                <span className="text-xs text-zinc-400">
                  {stats.root_contract_config?.registered_proxies?.length ?? 0} proxies
                </span>
              </div>
              {proxyConn?.address && (
                <p className="truncate font-mono text-[10px] text-zinc-600">{proxyConn.address}</p>
              )}
            </div>
          )}
        </div>

        {/* Models */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:col-span-2 lg:col-span-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">Models</span>
          {models?.data?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {models.data.map((m) => (
                <span key={m.id} className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  {m.id}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-600">
              {isRunning
                ? isProxyReady
                  ? 'No models yet'
                  : 'Waiting for proxy...'
                : 'Start client to load models'}
            </p>
          )}
        </div>
      </div>

      {/* Events Log */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
              {events.slice(-30).reverse().map((evt, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="shrink-0 text-zinc-600">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge
                    variant={
                      evt.type === 'fatal' || evt.type === 'error'
                        ? 'destructive'
                        : evt.type === 'connection_ready' || evt.type === 'proxy_ready'
                          ? 'success'
                          : 'secondary'
                    }
                    className="shrink-0 text-[10px]"
                  >
                    {evt.type}
                  </Badge>
                  <span className="text-zinc-400">{evt.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
