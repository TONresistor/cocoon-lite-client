import { useQuery } from '@tanstack/react-query';
import { proxyApi } from '../lib/api';
import { useChatStore } from '../stores/chatStore';
import { useChat } from '../hooks/useChat';
import { usePollingInterval } from '../hooks/usePollingInterval';
import MessageList from '../components/MessageList';
import ChatInput from '../components/ChatInput';
import { Select } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Settings2, Trash2 } from 'lucide-react';
import Lottie from 'lottie-react';
import cocoonAnim from '../assets/cocoon.json';
import { useEffect, useState } from 'react';

export default function ChatContainer() {
  const { activeConversation, isStreaming, sendMessage, stopStreaming } = useChat();
  const settings = useChatStore(s => s.settings);
  const setModel = useChatStore(s => s.setModel);
  const toggleNoThink = useChatStore(s => s.toggleNoThink);
  const setTemperature = useChatStore(s => s.setTemperature);
  const clearConversation = useChatStore(s => s.clearConversation);
  const activeConversationId = useChatStore(s => s.activeConversationId);
  const [showSettings, setShowSettings] = useState(false);
  const pollingInterval = usePollingInterval();

  const { data: models } = useQuery({
    queryKey: ['models'],
    queryFn: proxyApi.getModels,
    refetchInterval: pollingInterval,
  });

  // Auto-select first model if none selected
  useEffect(() => {
    if (!settings.model && models?.data?.length) {
      setModel(models.data[0].id);
    }
  }, [models, settings.model, setModel]);

  return (
    <div className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-3rem)]">
      {/* Main chat area */}
      <div className="flex flex-1 flex-col rounded-lg border border-[var(--glass-border)] bg-white/[0.04]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-4 py-2">
          <Select
            className="max-w-xs"
            value={settings.model}
            onChange={(e) => setModel(e.target.value)}
          >
            {!models?.data?.length && <option value="">No models available</option>}
            {models?.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(!showSettings)}
            className="shrink-0"
          >
            <Settings2 size={16} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => activeConversationId && clearConversation(activeConversationId)}
            className="shrink-0"
            disabled={!activeConversation?.messages.length}
          >
            <Trash2 size={16} />
          </Button>

          {showSettings && (
            <div className="flex items-center gap-4 text-sm">
              <label
                className="flex items-center gap-2 text-[var(--text-primary)]"
                title="Skip chain-of-thought reasoning for faster responses"
              >
                <input
                  type="checkbox"
                  checked={settings.noThink}
                  onChange={toggleNoThink}
                  className="rounded"
                />
                Disable thinking
              </label>
              <label className="flex items-center gap-2 text-[var(--text-primary)]">
                Temp:
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={settings.temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-20"
                />
                <span className="font-mono text-xs w-8">{settings.temperature}</span>
              </label>
            </div>
          )}
        </div>

        {/* Messages */}
        {!models?.data?.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
            <Lottie animationData={cocoonAnim} loop className="h-12 w-12 opacity-40" />
            <p className="text-sm font-medium text-[var(--text-primary)]">No models available</p>
            <p className="max-w-xs text-center text-xs text-[var(--text-muted)]">
              Start your node from the sidebar and wait for it to reach the Ready state.
            </p>
            <a href="/dashboard" className="text-xs text-[var(--accent)] hover:underline">Go to Dashboard</a>
          </div>
        ) : (
          <MessageList
            messages={activeConversation?.messages ?? []}
            isStreaming={isStreaming}
          />
        )}

        {/* Input */}
        <ChatInput
          onSend={sendMessage}
          onStop={stopStreaming}
          isStreaming={isStreaming}
          disabled={!settings.model}
        />
      </div>
    </div>
  );
}
