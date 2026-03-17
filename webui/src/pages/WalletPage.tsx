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
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Wallet</h1>

      {/* Inline balance line */}
      {isLoading ? (
        <Skeleton className="h-6 w-full" />
      ) : info ? (
        <div className="flex items-center gap-2 font-mono text-sm text-[var(--text-secondary)]">
          <span>Owner: <span className="text-[var(--text-primary)]">{ownerBal}</span></span>
          <span className="text-[var(--text-muted)]">&rarr;</span>
          <span>Node: <span className="text-[var(--text-primary)]">{nodeBal}</span></span>
          <span className="text-[var(--text-muted)]">&rarr;</span>
          <span>Stake: <span className={hasStake ? 'text-[var(--green)]' : 'text-[var(--text-muted)]'}>{hasStake ? 'active' : '\u2014'}</span></span>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">Wallet not configured</p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-white/[0.06] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
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
