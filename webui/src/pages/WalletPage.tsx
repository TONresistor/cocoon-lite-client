import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { walletApi, proxyApi, clientApi } from '../lib/api';
import { formatTon } from '../lib/format';
import { QK } from '../lib/queryKeys';
import { usePollingInterval } from '../hooks/usePollingInterval';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import StakeForm from '../components/StakeForm';
import WithdrawAllForm from '../components/WithdrawAllForm';

const tabs = [
  { key: 'deposit', label: 'Deposit' },
  { key: 'withdraw', label: 'Withdraw' },
] as const;
type Tab = (typeof tabs)[number]['key'];

export default function WalletPage() {
  const [activeTab, setActiveTab] = useState<Tab>('deposit');
  const pollingInterval = usePollingInterval();

  const { data: info, isLoading } = useQuery({
    queryKey: QK.walletInfo,
    queryFn: walletApi.getInfo,
    refetchInterval: pollingInterval,
  });

  const { data: clientStatus } = useQuery({
    queryKey: QK.clientStatus,
    queryFn: clientApi.getStatus,
    refetchInterval: pollingInterval,
  });

  const { data: stats } = useQuery({
    queryKey: QK.jsonStats,
    queryFn: proxyApi.getJsonStats,
    refetchInterval: pollingInterval,
    enabled: clientStatus?.running === true,
  });

  const ownerBal = info?.owner.balance ? formatTon(info.owner.balance.nano) : '0';
  const nodeBal = info?.cocoon.balance ? formatTon(info.cocoon.balance.nano) : '0';
  const hasStake = (stats?.proxies?.[0]?.tokens_payed ?? 0) > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Wallet</h1>

      {/* Inline balance line */}
      {isLoading ? (
        <Skeleton className="h-6 w-full" />
      ) : info ? (
        <div className="flex items-center gap-2 font-mono text-sm text-zinc-400">
          <span>Owner: <span className="text-zinc-200">{ownerBal}</span></span>
          <span className="text-zinc-600">&rarr;</span>
          <span>Node: <span className="text-zinc-200">{nodeBal}</span></span>
          <span className="text-zinc-600">&rarr;</span>
          <span>Stake: <span className={hasStake ? 'text-green-400' : 'text-zinc-500'}>{hasStake ? 'active' : '\u2014'}</span></span>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Wallet not configured</p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'deposit' && <StakeForm ownerAddress={info?.owner.address} ownerBalance={info?.owner.balance?.nano} />}
      {activeTab === 'withdraw' && <WithdrawAllForm info={info} />}
    </div>
  );
}
