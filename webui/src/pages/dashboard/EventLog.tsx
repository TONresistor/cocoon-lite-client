import type { SSEEvent } from '../../hooks/useSSE';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

interface Props {
  events: SSEEvent[];
}

export default function EventLog({ events }: Props) {
  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Event Log</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
          {events.slice(-30).reverse().map((evt, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="shrink-0 text-zinc-600">
                {new Date(evt.timestamp).toLocaleTimeString()}
              </span>
              <Badge
                variant={
                  evt.type === 'fatal' || evt.type === 'error'
                    ? 'destructive'
                    : evt.type === 'connection_ready' || evt.type === 'proxy_ready'
                      ? 'success'
                      : 'secondary'
                }
                className="shrink-0 text-[10px]"
              >
                {evt.type}
              </Badge>
              <span className="text-zinc-400">{evt.message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
