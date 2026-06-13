import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { ChatClient } from '../client';
import type { Conversation, Message, TypingStatusInfo } from '../types';

// ── Context ──────────────────────────────────────────────────────────────────

const ChatContext = createContext<ChatClient | null>(null);

interface ChatProviderProps {
  client: ChatClient;
  children: ReactNode;
}

/** Wrap your app (or the chat section) with this to access hooks without prop-drilling. */
export function ChatProvider({ client, children }: ChatProviderProps) {
  return <ChatContext.Provider value={client}>{children}</ChatContext.Provider>;
}

function useChatClient(): ChatClient {
  const client = useContext(ChatContext);
  if (!client) throw new Error('useChatClient must be used inside <ChatProvider>');
  return client;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the live conversations list.
 *
 * @example
 * const { conversations, loading } = useConversations();
 */
export function useConversations(clientOverride?: ChatClient) {
  const client = clientOverride ?? useChatClient();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let first = true;
    const unsub = client.subscribeToConversations((convs) => {
      setConversations(convs);
      if (first) { setLoading(false); first = false; }
    });
    return unsub;
  }, [client]);

  return { conversations, loading };
}

/**
 * Subscribe to live messages for a conversation.
 * Handles initial load + polling automatically.
 *
 * @example
 * const { messages, loading, sendMessage } = useChatMessages(conv._id, conv.type);
 */
export function useChatMessages(
  conversationId: string | null,
  type: 'channel' | 'dm' | 'group',
  clientOverride?: ChatClient
) {
  const client = clientOverride ?? useChatClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId || !client.isAuthenticated()) return;
    setLoading(true);
    setMessages([]);
    setError(null);

    let first = true;
    const unsub = client.subscribeToMessages(conversationId, type, (msgs) => {
      setMessages(msgs);
      if (first) { setLoading(false); first = false; }
    });

    return unsub;
  }, [client, conversationId, type]);

  const sendMessage = useCallback(
    async (content: string, replyTo?: string) => {
      if (!conversationId) return;
      try {
        const { message } = await client.sendMessage(conversationId, type, content, replyTo);
        setMessages(prev => [...prev, message]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Send failed');
      }
    },
    [client, conversationId, type]
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!conversationId) return;
      const updated = await client.editMessage(conversationId, type, messageId, content);
      setMessages(prev => prev.map(m => m._id === updated._id ? updated : m));
    },
    [client, conversationId, type]
  );

  return { messages, loading, error, sendMessage, editMessage };
}

/**
 * Subscribe to the unread message count badge.
 *
 * @example
 * const { unreadCount } = useUnreadCount();
 */
export function useUnreadCount(clientOverride?: ChatClient) {
  const client = clientOverride ?? useChatClient();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!client.isAuthenticated()) return;
    const unsub = client.subscribeToUnreadCount(setUnreadCount);
    return unsub;
  }, [client]);

  return { unreadCount };
}

/**
 * Typing indicator for a conversation.
 * Returns who is typing and exposes `setTyping` to broadcast your own state.
 *
 * @example
 * const { typingUsers, setTyping } = useTyping(conv._id);
 */
export function useTyping(conversationId: string | null, clientOverride?: ChatClient) {
  const client = clientOverride ?? useChatClient();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(async () => {
      try {
        const info: TypingStatusInfo = await client.getTyping(conversationId);
        setTypingUsers(info.users);
      } catch { /* */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [client, conversationId]);

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!conversationId) return;
      client.setTyping(conversationId, isTyping).catch(() => { /* */ });

      // Auto-clear after 5s so we don't leave stale typing state
      if (isTyping) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          client.setTyping(conversationId, false).catch(() => { /* */ });
        }, 5000);
      }
    },
    [client, conversationId]
  );

  return { typingUsers, setTyping };
}

// Re-export client type so consumers don't need a second import
export type { ChatClient };
