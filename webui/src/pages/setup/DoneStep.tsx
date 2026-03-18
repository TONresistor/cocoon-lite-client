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
          <CheckCircle size={48} className="text-[var(--green)]" />
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Setup Complete!</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Your COCOON node is configured and ready to start. Head to the Dashboard to begin.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              sessionStorage.removeItem('setup_step');
              sessionStorage.removeItem('setup_data');
              queryClient.invalidateQueries({ queryKey: QK.setupStatus });
            }}
          >
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
