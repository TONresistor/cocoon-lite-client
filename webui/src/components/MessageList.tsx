import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../stores/chatStore';
import MessageBubble from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export default function MessageList({ messages, isStreaming }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);

  useEffect(() => {
    const isNewMessage = messages.length !== prevCountRef.current;
    prevCountRef.current = messages.length;

    endRef.current?.scrollIntoView({
      behavior: isStreaming && !isNewMessage ? 'instant' : 'smooth',
    });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-zinc-500">Start a conversation</p>
          <p className="mt-1 text-sm text-zinc-600">
            Send a message to begin chatting with the AI model.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && msg.id === messages[messages.length - 1].id && msg.role === 'assistant'}
          />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
