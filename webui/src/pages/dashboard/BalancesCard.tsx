import type { WalletInfo, JsonStats } from '../../lib/api';
import { formatTon } from '../../lib/format';
import { Skeleton } from '../../components/ui/skeleton';

interface Props {
  walletInfo: WalletInfo | undefined;
  walletLoading: boolean;
  stats: JsonStats | undefined;
}

export default function BalancesCard({ walletInfo, walletLoading, stats }: Props) {
  return (
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
  );
}
