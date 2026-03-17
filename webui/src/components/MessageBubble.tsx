import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Lottie from 'lottie-react';
import cocoonAnim from '../assets/cocoon.json';
import userAnim from '../assets/user.json';
import type { ChatMessage } from '../stores/chatStore';
import { cn } from '../lib/utils';
import { Bot, ChevronDown, Copy, Check } from 'lucide-react';

interface Props {
  message: ChatMessage;
  isStreaming: boolean;
}

function parseThinking(content: string): { thinking: string; reply: string } {
  const match = content.match(/^<think>([\s\S]*?)<\/think>\s*/);
  if (!match) return { thinking: '', reply: content };
  return { thinking: match[1].trim(), reply: content.slice(match[0].length) };
}

const MessageBubble = memo(function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';
  const [thinkOpen, setThinkOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (message.role === 'system') return null;

  const { thinking, reply } = !isUser ? parseThinking(message.content) : { thinking: '', reply: message.content };
  const isThinking = isStreaming && !reply && message.content.startsWith('<think>');

  return (
    <div className={cn('group/msg flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800">
          <Bot size={14} className="text-zinc-400" />
        </div>
      )}
      <div className="relative max-w-[80%]">
        <div
          className={cn(
            'rounded-lg text-sm',
            isUser
              ? 'bg-ton-blue text-white px-4 py-2.5'
              : 'bg-zinc-800 text-zinc-200',
          )}
        >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            {/* Thinking header */}
            {(thinking || isThinking) && (
              <div className="border-b border-zinc-700/50">
                <button
                  onClick={() => setThinkOpen(!thinkOpen)}
                  className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Lottie animationData={cocoonAnim} loop={isThinking} className="h-4 w-4" />
                  <span>{isThinking ? 'Thinking...' : 'Thought process'}</span>
                  <ChevronDown size={12} className={cn('ml-auto transition-transform', thinkOpen && 'rotate-180')} />
                </button>
                {thinkOpen && (
                  <div className="max-h-48 overflow-y-auto px-4 pb-2 text-xs text-zinc-500 whitespace-pre-wrap">
                    {thinking || message.content.replace(/^<think>/, '')}
                  </div>
                )}
              </div>
            )}
            {/* Reply content */}
            <div className="px-4 py-2.5">
              <div className="prose prose-invert prose-sm max-w-none">
                {reply ? (
                  <ReactMarkdown>{reply}</ReactMarkdown>
                ) : isStreaming && !isThinking ? (
                  <Lottie animationData={cocoonAnim} loop className="h-6 w-6" />
                ) : !isThinking ? null : null}
              </div>
            </div>
          </>
        )}
        </div>
        <button
          onClick={handleCopy}
          className="absolute -bottom-5 right-1 hidden rounded p-0.5 text-zinc-600 transition-colors hover:text-zinc-300 group-hover/msg:block"
          title="Copy message"
        >
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
        </button>
      </div>
      {isUser && (
        <Lottie animationData={userAnim} loop={false} className="h-7 w-7 shrink-0" />
      )}
    </div>
  );
});

export default MessageBubble;
