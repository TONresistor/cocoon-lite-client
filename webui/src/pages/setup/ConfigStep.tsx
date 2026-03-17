import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { setupApi } from '../../lib/api';
import { FileCheck } from 'lucide-react';
import type { SetupData } from './SetupWizard';

interface Props {
  data: SetupData;
  next: () => void;
  back: () => void;
}

export default function ConfigStep({ data, next, back }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleWrite = async () => {
    setLoading(true);
    setError('');
    try {
      await setupApi.writeConfig(data.instance, data.apiKey || undefined);
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to write config');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck size={20} className="text-[var(--accent)]" />
            Review Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between rounded bg-white/[0.06] px-4 py-2 text-sm">
            <span className="text-[var(--text-secondary)]">Instance</span>
            <span className="font-mono">{data.instance}</span>
          </div>
          <div className="flex justify-between rounded bg-white/[0.06] px-4 py-2 text-sm">
            <span className="text-[var(--text-secondary)]">HTTP Port</span>
            <span className="font-mono">{10000 + data.instance * 10}</span>
          </div>
          <div className="flex justify-between rounded bg-white/[0.06] px-4 py-2 text-sm">
            <span className="text-[var(--text-secondary)]">API Key</span>
            <span className="font-mono">{data.apiKey ? '***' : 'None'}</span>
          </div>
          <div className="flex justify-between rounded bg-white/[0.06] px-4 py-2 text-sm">
            <span className="text-[var(--text-secondary)]">Owner Address</span>
            <span className="font-mono text-xs">{data.ownerAddress}</span>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={back}>
          Back
        </Button>
        <Button className="flex-1" onClick={handleWrite} disabled={loading}>
          {loading ? 'Writing Config...' : 'Write Config'}
        </Button>
      </div>
    </div>
  );
}
