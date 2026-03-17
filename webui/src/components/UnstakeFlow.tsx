import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { walletApi, clientApi, type UnstakeStatus } from '../lib/api';
import { QK } from '../lib/queryKeys';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import ConfirmDialog from './ConfirmDialog';
import { cn } from '../lib/utils';
import { Unplug, Loader2, CheckCircle, XCircle, Circle, AlertTriangle } from 'lucide-react';

interface StepState {
  label: string;
  status: 'pending' | 'in-progress' | 'done' | 'error';
}

function deriveSteps(status: UnstakeStatus | undefined): StepState[] {
  const base: StepState[] = [
    { label: 'Close proxy contract (release stake)', status: 'pending' },
    { label: 'Withdraw from proxy to node wallet', status: 'pending' },
    { label: 'Transfer from node to owner wallet', status: 'pending' },
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

export default function UnstakeFlow() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [pollEnabled, setPollEnabled] = useState(false);

  // Check client running status
  const { data: clientStatus } = useQuery({
    queryKey: QK.clientStatus,
    queryFn: clientApi.getStatus,
    refetchInterval: 5000,
  });
  const isClientRunning = clientStatus?.running === true;

  // Poll unstake progress
  const { data: unstakeStatus } = useQuery({
    queryKey: QK.unstakeStatus,
    queryFn: walletApi.unstakeStatus,
    refetchInterval: 2000,
    enabled: pollEnabled,
  });

  const steps = deriveSteps(pollEnabled ? unstakeStatus : undefined);

  // Stop polling when done or error, mark completion
  useEffect(() => {
    if (!unstakeStatus) return;
    if (unstakeStatus.step === 'done') {
      setPollEnabled(false);
      setIsComplete(true);
    } else if (unstakeStatus.error) {
      setPollEnabled(false);
    } else if (!unstakeStatus.active && !unstakeStatus.step) {
      // Not active and no step — nothing running
      setPollEnabled(false);
    }
  }, [unstakeStatus]);

  const mutation = useMutation({
    mutationFn: () => walletApi.unstake(),
    onSuccess: () => {
      // Start polling after the mutation fires
      setPollEnabled(true);
    },
    onError: () => {
      setPollEnabled(false);
    },
  });

  const getStepIcon = (status: StepState['status']) => {
    switch (status) {
      case 'pending':
        return <Circle size={16} className="text-zinc-600" />;
      case 'in-progress':
        return <Loader2 size={16} className="animate-spin text-ton-blue" />;
      case 'done':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'error':
        return <XCircle size={16} className="text-red-500" />;
    }
  };

  const buttonDisabled = mutation.isPending || isComplete || !isClientRunning || pollEnabled;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Unplug size={18} className="text-ton-blue" />
            Reclaim Stake
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-400">
            Reclaims your deposited stake from the proxy contract back to your owner wallet.
            3 steps: close contract, withdraw to node, transfer to owner. Takes a few minutes.
          </p>

          {!isClientRunning && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The node must be running to reclaim your stake. Start it from the sidebar.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {getStepIcon(step.status)}
                <span
                  className={cn(
                    'text-sm',
                    step.status === 'done'
                      ? 'text-green-400'
                      : step.status === 'error'
                        ? 'text-red-400'
                        : step.status === 'in-progress'
                          ? 'text-zinc-100'
                          : 'text-zinc-500',
                  )}
                >
                  {step.label}
                </span>
                {step.status !== 'pending' && step.status !== 'in-progress' && (
                  <Badge
                    variant={step.status === 'done' ? 'success' : 'destructive'}
                    className="text-[10px]"
                  >
                    {step.status}
                  </Badge>
                )}
              </div>
            ))}
          </div>

          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          )}

          {unstakeStatus?.error && (
            <Alert variant="destructive">
              <AlertDescription>{unstakeStatus.error}</AlertDescription>
            </Alert>
          )}

          {isComplete && (
            <Alert variant="success">
              <AlertDescription>Unstake complete. Funds returned to owner wallet.</AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            onClick={() => setShowConfirm(true)}
            disabled={buttonDisabled}
          >
            {mutation.isPending || pollEnabled ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
            ) : isComplete ? (
              'Unstake Complete'
            ) : (
              'Start Unstake'
            )}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          mutation.mutate();
        }}
        title="Confirm Unstake"
        description="This will close your proxy contract and withdraw all staked funds. This action cannot be undone. Continue?"
      />
    </>
  );
}
