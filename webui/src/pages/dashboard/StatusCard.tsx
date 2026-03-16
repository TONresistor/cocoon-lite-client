import type { ClientStatus, JsonStats } from '../../lib/api';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import { formatUptime } from '../../lib/format';

const LIFECYCLE_PHASES = [
  { key: 'running', label: 'Running' },
  { key: 'ton_synced', label: 'TON Synced' },
  { key: 'responding', label: 'Initialized' },
  { key: 'proxy_connected', label: 'Proxy Connected' },
  { key: 'staked', label: 'Staked' },
] as const;

interface Props {
  clientStatus: ClientStatus | undefined;
  clientLoading: boolean;
  isRunning: boolean;
  stats: JsonStats | undefined;
  phaseIndex: number;
  isFullyReady: boolean;
}

export default function StatusCard({
  clientStatus,
  clientLoading,
  isRunning,
  stats,
  phaseIndex,
  isFullyReady,
}: Props) {
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
              <span>{formatUptime(clientStatus.uptime)}</span>
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
  );
}
