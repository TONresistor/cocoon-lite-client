import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

interface ChatSettings {
  model: string;
  noThink: boolean;
  temperature: number;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  settings: ChatSettings;

  createConversation: () => string;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Omit<ChatMessage, 'id'> & { id?: string }) => void;
  updateStreamingMessage: (conversationId: string, content: string) => void;
  setModel: (model: string) => void;
  toggleNoThink: () => void;
  setTemperature: (temp: number) => void;
  clearConversation: (id: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      conversations: [],
      activeConversationId: null,
      settings: {
        model: '',
        noThink: false,
        temperature: 0.7,
      },

      createConversation: () => {
        const id = crypto.randomUUID();
        const conversation: Conversation = {
          id,
          title: 'New Chat',
          messages: [],
          createdAt: Date.now(),
        };
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: id,
        }));
        return id;
      },

      deleteConversation: (id) => {
        set((state) => {
          const conversations = state.conversations.filter((c) => c.id !== id);
          const activeConversationId =
            state.activeConversationId === id
              ? conversations[0]?.id ?? null
              : state.activeConversationId;
          return { conversations, activeConversationId };
        });
      },

      setActiveConversation: (id) => {
        set({ activeConversationId: id });
      },

      addMessage: (conversationId, message) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const msgWithId: ChatMessage = { id: crypto.randomUUID(), ...message };
            const messages = [...c.messages, msgWithId];
            // Auto-title from first user message
            const title =
              c.messages.length === 0 && message.role === 'user'
                ? message.content.slice(0, 40) + (message.content.length > 40 ? '...' : '')
                : c.title;
            return { ...c, messages, title };
          }),
        }));
      },

      updateStreamingMessage: (conversationId, content) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (last && last.role === 'assistant') {
              messages[messages.length - 1] = { ...last, content };
            }
            return { ...c, messages };
          }),
        }));
      },

      setModel: (model) => {
        set((state) => ({ settings: { ...state.settings, model } }));
      },

      toggleNoThink: () => {
        set((state) => ({
          settings: { ...state.settings, noThink: !state.settings.noThink },
        }));
      },

      setTemperature: (temperature) => {
        set((state) => ({ settings: { ...state.settings, temperature } }));
      },

      clearConversation: (id) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, messages: [], title: 'New Chat' } : c
          ),
        }));
      },
    }),
    {
      name: 'cocoon-chat',
    },
  ),
);
