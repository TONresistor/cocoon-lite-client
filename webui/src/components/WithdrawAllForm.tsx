import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { walletApi, clientApi, proxyApi, type WalletInfo, type UnstakeStatus } from '../lib/api';
import { QK } from '../lib/queryKeys';
import { usePollingInterval } from '../hooks/usePollingInterval';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import ConfirmDialog from './ConfirmDialog';
import { cn } from '../lib/utils';
import { Loader2, CheckCircle, XCircle, Circle, AlertTriangle } from 'lucide-react';

interface Props {
  info?: WalletInfo;
}

type Phase = 'idle' | 'unstaking' | 'withdrawing' | 'cashout' | 'done' | 'error';

interface StepState {
  label: string;
  status: 'pending' | 'in-progress' | 'done' | 'error';
}

function deriveUnstakeSteps(status: UnstakeStatus | undefined): StepState[] {
  const base: StepState[] = [
    { label: 'Closing proxy contract', status: 'pending' },
    { label: 'Withdrawing from proxy', status: 'pending' },
    { label: 'Transferring to owner wallet', status: 'pending' },
  ];
  if (!status || !status.step) return base;

  const stepMap: Record<string, number> = {
    closing: 0,
    withdrawing: 1,
    transferring: 2,
    done: 3,
  };
  const current = stepMap[status.step] ?? -1;

  return base.map((s, i) => {
    if (status.error && i === current) return { ...s, status: 'error' as const };
    if (i < current) return { ...s, status: 'done' as const };
    if (i === current && !status.error) {
      return status.step === 'done'
        ? { ...s, status: 'done' as const }
        : { ...s, status: 'in-progress' as const };
    }
    return s;
  });
}

export default function WithdrawAllForm({ info }: Props) {
  const [destination, setDestination] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pollEnabled, setPollEnabled] = useState(false);
  const [stepLabel, setStepLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const queryClient = useQueryClient();
  const pollingInterval = usePollingInterval();

  // Client status
  const { data: clientStatus } = useQuery({
    queryKey: QK.clientStatus,
    queryFn: clientApi.getStatus,
    refetchInterval: pollingInterval,
  });
  const isClientRunning = clientStatus?.running === true;

  // JsonStats — only when client is running
  const { data: stats } = useQuery({
    queryKey: QK.jsonStats,
    queryFn: proxyApi.getJsonStats,
    refetchInterval: pollingInterval,
    enabled: isClientRunning,
  });

  // Unstake status polling
  const { data: unstakeStatus } = useQuery({
    queryKey: QK.unstakeStatus,
    queryFn: walletApi.unstakeStatus,
    refetchInterval: 2000,
    enabled: pollEnabled,
  });

  // --- Calculations ---
  const proxyInfo = stats?.proxies?.[0];
  const pricePerToken = stats?.root_contract_config?.price_per_token ?? 0;

  const stakeRefund = proxyInfo && pricePerToken > 0
    ? (proxyInfo.tokens_payed - (proxyInfo.tokens_used_proxy_max ?? 0)) * pricePerToken / 1e9
    : 0;
  const nodeBalance = info?.cocoon?.balance ? Number(info.cocoon.balance.nano) / 1e9 : 0;
  const ownerBalance = info?.owner?.balance ? Number(info.owner.balance.nano) / 1e9 : 0;
  const hasStake = (proxyInfo?.tokens_payed ?? 0) > 0;
  const gasFees = hasStake ? 1.0 : 0.1;
  const estimatedTotal = Math.max(0, stakeRefund + nodeBalance + ownerBalance - gasFees);
  const hasAnything = stakeRefund > 0 || nodeBalance > 0 || ownerBalance > 0;

  const fmt = (n: number) => n.toFixed(4);

  // --- Unstake polling watcher ---
  useEffect(() => {
    if (!unstakeStatus || phase !== 'unstaking') return;

    if (unstakeStatus.step === 'done') {
      setPollEnabled(false);
      // Unstake done — continue to withdraw node balance if any
      queryClient.invalidateQueries({ queryKey: QK.walletInfo });
      proceedAfterUnstake();
    } else if (unstakeStatus.error) {
      setPollEnabled(false);
      setPhase('error');
      setErrorMsg(unstakeStatus.error);
    }
  }, [unstakeStatus, phase]);

  // Auto-dismiss success
  useEffect(() => {
    if (phase === 'done') {
      const timer = setTimeout(() => {
        setPhase('idle');
        setStepLabel('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // --- Mutations ---
  const unstakeMut = useMutation({
    mutationFn: () => walletApi.unstake(),
    onSuccess: () => {
      setPhase('unstaking');
      setPollEnabled(true);
    },
    onError: (err: Error) => {
      setPhase('error');
      setErrorMsg(err.message);
    },
  });

  const withdrawMut = useMutation({
    mutationFn: () => walletApi.withdraw('max'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.walletInfo });
      if (destination.trim()) {
        // Need to cashout to external
        setTimeout(() => doCashout(), 2000);
      } else {
        setPhase('done');
        setStepLabel('Funds sent to owner wallet');
      }
    },
    onError: (err: Error) => {
      setPhase('error');
      setErrorMsg(err.message);
    },
  });

  const cashoutMut = useMutation({
    mutationFn: () => walletApi.cashout('max', destination.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.walletInfo });
      setPhase('done');
      setStepLabel('Funds sent to external wallet');
    },
    onError: (err: Error) => {
      setPhase('error');
      setErrorMsg(err.message);
    },
  });

  const proceedAfterUnstake = useCallback(() => {
    // After unstake, node balance should have funds → withdraw to owner
    setPhase('withdrawing');
    setStepLabel('Withdrawing from node to owner...');
    withdrawMut.mutate();
  }, [destination]);

  const doCashout = useCallback(() => {
    setPhase('cashout');
    setStepLabel('Sending to external wallet...');
    cashoutMut.mutate();
  }, [destination]);

  // --- Main action ---
  const handleConfirm = () => {
    setShowConfirm(false);
    setErrorMsg('');

    if (hasStake && isClientRunning) {
      // Full flow: unstake → withdraw → (cashout)
      setPhase('unstaking');
      setStepLabel('Starting unstake...');
      unstakeMut.mutate();
    } else if (nodeBalance > 0.05) {
      // No stake, but node has funds → withdraw → (cashout)
      setPhase('withdrawing');
      setStepLabel('Withdrawing from node to owner...');
      withdrawMut.mutate();
    } else if (ownerBalance > 0 && destination.trim()) {
      // Only owner balance + external address → cashout
      doCashout();
    } else {
      setPhase('done');
      setStepLabel('Nothing to withdraw');
    }
  };

  // --- Step rendering for unstake phase ---
  const unstakeSteps = deriveUnstakeSteps(phase === 'unstaking' ? unstakeStatus : undefined);

  const getStepIcon = (status: StepState['status']) => {
    switch (status) {
      case 'pending':
        return <Circle size={14} className="text-zinc-600" />;
      case 'in-progress':
        return <Loader2 size={14} className="animate-spin text-ton-blue" />;
      case 'done':
        return <CheckCircle size={14} className="text-green-500" />;
      case 'error':
        return <XCircle size={14} className="text-red-500" />;
    }
  };

  const isProcessing = phase !== 'idle' && phase !== 'done' && phase !== 'error';
  const buttonDisabled = isProcessing || !hasAnything || (hasStake && !isClientRunning);

  return (
    <>
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Funds breakdown */}
          <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">
              Available funds breakdown
            </p>

            {hasStake && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Stake (proxy refund)</span>
                <span className="font-mono text-sm text-zinc-200">{fmt(stakeRefund)} TON</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Node wallet</span>
              <span className="font-mono text-sm text-zinc-200">{fmt(nodeBalance)} TON</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Owner wallet</span>
              <span className="font-mono text-sm text-zinc-200">{fmt(ownerBalance)} TON</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Gas fees (estimated)</span>
              <span className="font-mono text-sm text-zinc-400">-{fmt(gasFees)} TON</span>
            </div>

            <div className="border-t border-zinc-800 pt-2 mt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">Estimated total</span>
              <span className="font-mono text-sm font-medium text-zinc-100">~{fmt(estimatedTotal)} TON</span>
            </div>
          </div>

          {/* External address (optional) */}
          <div className="space-y-2">
            <Label className="text-zinc-400">External address (optional)</Label>
            <Input
              type="text"
              placeholder="EQ..."
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={isProcessing}
            />
            <p className="text-xs text-zinc-500">
              Leave empty to keep funds on owner wallet.
            </p>
          </div>

          {/* Client not running warning */}
          {hasStake && !isClientRunning && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Node must be running to reclaim stake. Start it from the sidebar.
              </AlertDescription>
            </Alert>
          )}

          {/* Progress steps */}
          {isProcessing && (
            <div className="space-y-2">
              {phase === 'unstaking' && unstakeSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  {getStepIcon(step.status)}
                  <span className={cn(
                    'text-sm',
                    step.status === 'done' ? 'text-green-400' :
                    step.status === 'error' ? 'text-red-400' :
                    step.status === 'in-progress' ? 'text-zinc-100' :
                    'text-zinc-500',
                  )}>
                    {step.label}
                  </span>
                  {step.status === 'done' && (
                    <Badge variant="success" className="text-[10px]">done</Badge>
                  )}
                </div>
              ))}

              {(phase === 'withdrawing') && (
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-ton-blue" />
                  <span className="text-sm text-zinc-100">Withdrawing from node to owner...</span>
                </div>
              )}

              {(phase === 'cashout') && (
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-ton-blue" />
                  <span className="text-sm text-zinc-100">Sending to external wallet...</span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {phase === 'error' && errorMsg && (
            <Alert variant="destructive">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {/* Success */}
          {phase === 'done' && stepLabel && (
            <Alert variant="success">
              <AlertDescription>{stepLabel}</AlertDescription>
            </Alert>
          )}

          {/* Action button */}
          <Button
            className="w-full"
            onClick={() => setShowConfirm(true)}
            disabled={buttonDisabled}
          >
            {isProcessing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
            ) : phase === 'done' ? (
              'Withdraw Complete'
            ) : (
              'Withdraw All'
            )}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title={`Withdraw ~${fmt(estimatedTotal)} TON?`}
        description={
          (hasStake ? 'This will stop your node and reclaim all funds. ' : '') +
          (destination.trim()
            ? `Funds will be sent to ${destination.trim()}.`
            : 'Funds will be sent to your owner wallet.')
        }
      />
    </>
  );
}
