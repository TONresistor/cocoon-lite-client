import { useState, useEffect } from 'react';
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
import { Send, Loader2 } from 'lucide-react';

interface Props {
  ownerBalance?: string;
}

export default function CashoutForm({ ownerBalance }: Props) {
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ amt, dest }: { amt: string; dest: string }) =>
      walletApi.cashout(amt, dest),
    onSuccess: () => {
      setAmount('');
      setDestination('');
      queryClient.invalidateQueries({ queryKey: QK.walletInfo });
    },
  });

  useEffect(() => {
    if (mutation.isSuccess) {
      const timer = setTimeout(() => mutation.reset(), 5000);
      return () => clearTimeout(timer);
    }
  }, [mutation.isSuccess]);

  const handleMax = () => {
    if (ownerBalance) {
      setAmount('max');
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send size={18} className="text-[var(--accent)]" />
            Cashout (Owner &#8594; External)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Amount (TON)</Label>
              {ownerBalance && (
                <button
                  onClick={handleMax}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Max: {formatTon(ownerBalance)} TON
                </button>
              )}
            </div>
            <Input
              type="text"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Destination Address</Label>
            <Input
              type="text"
              placeholder="EQ..."
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>

          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          )}
          {mutation.isSuccess && (
            <Alert variant="success">
              <AlertDescription>
                Cashout {mutation.data.status}!
              </AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            onClick={() => setShowConfirm(true)}
            disabled={(!amount.trim() && amount !== 'max') || !destination.trim() || mutation.isPending}
          >
            {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : 'Cashout'}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          mutation.mutate({ amt: amount, dest: destination });
        }}
        title="Confirm Cashout"
        description={`Send ${amount === 'max' && ownerBalance ? formatTon(ownerBalance) : amount} TON to ${destination}?`}
      />
    </>
  );
}
