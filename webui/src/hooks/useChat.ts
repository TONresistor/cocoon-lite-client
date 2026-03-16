import { useCallback, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { proxyApi } from '../lib/api';
import { streamChat } from '../lib/stream';

export function useChat() {
  const {
    conversations,
    activeConversationId,
    settings,
    createConversation,
    addMessage,
    updateStreamingMessage,
  } = useChatStore();

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  );

  const sendMessage = useCallback(
    async (content: string) => {
      let convId = activeConversationId;
      if (!convId) {
        convId = createConversation();
      }

      addMessage(convId, { role: 'user', content });

      // Build messages array
      const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
      if (!conv) return;

      const messages: Array<{ role: string; content: string }> = [];

      // Prepend /no_think system message if enabled
      if (settings.noThink) {
        messages.push({ role: 'system', content: '/no_think' });
      }

      messages.push(...conv.messages.map((m) => ({ role: m.role, content: m.content })));

      // Add empty assistant message for streaming
      addMessage(convId, { role: 'assistant', content: '' });

      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await proxyApi.chatCompletions(
          {
            model: settings.model,
            messages,
            stream: true,
            temperature: settings.temperature,
          },
          controller.signal,
        );

        if (!response.ok) {
          const errText = await response.text();
          updateStreamingMessage(convId, `Error: ${errText}`);
          return;
        }

        let accumulated = '';
        for await (const chunk of streamChat(response)) {
          accumulated += chunk;
          updateStreamingMessage(convId, accumulated);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User stopped streaming
        } else {
          const currentConv = useChatStore.getState().conversations.find((c) => c.id === convId);
          const lastMsg = currentConv?.messages[currentConv.messages.length - 1];
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          updateStreamingMessage(
            convId,
            (lastMsg?.content || '') + `\n\n[Error: ${errMsg}]`,
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [activeConversationId, settings, createConversation, addMessage, updateStreamingMessage],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    activeConversation,
    isStreaming,
    sendMessage,
    stopStreaming,
  };
}
