import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { setupApi } from '../../lib/api';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import type { SetupData } from './SetupWizard';

interface Props {
  data: SetupData;
  next: () => void;
  back: () => void;
}

export default function TransferStep({ data, next, back }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<string>('');

  const handleTransfer = async () => {
    setLoading(true);
    setError('');
    setStatus('Sending transfer...');
    try {
      const result = await setupApi.transfer(data.nodeAddress, '15');
      if (result.status === 'confirmed' || result.status === 'sent') {
        setStatus('Transfer confirmed!');
        setTimeout(next, 1000);
      } else {
        setStatus('Transfer timed out. You may retry.');
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft size={20} className="text-ton-blue" />
            Transfer to COCOON Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-400">
            Transfer funds from your owner wallet to the COCOON node wallet to begin operations.
          </p>

          <div className="space-y-2">
            <div className="flex justify-between rounded bg-zinc-800 px-4 py-2 text-sm">
              <span className="text-zinc-400">From</span>
              <span className="font-mono text-xs">{data.ownerAddress}</span>
            </div>
            <div className="flex justify-between rounded bg-zinc-800 px-4 py-2 text-sm">
              <span className="text-zinc-400">To</span>
              <span className="font-mono text-xs">{data.nodeAddress}</span>
            </div>
          </div>

          {status && (
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {status}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={back} disabled={loading}>
          Back
        </Button>
        <Button className="flex-1" onClick={handleTransfer} disabled={loading}>
          {loading ? 'Transferring...' : 'Transfer'}
        </Button>
      </div>
    </div>
  );
}
