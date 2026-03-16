import type { JsonStats } from '../../lib/api';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

interface Props {
  isRunning: boolean;
  stats: JsonStats | undefined;
}

export default function ProxyCard({ isRunning, stats }: Props) {
  const proxyConn = stats?.proxy_connections?.[0];
  const proxyInfo = stats?.proxies?.[0];
  const isProxyReady = proxyConn?.is_ready === true;
  const isStaked = (proxyInfo?.tokens_payed ?? 0) > 0;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">Proxy</span>
        {isRunning && stats && (
          <Badge variant={isProxyReady ? 'success' : 'secondary'} className="text-[10px] px-2 py-0">
            {isProxyReady ? 'Connected' : proxyConn ? 'Connecting' : 'Waiting'}
          </Badge>
        )}
      </div>
      {!isRunning ? (
        <p className="mt-2.5 text-xs text-zinc-600">Offline</p>
      ) : !stats ? (
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-zinc-500">
          <Loader2 size={10} className="animate-spin" />
          Waiting...
        </div>
      ) : (
        <div className="mt-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Staking</span>
            <span className={cn('text-xs font-medium', isStaked ? 'text-green-400' : 'text-zinc-500')}>
              {isStaked ? 'Active' : 'Pending'}
            </span>
          </div>
          {proxyInfo && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Tokens</span>
              <span className="font-mono text-xs text-zinc-400">{proxyInfo.tokens_payed}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Active</span>
            <span className="text-xs text-zinc-400">
              {stats.root_contract_config?.registered_proxies?.length ?? 0} proxies
            </span>
          </div>
          {proxyConn?.address && (
            <p className="truncate font-mono text-[10px] text-zinc-600">{proxyConn.address}</p>
          )}
        </div>
      )}
    </div>
  );
}
