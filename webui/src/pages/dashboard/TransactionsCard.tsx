import { useQuery } from '@tanstack/react-query';
import { toncenterApi, type ToncenterAction } from '../../lib/api';
import { formatTon } from '../../lib/format';
import { QK } from '../../lib/queryKeys';
import { cn } from '../../lib/utils';
import { ArrowDownLeft, ArrowUpRight, Circle } from 'lucide-react';

// --- Label + color mapping ---

const ACTION_META: Record<string, { label: string; color: string; direction: 'in' | 'out' | 'neutral' }> = {
  cocoon_client_top_up:            { label: 'Top Up',           color: 'text-blue-400',   direction: 'out' },
  cocoon_client_increase_stake:    { label: 'Stake',            color: 'text-blue-400',   direction: 'out' },
  cocoon_client_withdraw:          { label: 'Withdraw',         color: 'text-amber-400',  direction: 'in' },
  cocoon_worker_payout:            { label: 'Worker Payout',    color: 'text-green-400',  direction: 'in' },
  cocoon_proxy_payout:             { label: 'Proxy Payout',     color: 'text-green-400',  direction: 'in' },
  cocoon_proxy_charge:             { label: 'Proxy Charge',     color: 'text-amber-400',  direction: 'out' },
  cocoon_register_proxy:           { label: 'Register Proxy',   color: 'text-zinc-400',   direction: 'neutral' },
  cocoon_unregister_proxy:         { label: 'Unregister Proxy', color: 'text-zinc-400',   direction: 'neutral' },
  cocoon_client_register:          { label: 'Register',         color: 'text-zinc-400',   direction: 'neutral' },
  cocoon_client_request_refund:    { label: 'Request Refund',   color: 'text-amber-400',  direction: 'in' },
  cocoon_grant_refund:             { label: 'Grant Refund',     color: 'text-green-400',  direction: 'in' },
  cocoon_client_change_secret_hash:{ label: 'Change Secret',    color: 'text-zinc-400',   direction: 'neutral' },
};

function getMeta(type: string) {
  return ACTION_META[type] ?? { label: type.replace(/^cocoon_/, '').replace(/_/g, ' '), color: 'text-zinc-500', direction: 'neutral' as const };
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
  if (direction === 'in') return <ArrowDownLeft size={10} className="text-green-500" />;
  if (direction === 'out') return <ArrowUpRight size={10} className="text-amber-500" />;
  return <Circle size={6} className="text-zinc-600" />;
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">
          On-Chain Activity
        </span>
        <span className="font-mono text-xs text-green-400">
          Earned: {earnedTon} TON
        </span>
      </div>

      {/* Body */}
      <div className="mt-3 max-h-52 space-y-0.5 overflow-y-auto">
        {histLoading ? (
          <p className="text-xs text-zinc-600">Loading...</p>
        ) : actions.length === 0 ? (
          <p className="text-xs text-zinc-600">No on-chain activity yet</p>
        ) : (
          actions.map((action, i) => {
            const meta = getMeta(action.type);
            const amount = action.details?.amount;
            return (
              <div
                key={action.traceId || i}
                className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-zinc-800/50"
              >
                <DirectionIcon direction={meta.direction} />
                <span className={cn('w-28 shrink-0 truncate text-xs', meta.color)}>
                  {meta.label}
                </span>
                {amount && (
                  <span className="font-mono text-xs text-zinc-300">
                    {formatTon(amount)} TON
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[10px] text-zinc-600">
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
