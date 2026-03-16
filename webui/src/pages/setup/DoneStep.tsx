import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { QK } from '../../lib/queryKeys';
import { CheckCircle } from 'lucide-react';

export default function DoneStep() {
  const queryClient = useQueryClient();

  return (
    <div className="space-y-6 text-center">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
          <CheckCircle size={48} className="text-green-500" />
          <h2 className="text-xl font-bold text-zinc-100">Setup Complete!</h2>
          <p className="text-sm text-zinc-400">
            Your COCOON node is configured and ready to start. Head to the Dashboard to begin.
          </p>
          <Button
            className="mt-4"
            onClick={() => queryClient.invalidateQueries({ queryKey: QK.setupStatus })}
          >
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
