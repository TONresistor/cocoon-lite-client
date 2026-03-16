import { createContext, useContext, type ReactNode } from 'react';
import { useSSEQuerySync } from './useSSEQuerySync';
import type { SSEEvent } from './useSSE';

interface SSEContextValue {
  events: SSEEvent[];
  connected: boolean;
  clearEvents: () => void;
}

const SSEContext = createContext<SSEContextValue>({
  events: [],
  connected: false,
  clearEvents: () => {},
});

export function SSEProvider({ children }: { children: ReactNode }) {
  const value = useSSEQuerySync();
  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export function useSSEEvents() {
  return useContext(SSEContext);
}
