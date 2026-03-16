import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { Button } from './ui/button';
import { Send, StopCircle } from 'lucide-react';

interface Props {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export default function ChatInput({ onSend, onStop, isStreaming, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isStreaming, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  };

  return (
    <div className="border-t border-zinc-800 p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Select a model first...' : 'Type a message... (Shift+Enter for newline)'}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ton-blue disabled:cursor-not-allowed disabled:opacity-50"
        />
        {isStreaming ? (
          <Button variant="destructive" size="icon" onClick={onStop}>
            <StopCircle size={18} />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!value.trim() || disabled}
          >
            <Send size={18} />
          </Button>
        )}
      </div>
    </div>
  );
}
