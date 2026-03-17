import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import type { SetupData } from './SetupWizard';

interface Props {
  data: SetupData;
  updateData: (partial: Partial<SetupData>) => void;
  next: () => void;
  back: () => void;
}

export default function InstanceStep({ data, updateData, next, back }: Props) {
  const port = 10000 + data.instance * 10;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="instance">Instance Number (0-9)</Label>
            <Input
              id="instance"
              type="number"
              min={0}
              max={9}
              value={data.instance}
              onChange={(e) => {
                const val = Math.max(0, Math.min(9, parseInt(e.target.value) || 0));
                updateData({ instance: val });
              }}
            />
            <p className="text-xs text-[var(--text-muted)]">
              HTTP port: <span className="font-mono text-[var(--text-primary)]">{port}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key (optional)</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Leave empty for no authentication"
              value={data.apiKey}
              onChange={(e) => updateData({ apiKey: e.target.value })}
            />
            <p className="text-xs text-[var(--text-muted)]">
              Protects the /v1/ API endpoints.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={back}>
          Back
        </Button>
        <Button className="flex-1" onClick={next}>
          Continue
        </Button>
      </div>
    </div>
  );
}
