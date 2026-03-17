import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi, proxyApi, walletApi, type JsonStats } from '../lib/api';
import { formatTon, formatUptime } from '../lib/format';
import { QK } from '../lib/queryKeys';
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


  const [showEventLog, setShowEventLog] = useState(false);

  const visibleEventCount = useMemo(() =>
    events.filter(e => (e.category || e.type) !== 'debug').length,
    [events]
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Status — Timeline */}
        <div className="glass-card p-5">
          {clientLoading ? (
            <Skeleton className="h-14 w-full" />
          ) : !isRunning ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Node</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
                  Stopped
                </span>
              </div>
              <p className="mt-2.5 text-[13px] text-[var(--text-secondary)]">Start your node from the sidebar.</p>
            </>
          ) : isFullyReady ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Node</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--green-dim)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--green)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)] shadow-[var(--shadow-glow-green)]" />
                  Running
                </span>
              </div>
              <p className="mt-2 text-[13px] text-[var(--text-secondary)]">Your node is running and earning.</p>
              <div className="mt-2 flex items-center gap-3 text-[13px] text-[var(--text-secondary)]">
                {clientStatus?.uptime != null && clientStatus.uptime > 0 && (
                  <span className="tabular-nums tracking-tight">{formatUptime(clientStatus.uptime)}</span>
                )}
                {clientStatus?.httpPort && (
                  <span className="font-mono tabular-nums tracking-tight">:{clientStatus.httpPort}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Node</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-dim)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[var(--shadow-glow-accent)]" />
                  Starting
                </span>
              </div>
              <div className="mt-3 space-y-0">
                {LIFECYCLE_STEPS.map((step, i) => {
                  const isDone = i < displayPhase;
                  const isCurrent = i === displayPhase;
                  return (
                    <div key={step.key} className="flex items-start gap-2.5 py-1">
                      <div className="mt-0.5 shrink-0">
                        {isDone ? (
                          <CheckCircle2 size={14} className="text-[var(--green)]" />
                        ) : isCurrent ? (
                          <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                        ) : (
                          <Circle size={14} className="text-[var(--text-muted)]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className={cn(
                          'text-xs font-medium',
                          isDone ? 'text-[var(--text-secondary)]' : isCurrent ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
                        )}>
                          {step.label}
                        </span>
                        {isCurrent && (
                          <p className="text-[13px] text-[var(--text-secondary)]">{step.desc}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Balance */}
        <div className="glass-card p-5">
          {walletLoading ? (
            <Skeleton className="h-14 w-full" />
          ) : walletInfo ? (
            <>
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Balance</span>
              <div className="mt-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[var(--text-secondary)]">Owner</span>
                    <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">reserve</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums tracking-tight text-[var(--text-primary)]">
                    {walletInfo.owner.balance ? formatTon(walletInfo.owner.balance.nano) : '\u2014'}
                  </span>
                </div>
                <div className="flex justify-center text-[10px] text-[var(--text-muted)]">&#8595;</div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[var(--text-secondary)]">Node</span>
                    <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">operating</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums tracking-tight text-[var(--text-primary)]">
                    {walletInfo.cocoon.balance ? formatTon(walletInfo.cocoon.balance.nano) : '\u2014'}
                  </span>
                </div>
                <div className="flex justify-center text-[10px] text-[var(--text-muted)]">&#8595;</div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[var(--text-secondary)]">Stake</span>
                    <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">proxy deposit</span>
                  </div>
                  <span className={cn('font-mono text-sm tabular-nums tracking-tight', isStaked ? 'text-[var(--green)]' : 'text-[var(--text-muted)]')}>
                    {isStaked ? `${tokensToTon(proxyInfo!.tokens_payed)} TON` : '\u2014'}
                  </span>
                </div>
              </div>
              {isRunning && walletInfo.cocoon.balance &&
                BigInt(walletInfo.cocoon.balance.nano) < 2_000_000_000n && (
                <div className="mt-2 flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--amber-dim)] px-2 py-1.5 text-[11px] text-[var(--amber)]">
                  <AlertTriangle size={12} className="shrink-0 text-[var(--amber)]" />
                  Node balance low — top up to avoid interruptions
                </div>
              )}
            </>
          ) : (
            <>
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Balance</span>
              <p className="mt-2.5 text-xs text-[var(--text-muted)]">No wallet</p>
            </>
          )}
        </div>

        {/* Proxy */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Proxy</span>
            {isRunning && stats && (
              isProxyReady ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--green-dim)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--green)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)] shadow-[var(--shadow-glow-green)]" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-dim)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[var(--shadow-glow-accent)]" />
                  {proxyConn ? 'Connecting' : 'Waiting'}
                </span>
              )
            )}
          </div>
          {!isRunning ? (
            <p className="mt-2.5 text-[13px] text-[var(--text-muted)]">Offline</p>
          ) : !stats ? (
            <div className="mt-2.5 flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
              <Loader2 size={10} className="animate-spin" />
              Waiting...
            </div>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">Status</span>
                {isStaked ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--green-dim)] px-2 py-0.5 text-[11px] font-medium text-[var(--green)]">Active</span>
                ) : (
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Pending</span>
                )}
              </div>
              {proxyInfo && (proxyInfo.tokens_payed ?? 0) > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)]">Deposited</span>
                    <span className="font-mono text-xs tabular-nums tracking-tight text-[var(--text-primary)]">
                      {tokensToTon(proxyInfo.tokens_payed)} TON
                      <span className="ml-1.5 text-[var(--text-muted)]">{proxyInfo.tokens_payed.toLocaleString()} tok</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)]">Consumed</span>
                    <span className="font-mono text-xs tabular-nums tracking-tight text-[var(--text-primary)]">
                      {tokensToTon(proxyInfo.tokens_used_proxy_max ?? 0)} TON
                      <span className="ml-1.5 text-[var(--text-muted)]">{(proxyInfo.tokens_used_proxy_max ?? 0).toLocaleString()} tok</span>
                    </span>
                  </div>
                  {proxyInfo.tokens_payed > 0 && (() => {
                    const remaining = Math.min(100, Math.max(0, ((proxyInfo.tokens_payed - (proxyInfo.tokens_used_proxy_max ?? 0)) / proxyInfo.tokens_payed) * 100));
                    return (
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                          <span>Remaining</span>
                          <span className="font-mono tabular-nums tracking-tight">{remaining.toFixed(1)}%</span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-[var(--accent)]"
                            style={{ width: `${remaining}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">Network</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {stats.root_contract_config?.registered_proxies?.length ?? 0} proxies
                </span>
              </div>
              {proxyConn?.address && (
                <p className="truncate font-mono text-[11px] text-[var(--text-muted)]">{proxyConn.address}</p>
              )}
            </div>
          )}
        </div>

        {/* Models */}
        <div className="glass-card p-5 md:col-span-2 lg:col-span-3">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Models</span>
          {models?.data?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {models.data.map((m) => (
                <span key={m.id} className="rounded-[var(--radius-sm)] bg-white/[0.06] px-2 py-0.5 font-mono text-[13px] text-[var(--text-primary)]">
                  {m.id}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
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
            className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
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
