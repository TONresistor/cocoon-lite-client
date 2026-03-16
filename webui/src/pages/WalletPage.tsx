import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { walletApi } from '../lib/api';
import { formatTon } from '../lib/format';
import { QK } from '../lib/queryKeys';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import { Wallet } from 'lucide-react';
import WithdrawForm from '../components/WithdrawForm';
import UnstakeFlow from '../components/UnstakeFlow';
import CashoutForm from '../components/CashoutForm';

const tabs = ['Withdraw', 'Unstake', 'Cashout'] as const;
type Tab = (typeof tabs)[number];

export default function WalletPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Withdraw');

  const { data: info, isLoading } = useQuery({
    queryKey: QK.walletInfo,
    queryFn: walletApi.getInfo,
    refetchInterval: 10000,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Wallet</h1>

      {/* Balance overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet size={18} className="text-ton-blue" />
            Balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : info ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-zinc-400">Owner</p>
                <p className="font-mono text-lg">
                  {info.owner.balance ? formatTon(info.owner.balance.nano) : '—'} TON
                </p>
                <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                  {info.owner.address}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-400">COCOON</p>
                <p className="font-mono text-lg">
                  {info.cocoon.balance ? formatTon(info.cocoon.balance.nano) : '—'} TON
                </p>
                <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                  {info.cocoon.address}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Wallet not configured</p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              activeTab === tab
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Withdraw' && <WithdrawForm cocoonBalance={info?.cocoon.balance?.nano} />}
      {activeTab === 'Unstake' && <UnstakeFlow />}
      {activeTab === 'Cashout' && <CashoutForm ownerBalance={info?.owner.balance?.nano} />}
    </div>
  );
}
