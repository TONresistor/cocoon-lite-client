import type { ModelsResponse } from '../../lib/api';

interface Props {
  models: ModelsResponse | undefined;
  isRunning: boolean;
  isProxyReady: boolean;
}

export default function ModelsCard({ models, isRunning, isProxyReady }: Props) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:col-span-2 lg:col-span-3">
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-100">Models</span>
      {models?.data?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {models.data.map((m) => (
            <span key={m.id} className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
              {m.id}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-600">
          {isRunning
            ? isProxyReady
              ? 'No models yet'
              : 'Waiting for proxy...'
            : 'Start client to load models'}
        </p>
      )}
    </div>
  );
}
