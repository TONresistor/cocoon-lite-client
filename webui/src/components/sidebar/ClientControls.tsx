import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Loader2 } from 'lucide-react';
import { clientApi } from '../../lib/api';
import { QK } from '../../lib/queryKeys';
import { Button } from '../ui/button';

export default function ClientControls() {
  const queryClient = useQueryClient();

  const { data: clientStatus } = useQuery({
    queryKey: QK.clientStatus,
    queryFn: clientApi.getStatus,
    refetchInterval: 3000,
  });

  const isRunning = clientStatus?.running === true;

  const startMutation = useMutation({
    mutationFn: () => clientApi.start(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.clientStatus });
      queryClient.invalidateQueries({ queryKey: QK.jsonStats });
      queryClient.invalidateQueries({ queryKey: QK.models });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => clientApi.stop(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.clientStatus });
      queryClient.invalidateQueries({ queryKey: QK.jsonStats });
    },
  });

  const isActing = startMutation.isPending || stopMutation.isPending;

  return (
    <div className="border-t border-[var(--glass-border)] px-3 py-3">
      {isRunning ? (
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => stopMutation.mutate()}
          disabled={isActing}
        >
          {stopMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
          Stop
        </Button>
      ) : (
        <Button
          className="w-full"
          onClick={() => startMutation.mutate()}
          disabled={isActing}
        >
          {startMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          Start
        </Button>
      )}
    </div>
  );
}
