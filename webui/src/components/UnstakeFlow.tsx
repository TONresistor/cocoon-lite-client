import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { walletApi } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import ConfirmDialog from './ConfirmDialog';
import { cn } from '../lib/utils';
import { Unplug, Loader2, CheckCircle, XCircle, Circle } from 'lucide-react';

interface StepState {
  label: string;
  status: 'pending' | 'in-progress' | 'done' | 'error';
}

export default function UnstakeFlow() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([
    { label: 'Closing proxy contract...', status: 'pending' },
    { label: 'Withdrawing from proxy...', status: 'pending' },
    { label: 'Transferring to owner...', status: 'pending' },
  ]);

  const mutation = useMutation({
    mutationFn: () => walletApi.unstake(),
    onMutate: () => {
      setSteps((prev) =>
        prev.map((s, i) =>
          i === 0 ? { ...s, status: 'in-progress' } : s,
        ),
      );
    },
    onSuccess: (data) => {
      setSteps((prev) =>
        prev.map((s, i) => {
          if (i < data.step) return { ...s, status: 'done' };
          if (i === data.step - 1) {
            return data.status === 'error'
              ? { ...s, status: 'error' }
              : { ...s, status: 'in-progress' };
          }
          return s;
        }),
      );
      if (data.status === 'transferred') {
        setSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));
      }
    },
    onError: () => {
      setSteps((prev) =>
        prev.map((s) =>
          s.status === 'in-progress' ? { ...s, status: 'error' } : s,
        ),
      );
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Unplug size={18} className="text-ton-blue" />
            Unstake
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-400">
            This 3-step process will close the proxy contract, withdraw funds, and transfer
            them to your owner wallet. This may take several minutes.
          </p>

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

          <Button
            className="w-full"
            onClick={() => setShowConfirm(true)}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Processing...' : 'Start Unstake'}
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
