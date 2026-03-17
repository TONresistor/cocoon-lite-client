import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { walletApi } from '../lib/api';
import { formatTon } from '../lib/format';
import { QK } from '../lib/queryKeys';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import ConfirmDialog from './ConfirmDialog';
import { ArrowUpFromLine, Copy, Check, QrCode, Loader2 } from 'lucide-react';

interface Props {
  ownerAddress?: string;
  ownerBalance?: string;
}

export default function StakeForm({ ownerAddress, ownerBalance }: Props) {
  const [amount, setAmount] = useState('max');
  const [showConfirm, setShowConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const queryClient = useQueryClient();

  const balanceNano = ownerBalance ? BigInt(ownerBalance) : 0n;
  const hasBalance = balanceNano > 0n;

  const mutation = useMutation({
    mutationFn: (amt: string) => walletApi.stake(amt),
    onSuccess: () => {
      setAmount('');
      queryClient.invalidateQueries({ queryKey: QK.walletInfo });
    },
  });

  useEffect(() => {
    if (mutation.isSuccess) {
      const timer = setTimeout(() => mutation.reset(), 5000);
      return () => clearTimeout(timer);
    }
  }, [mutation.isSuccess]);

  const handleCopy = async () => {
    if (!ownerAddress) return;
    await navigator.clipboard.writeText(ownerAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMax = () => {
    if (ownerBalance) {
      setAmount('max');
    }
  };

  const handleSubmit = () => {
    if (!amount.trim()) return;
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    mutation.mutate(amount);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowUpFromLine size={18} className="text-[var(--accent)]" />
            Fund Node (Owner &#8594; Node)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Owner wallet address — always visible */}
          {ownerAddress && (
            <div className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-white/[0.04] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Owner wallet
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowQR((v) => !v)}
                    className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--text-primary)]"
                  >
                    <QrCode size={14} />
                  </button>
                  <button
                    onClick={handleCopy}
                    className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--text-primary)]"
                  >
                    {copied ? <Check size={14} className="text-[var(--green)]" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <p className="mt-1 break-all font-mono text-xs text-[var(--text-primary)]">
                {ownerAddress}
              </p>
              <p className="mt-1 font-mono text-sm text-[var(--text-primary)]">
                {hasBalance ? formatTon(ownerBalance!) : '0'} TON
              </p>

              {showQR && (
                <div className="mt-3 flex justify-center rounded-md bg-white p-3">
                  <QRCodeSVG
                    value={ownerAddress}
                    size={160}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
              )}
            </div>
          )}

          {!hasBalance ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Send TON to your owner wallet address above, then transfer to the node below.
            </p>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Transfer TON from your owner wallet to the node wallet.
              The node will deposit these funds as stake when started.
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Amount (TON)</Label>
              {hasBalance && (
                <button
                  onClick={handleMax}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Max: {formatTon(ownerBalance!)} TON
                </button>
              )}
            </div>
            <Input
              type="text"
              placeholder="max"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!hasBalance}
            />
            <p className="text-xs text-[var(--text-muted)]">
              Minimum 16 TON required. "max" sends everything (keeps 0.5 TON gas on owner).
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
                Transfer {mutation.data.status}! You can now start the client.
              </AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!hasBalance || !amount.trim() || mutation.isPending}
          >
            {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : 'Fund Node Wallet'}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title="Confirm Fund"
        description={`Transfer ${amount} TON from owner wallet to node wallet?`}
      />
    </>
  );
}
