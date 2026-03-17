import { type ReactNode, useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Settings, LayoutDashboard, MessageSquare, Wallet, Menu, X, Play, Square, Loader2, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Lottie from 'lottie-react';
import cocoonAnim from '../assets/cocoon.json';
import { cn } from '../lib/utils';
import { clientApi } from '../lib/api';
import { usePollingInterval } from '../hooks/usePollingInterval';
import { useSSEEvents } from '../hooks/useSSEContext';
import { useChatStore } from '../stores/chatStore';
import { Button } from './ui/button';

const setupNavItems = [
  { to: '/setup', label: 'Setup', icon: Settings },
];

const mainNavItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
];

function Sidebar({ onClose, setupDone }: { onClose?: () => void; setupDone: boolean }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const isOnChat = location.pathname === '/chat';
  const navItems = setupDone ? mainNavItems : setupNavItems;
  const conversations = useChatStore(s => s.conversations);
  const activeConversationId = useChatStore(s => s.activeConversationId);
  const createConversation = useChatStore(s => s.createConversation);
  const deleteConversation = useChatStore(s => s.deleteConversation);
  const setActiveConversation = useChatStore(s => s.setActiveConversation);
  const pollingInterval = usePollingInterval();
  const { connected: sseConnected } = useSSEEvents();
  const [actionError, setActionError] = useState<string | null>(null);

  const clearErrorAfterDelay = useCallback(() => {
    const t = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (actionError) return clearErrorAfterDelay();
  }, [actionError, clearErrorAfterDelay]);

  const { data: clientStatus } = useQuery({
    queryKey: ['clientStatus'],
    queryFn: clientApi.getStatus,
    refetchInterval: pollingInterval,
  });

  const isRunning = clientStatus?.running === true;

  const startMutation = useMutation({
    mutationFn: () => clientApi.start(),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['clientStatus'] });
      queryClient.invalidateQueries({ queryKey: ['jsonStats'] });
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const stopMutation = useMutation({
    mutationFn: () => clientApi.stop(),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['clientStatus'] });
      queryClient.invalidateQueries({ queryKey: ['jsonStats'] });
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const isActing = startMutation.isPending || stopMutation.isPending;

  return (
    <div className="flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-center gap-2">
          <Lottie animationData={cocoonAnim} loop className="h-9 w-9" />
          <span className="text-lg font-bold text-zinc-100">COCOON</span>
          {onClose && (
            <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-zinc-100 lg:hidden">
              <X size={20} />
            </button>
          )}
        </div>
        {!sseConnected && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-xs text-amber-500">Live updates paused</span>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      {isOnChat && setupDone && (
        <div className="flex flex-col border-t border-zinc-800 px-3 py-2 min-h-0 flex-1">
          <button
            onClick={() => { createConversation(); onClose?.(); }}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <Plus size={12} />
            New Chat
          </button>
          <div className="mt-1 flex-1 overflow-y-auto space-y-0.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors',
                  conv.id === activeConversationId
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300',
                )}
                onClick={() => { setActiveConversation(conv.id); onClose?.(); }}
              >
                <span className="flex-1 truncate">{conv.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                  className="hidden shrink-0 text-zinc-600 hover:text-red-400 group-hover:block"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {setupDone && (
        <div className="border-t border-zinc-800 px-3 py-3">
          {actionError && (
            <p className="mb-2 rounded bg-red-950/50 px-2 py-1.5 text-[11px] text-red-400">{actionError}</p>
          )}
          {isRunning ? (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => stopMutation.mutate()}
              disabled={isActing}
            >
              {stopMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
              Stop
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={() => startMutation.mutate()}
              disabled={isActing}
            >
              {startMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Start
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children, setupDone = false }: { children: ReactNode; setupDone: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar setupDone={setupDone} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full">
            <Sidebar onClose={() => setMobileOpen(false)} setupDone={setupDone} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b border-zinc-800 px-4 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-zinc-400 hover:text-zinc-100"
          >
            <Menu size={24} />
          </button>
          <Lottie animationData={cocoonAnim} loop className="ml-2 h-7 w-7" />
          <span className="font-bold text-zinc-100">COCOON</span>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
