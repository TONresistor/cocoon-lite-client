import { useState, useRef, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Terminal, Circle } from 'lucide-react';
import type { SSEEvent } from '../../hooks/useSSE';

interface EventLogProps {
  events: SSEEvent[];
}

type Category = 'milestone' | 'lifecycle' | 'warning' | 'debug' | 'error';

/** Classify legacy events that lack the `category` field. */
function resolveCategory(evt: SSEEvent): Category {
  if (evt.category) return evt.category as Category;
  const t = evt.type;
  if (t === 'fatal' || t === 'error') return 'error';
  if (t === 'connection_ready' || t === 'proxy_ready') return 'lifecycle';
  if (t === 'milestone') return 'milestone';
  if (t === 'warning') return 'warning';
  if (t === 'log') return 'debug';
  if (t === 'starting' || t === 'stopping' || t === 'stopped' || t === 'listening') return 'lifecycle';
  return 'lifecycle';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

const ICON_MAP: Record<Category, { icon: typeof CheckCircle2; className: string }> = {
  milestone: { icon: CheckCircle2, className: 'text-green-500' },
  lifecycle: { icon: Circle, className: 'text-blue-400' },
  warning: { icon: AlertTriangle, className: 'text-amber-400' },
  error: { icon: XCircle, className: 'text-red-400' },
  debug: { icon: Terminal, className: 'text-zinc-600' },
};

const MSG_CLASS: Record<Category, string> = {
  milestone: 'text-zinc-200',
  lifecycle: 'text-zinc-200',
  warning: 'text-amber-400',
  error: 'text-red-400',
  debug: 'text-zinc-500',
};

interface DedupedEvent {
  message: string;
  category: Category;
  timestamp: number;
  count: number;
}

export default function EventLog({ events }: EventLogProps) {
  const [showDebug, setShowDebug] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  // Classify, filter, dedup, reverse (newest first)
  const rows = useMemo(() => {
    // Classify all events
    const classified = events.map((evt) => ({
      message: evt.message,
      category: resolveCategory(evt),
      timestamp: evt.timestamp,
    }));

    // Filter
    const filtered = showDebug
      ? classified
      : classified.filter((e) => e.category !== 'debug');

    // Dedup consecutive identical messages
    const deduped: DedupedEvent[] = [];
    for (const evt of filtered) {
      const last = deduped[deduped.length - 1];
      if (last && last.message === evt.message && last.category === evt.category) {
        last.count += 1;
        last.timestamp = evt.timestamp; // keep latest timestamp
      } else {
        deduped.push({ ...evt, count: 1 });
      }
    }

    // Newest first
    return deduped.reverse();
  }, [events, showDebug]);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (events.length > prevLenRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    prevLenRef.current = events.length;
  }, [events.length]);

  if (events.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">
          Event Log
        </span>
        <button
          type="button"
          onClick={() => setShowDebug((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Debug
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full border transition-colors ${
              showDebug
                ? 'border-blue-500 bg-blue-500'
                : 'border-zinc-600 bg-transparent'
            }`}
          />
        </button>
      </div>

      <div ref={scrollRef} className="max-h-64 overflow-y-auto space-y-0.5">
        {rows.map((row, i) => {
          const iconDef = ICON_MAP[row.category];
          const Icon = iconDef.icon;
          return (
            <div key={i} className="flex items-center gap-2 py-px">
              <Icon size={13} className={`shrink-0 ${iconDef.className}`} />
              <span className="shrink-0 font-mono text-xs text-zinc-500">
                {formatTime(row.timestamp)}
              </span>
              <span className={`text-sm truncate ${MSG_CLASS[row.category]}`}>
                {row.message}
                {row.count > 1 && (
                  <span className="ml-1.5 text-[10px] text-zinc-500">(x{row.count})</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
