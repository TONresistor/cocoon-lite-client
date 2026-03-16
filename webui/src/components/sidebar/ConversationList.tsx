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
  );
}
