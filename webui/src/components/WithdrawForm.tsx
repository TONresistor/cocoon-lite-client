import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { walletApi } from '../lib/api';
import { formatTon } from '../lib/format';
import { QK } from '../lib/queryKeys';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import ConfirmDialog from './ConfirmDialog';
import { ArrowDownToLine } from 'lucide-react';

const SC_RESERVE = 50_000_000n; // 0.05 TON in nano

interface Props {
  cocoonBalance?: string;
}

export default function WithdrawForm({ cocoonBalance }: Props) {
  const [amount, setAmount] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const queryClient = useQueryClient();

  const available = cocoonBalance
    ? (() => {
        const bal = BigInt(cocoonBalance);
        return bal > SC_RESERVE ? bal - SC_RESERVE : 0n;
      })()
    : 0n;

  const mutation = useMutation({
    mutationFn: (amt: string) => walletApi.withdraw(amt),
    onSuccess: () => {
      setAmount('');
      queryClient.invalidateQueries({ queryKey: QK.walletInfo });
    },
  });

  const handleMax = () => {
    if (available > 0n) {
      setAmount(formatTon(available.toString()));
    }
  };

  const handleSubmit = () => {
    if (!amount.trim()) return;
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    mutation.mutate(amount === formatTon(available.toString()) ? 'max' : amount);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine size={18} className="text-ton-blue" />
            Withdraw (COCOON to Owner)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Amount (TON)</Label>
              <button
                onClick={handleMax}
                className="text-xs text-ton-blue hover:underline"
              >
                Max: {formatTon(available.toString())} TON
              </button>
            </div>
            <Input
              type="text"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-zinc-500">
              0.05 TON reserved for smart contract operations.
            </p>
          </div>

          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          )}
          {mutation.isSuccess && (
            <Alert variant="success">
              <AlertDescription>
                Withdrawal {mutation.data.status}!
              </AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!amount.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Processing...' : 'Withdraw'}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title="Confirm Withdrawal"
        description={`Withdraw ${amount} TON from COCOON wallet to owner wallet?`}
      />
    </>
  );
}
