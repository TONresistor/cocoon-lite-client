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

  const hasFunds = balance && BigInt(balance.nano) > 0n;

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
            <Coins size={20} className="text-ton-blue" />
            Fund Owner Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-400">
            Send TON to the owner address below. The balance will update automatically.
          </p>

          <div className="flex items-center gap-2 rounded bg-zinc-800 p-3">
            <code className="flex-1 break-all text-xs text-zinc-200">
              {data.ownerAddress}
            </code>
            <button
              onClick={copyAddress}
              className="shrink-0 text-zinc-400 hover:text-zinc-100"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">Balance:</span>
            {balance ? (
              <Badge variant={hasFunds ? 'success' : 'secondary'}>
                {formatTon(balance.nano)} TON
              </Badge>
            ) : (
              <span className="text-sm text-zinc-500">Checking...</span>
            )}
          </div>

          {hasFunds && (
            <Alert variant="success">
              <AlertDescription>
                Detected {formatTon(balance.nano)} TON. You can proceed.
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
