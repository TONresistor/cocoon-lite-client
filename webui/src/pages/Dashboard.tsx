import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi, proxyApi, walletApi, type JsonStats } from '../lib/api';
import { formatTon, formatUptime } from '../lib/format';
import { QK } from '../lib/queryKeys';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { useSSEEvents } from '../hooks/useSSEContext';
import { usePollingInterval } from '../hooks/usePollingInterval';
import { cn } from '../lib/utils';
import { Loader2, AlertTriangle, CheckCircle2, Circle, ChevronDown } from 'lucide-react';
import TransactionsCard from './dashboard/TransactionsCard';
import EventLog from './dashboard/EventLog';

// Lifecycle steps — derived from jsonstats, shown as a vertical timeline
const LIFECYCLE_STEPS = [
  { key: 'starting', label: 'Starting', desc: 'Launching node processes' },
  { key: 'syncing', label: 'Syncing', desc: 'Connecting to TON blockchain' },
  { key: 'registering', label: 'Registering', desc: 'Registering client on-chain' },
  { key: 'staking', label: 'Staking', desc: 'Depositing stake on proxy (~2 min)' },
  { key: 'ready', label: 'Ready', desc: 'Node is operational' },
] as const;

function derivePhaseFromStats(
  running: boolean,
  stats: JsonStats | undefined,
): number {
  if (!running) return -1;
  if (!stats) return 0;
  // Phase 1: TON synced
  if (!(stats.status?.ton_last_synced_at > 0)) return 0;
  // Phase 2: Registering (waiting for proxy connection or stake)
  const staked = (stats.proxies?.[0]?.tokens_payed ?? 0) > 0;
  const proxyReady = stats.proxy_connections?.[0]?.is_ready === true;
  if (!staked && !proxyReady) return 2;
  // Phase 3: Staking (stake deposited, waiting for proxy to accept)
  if (staked && !proxyReady) return 3;
  // Phase 4: Ready (staked + proxy connected)
  if (staked && proxyReady) return 4;
  // Proxy connected but no stake yet (rare, transient)
  return 3;
}

export default function Dashboard() {
  const { events } = useSSEEvents();
  const pollingInterval = usePollingInterval();

  const { data: clientStatus, isLoading: clientLoading } = useQuery({
    queryKey: QK.clientStatus,
    queryFn: clientApi.getStatus,
    refetchInterval: pollingInterval,
  });

  const isRunning = clientStatus?.running === true;

  const { data: stats } = useQuery({
    queryKey: QK.jsonStats,
    queryFn: proxyApi.getJsonStats,
    refetchInterval: pollingInterval,
    enabled: isRunning,
  });

  const { data: walletInfo, isLoading: walletLoading } = useQuery({
    queryKey: QK.walletInfo,
    queryFn: walletApi.getInfo,
    refetchInterval: pollingInterval,
  });

  const { data: models } = useQuery({
    queryKey: QK.models,
    queryFn: proxyApi.getModels,
    enabled: isRunning,
    refetchInterval: pollingInterval,
  });

  // Derive lifecycle phase from actual data
  const phaseIndex = derivePhaseFromStats(isRunning, stats);

  // Animated display phase — catches up to real phase 1 step/sec
  // Initialize to phaseIndex so we don't replay the animation on tab switch
  const [displayPhase, setDisplayPhase] = useState(phaseIndex);
  const prevPhaseRef = useRef(phaseIndex);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isRunning) {
      setDisplayPhase(-1);
      prevPhaseRef.current = -1;
      return;
    }
    // Only animate when phase actually advances (real-time transition)
    if (phaseIndex > prevPhaseRef.current) {
      // If this is a big jump (e.g. mount with everything ready), skip animation
      if (phaseIndex - displayPhase > 2) {
        setDisplayPhase(phaseIndex);
        prevPhaseRef.current = phaseIndex;
        return;
      }
      if (displayPhase < phaseIndex) {
        timerRef.current = setTimeout(() => {
          setDisplayPhase(prev => Math.min(prev + 1, phaseIndex));
        }, 800);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
      }
      prevPhaseRef.current = phaseIndex;
    }
  }, [isRunning, phaseIndex, displayPhase]);

  const isFullyReady = displayPhase >= 4;

  // Proxy details from jsonstats
  const proxyConn = stats?.proxy_connections?.[0];
  const proxyInfo = stats?.proxies?.[0];
  const pricePerToken = stats?.root_contract_config?.price_per_token ?? 0;
  const tokensToTon = (tokens: number) => (tokens * pricePerToken / 1e9).toFixed(4);
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

  const [showEventLog, setShowEventLog] = useState(false);

  const visibleEventCount = useMemo(() =>
    events.filter(e => (e.category || e.type) !== 'debug').length,
    [events]
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {/* Status — Timeline */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          {clientLoading ? (
            <Skeleton className="h-14 w-full" />
          ) : !isRunning ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">Status</span>
                <Badge variant="secondary" className="text-[10px] px-2 py-0">Stopped</Badge>
              </div>
              <p className="mt-2.5 text-xs text-zinc-500">Start your node from the sidebar.</p>
            </>
          ) : isFullyReady ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">Status</span>
                <Badge variant="success" className="text-[10px] px-2 py-0">Ready</Badge>
              </div>
              <p className="mt-2 text-xs text-zinc-400">Your node is running and earning.</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
                {clientStatus?.uptime != null && clientStatus.uptime > 0 && (
                  <span>{formatUptime(clientStatus.uptime)}</span>
                )}
                {clientStatus?.httpPort && (
                  <span className="font-mono">:{clientStatus.httpPort}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">Status</span>
                <Badge variant="default" className="text-[10px] px-2 py-0">Starting...</Badge>
              </div>
              <div className="mt-3 space-y-0">
                {LIFECYCLE_STEPS.map((step, i) => {
                  const isDone = i < displayPhase;
                  const isCurrent = i === displayPhase;
                  const isPending = i > displayPhase;
                  return (
                    <div key={step.key} className="flex items-start gap-2.5 py-1">
                      <div className="mt-0.5 shrink-0">
                        {isDone ? (
                          <CheckCircle2 size={14} className="text-green-500" />
                        ) : isCurrent ? (
                          <Loader2 size={14} className="animate-spin text-ton-blue" />
                        ) : (
                          <Circle size={14} className="text-zinc-700" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className={cn(
                          'text-xs font-medium',
                          isDone ? 'text-zinc-400' : isCurrent ? 'text-zinc-100' : 'text-zinc-600',
                        )}>
                          {step.label}
                        </span>
                        {isCurrent && (
                          <p className="text-[11px] text-zinc-500">{step.desc}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
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
              <div className="mt-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-zinc-400">Owner</span>
                    <span className="ml-1.5 text-[10px] text-zinc-500">reserve</span>
                  </div>
                  <span className="font-mono text-sm text-zinc-200">
                    {walletInfo.owner.balance ? formatTon(walletInfo.owner.balance.nano) : '—'}
                  </span>
                </div>
                <div className="flex justify-center text-[10px] text-zinc-700">&#8595;</div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-zinc-400">Node</span>
                    <span className="ml-1.5 text-[10px] text-zinc-500">operating</span>
                  </div>
                  <span className="font-mono text-sm text-zinc-200">
                    {walletInfo.cocoon.balance ? formatTon(walletInfo.cocoon.balance.nano) : '—'}
                  </span>
                </div>
                <div className="flex justify-center text-[10px] text-zinc-700">&#8595;</div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-zinc-400">Stake</span>
                    <span className="ml-1.5 text-[10px] text-zinc-500">proxy deposit</span>
                  </div>
                  <span className={`font-mono text-sm ${isStaked ? 'text-green-400' : 'text-zinc-600'}`}>
                    {isStaked ? `${tokensToTon(proxyInfo!.tokens_payed)} TON` : '—'}
                  </span>
                </div>
              </div>
              {isRunning && walletInfo.cocoon.balance &&
                BigInt(walletInfo.cocoon.balance.nano) < 2_000_000_000n && (
                <div className="mt-2 flex items-center gap-1.5 rounded bg-amber-950/40 px-2 py-1.5 text-[11px] text-amber-300">
                  <AlertTriangle size={12} className="shrink-0 text-amber-400" />
                  Node balance low — top up to avoid interruptions
                </div>
              )}
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
            <p className="mt-2.5 text-xs text-zinc-500">Offline</p>
          ) : !stats ? (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-zinc-400">
              <Loader2 size={10} className="animate-spin" />
              Waiting...
            </div>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Status</span>
                <span className={cn('text-xs font-medium', isStaked ? 'text-green-400' : 'text-zinc-400')}>
                  {isStaked ? 'Active' : 'Pending'}
                </span>
              </div>
              {proxyInfo && (proxyInfo.tokens_payed ?? 0) > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Deposited</span>
                    <span className="font-mono text-xs text-zinc-300">
                      {tokensToTon(proxyInfo.tokens_payed)} TON
                      <span className="ml-1.5 text-zinc-500">{proxyInfo.tokens_payed.toLocaleString()} tok</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Consumed</span>
                    <span className="font-mono text-xs text-zinc-300">
                      {tokensToTon(proxyInfo.tokens_used_proxy_max ?? 0)} TON
                      <span className="ml-1.5 text-zinc-500">{(proxyInfo.tokens_used_proxy_max ?? 0).toLocaleString()} tok</span>
                    </span>
                  </div>
                  {proxyInfo.tokens_payed > 0 && (() => {
                    const remaining = Math.min(100, Math.max(0, ((proxyInfo.tokens_payed - (proxyInfo.tokens_used_proxy_max ?? 0)) / proxyInfo.tokens_payed) * 100));
                    return (
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                          <span>Remaining</span>
                          <span className="font-mono">{remaining.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-ton-blue"
                            style={{ width: `${remaining}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Network</span>
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

      {/* Events Log — collapsible debug section */}
      {events.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowEventLog(v => !v)}
            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronDown size={12} className={cn('transition-transform', showEventLog && 'rotate-180')} />
            Event Log ({visibleEventCount})
          </button>
          {showEventLog && <div className="mt-2"><EventLog events={events} /></div>}
        </div>
      )}

      {/* On-Chain Activity */}
      <TransactionsCard />
    </div>
  );
}
