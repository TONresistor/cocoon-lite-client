import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { setupApi } from '../../lib/api';
import { formatTon } from '../../lib/format';
import { QK } from '../../lib/queryKeys';
import { Copy, Check, Coins } from 'lucide-react';
import type { SetupData } from './SetupWizard';

interface Props {
  data: SetupData;
  next: () => void;
  back: () => void;
}

export default function FundStep({ data, next, back }: Props) {
  const [copied, setCopied] = useState(false);

  const { data: balance } = useQuery({
    queryKey: [...QK.balance, data.ownerAddress],
    queryFn: () => setupApi.getBalance(data.ownerAddress),
    refetchInterval: 5000,
    enabled: !!data.ownerAddress,
  });

  const MIN_FUND = 20_000_000_000n; // 20 TON
  const currentBalance = balance ? BigInt(balance.nano) : 0n;
  const hasFunds = currentBalance >= MIN_FUND;
  const hasPartial = currentBalance > 0n && !hasFunds;

  const copyAddress = () => {
    navigator.clipboard.writeText(data.ownerAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins size={20} className="text-[var(--accent)]" />
            Fund Owner Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-[var(--text-primary)]">Send at least 20 TON to your owner wallet</p>
            <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
              <li>15 TON — minimum stake deposit</li>
              <li>3 TON — gas fees (registration + staking transactions)</li>
              <li>2 TON — node operating balance</li>
              <li>0.5 TON — owner wallet gas reserve</li>
            </ul>
          </div>

          <p className="text-sm text-[var(--text-secondary)]">
            Send TON to the address below. The balance will update automatically.
          </p>

          <div className="flex items-center gap-2 rounded bg-white/[0.06] p-3">
            <code className="flex-1 break-all text-xs text-[var(--text-primary)]">
              {data.ownerAddress}
            </code>
            <button
              onClick={copyAddress}
              className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-secondary)]">Balance:</span>
            {balance ? (
              <Badge variant={hasFunds ? 'success' : 'secondary'}>
                {formatTon(balance.nano)} TON
              </Badge>
            ) : (
              <span className="text-sm text-[var(--text-muted)]">Checking...</span>
            )}
          </div>

          {hasFunds && (
            <Alert variant="success">
              <AlertDescription>
                Detected {formatTon(balance!.nano)} TON. You can proceed.
              </AlertDescription>
            </Alert>
          )}
          {hasPartial && (
            <Alert variant="warning">
              <AlertDescription>
                {formatTon(balance!.nano)} TON detected — need at least 20 TON to continue.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={back}>
          Back
        </Button>
        <Button className="flex-1" onClick={next} disabled={!hasFunds}>
          Continue
        </Button>
      </div>
    </div>
  );
}
