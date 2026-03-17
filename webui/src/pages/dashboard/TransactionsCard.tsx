import { useQuery } from '@tanstack/react-query';
import { toncenterApi, type ToncenterAction } from '../../lib/api';
import { formatTon } from '../../lib/format';
import { QK } from '../../lib/queryKeys';
import { cn } from '../../lib/utils';
import { ArrowDownLeft, ArrowUpRight, Circle } from 'lucide-react';

// --- Label + color mapping ---

const ACTION_META: Record<string, { label: string; color: string; direction: 'in' | 'out' | 'neutral' }> = {
  cocoon_client_top_up:            { label: 'Top Up',           color: 'text-[var(--accent)]',         direction: 'out' },
  cocoon_client_increase_stake:    { label: 'Stake',            color: 'text-[var(--accent)]',         direction: 'out' },
  cocoon_client_withdraw:          { label: 'Withdraw',         color: 'text-[var(--amber)]',          direction: 'in' },
  cocoon_worker_payout:            { label: 'Worker Payout',    color: 'text-[var(--green)]',          direction: 'in' },
  cocoon_proxy_payout:             { label: 'Proxy Payout',     color: 'text-[var(--green)]',          direction: 'in' },
  cocoon_proxy_charge:             { label: 'Proxy Charge',     color: 'text-[var(--amber)]',          direction: 'out' },
  cocoon_register_proxy:           { label: 'Register Proxy',   color: 'text-[var(--text-secondary)]', direction: 'neutral' },
  cocoon_unregister_proxy:         { label: 'Unregister Proxy', color: 'text-[var(--text-secondary)]', direction: 'neutral' },
  cocoon_client_register:          { label: 'Register',         color: 'text-[var(--text-secondary)]', direction: 'neutral' },
  cocoon_client_request_refund:    { label: 'Request Refund',   color: 'text-[var(--amber)]',          direction: 'in' },
  cocoon_grant_refund:             { label: 'Grant Refund',     color: 'text-[var(--green)]',          direction: 'in' },
  cocoon_client_change_secret_hash:{ label: 'Change Secret',    color: 'text-[var(--text-secondary)]', direction: 'neutral' },
};

function getMeta(type: string) {
  return ACTION_META[type] ?? { label: type.replace(/^cocoon_/, '').replace(/_/g, ' '), color: 'text-[var(--text-muted)]', direction: 'neutral' as const };
}

// --- Relative time ---

function timeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// --- Direction icon ---

function DirectionIcon({ direction }: { direction: 'in' | 'out' | 'neutral' }) {
  if (direction === 'in') return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--green-dim)]">
      <ArrowDownLeft size={10} className="text-[var(--green)]" />
    </span>
  );
  if (direction === 'out') return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-dim)]">
      <ArrowUpRight size={10} className="text-[var(--accent)]" />
    </span>
  );
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06]">
      <Circle size={6} className="text-[var(--text-muted)]" />
    </span>
  );
}

// --- Component ---

export default function TransactionsCard() {
  const { data: historyData, isLoading: histLoading } = useQuery({
    queryKey: QK.txHistory,
    queryFn: toncenterApi.history(20),
    refetchInterval: 60_000,
  });

  const { data: earningsData } = useQuery({
    queryKey: QK.earnings,
    queryFn: toncenterApi.earnings,
    refetchInterval: 60_000,
  });

  const actions: ToncenterAction[] = historyData?.actions?.slice(0, 10) ?? [];
  const earnedTon = earningsData?.totalNano ? formatTon(earningsData.totalNano) : '0';

  return (
    <div className="glass-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
          On-Chain Activity
        </span>
        <span className="font-mono text-xs tabular-nums tracking-tight text-[var(--green)]">
          Earned: {earnedTon} TON
        </span>
      </div>

      {/* Body */}
      <div className="mt-3 max-h-[480px] overflow-y-auto">
        {histLoading ? (
          <p className="text-xs text-[var(--text-muted)]">Loading...</p>
        ) : actions.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No on-chain activity yet</p>
        ) : (
          actions.map((action, i) => {
            const meta = getMeta(action.type);
            const amount = action.details?.amount;
            return (
              <div
                key={action.traceId || i}
                className={cn(
                  'flex h-[48px] items-center gap-2.5 px-1',
                  i < actions.length - 1 && 'border-b border-[var(--separator)]',
                )}
              >
                <DirectionIcon direction={meta.direction} />
                <span className={cn('w-28 shrink-0 truncate text-xs font-medium', meta.color)}>
                  {meta.label}
                </span>
                {amount && (
                  <span className="font-mono text-xs tabular-nums tracking-tight text-[var(--text-primary)]">
                    {formatTon(amount)} TON
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
                  {timeAgo(action.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
