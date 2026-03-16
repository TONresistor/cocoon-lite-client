import { useEffect, useRef, useState, useCallback } from 'react';

export interface SSEEvent {
  type: string;
  message: string;
  timestamp: number;
}

const MAX_EVENTS = 100;

export function useSSE(url: string = '/api/client/events', onEvent?: (event: SSEEvent) => void) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const sseEvent: SSEEvent = { ...data, timestamp: data.timestamp || Date.now() };
        setEvents((prev) => [...prev, sseEvent].slice(-MAX_EVENTS));
        onEventRef.current?.(sseEvent);
      } catch {
        // skip malformed events
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      esRef.current?.close();
    };
  }, [connect]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, connected, clearEvents };
}
