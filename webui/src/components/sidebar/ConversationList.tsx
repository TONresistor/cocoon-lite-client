import { Plus, Trash2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { cn } from '../../lib/utils';

interface Props {
  onClose?: () => void;
}

export default function ConversationList({ onClose }: Props) {
  const conversations = useChatStore(s => s.conversations);
  const activeConversationId = useChatStore(s => s.activeConversationId);
  const createConversation = useChatStore(s => s.createConversation);
  const deleteConversation = useChatStore(s => s.deleteConversation);
  const setActiveConversation = useChatStore(s => s.setActiveConversation);

  return (
    <div className="flex flex-col border-t border-[var(--glass-border)] px-3 py-2 min-h-0 flex-1">
      <button
        onClick={() => { createConversation(); onClose?.(); }}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-white/[0.08] hover:text-[var(--text-primary)] transition-colors"
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
                ? 'bg-white/[0.08] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]',
            )}
            onClick={() => { setActiveConversation(conv.id); onClose?.(); }}
          >
            <span className="flex-1 truncate">{conv.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
              className="hidden shrink-0 text-[var(--text-muted)] hover:text-[var(--red)] group-hover:block"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
