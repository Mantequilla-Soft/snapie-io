import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { C as ChatClient, d as Conversation, M as Message } from './client-C8OuYUK4.js';

interface ChatProviderProps {
    client: ChatClient;
    children: ReactNode;
}
/** Wrap your app (or the chat section) with this to access hooks without prop-drilling. */
declare function ChatProvider({ client, children }: ChatProviderProps): react_jsx_runtime.JSX.Element;
/**
 * Subscribe to the live conversations list.
 *
 * @example
 * const { conversations, loading } = useConversations();
 */
declare function useConversations(clientOverride?: ChatClient): {
    conversations: Conversation[];
    loading: boolean;
};
/**
 * Subscribe to live messages for a conversation.
 * Handles initial load + polling automatically.
 *
 * @example
 * const { messages, loading, sendMessage } = useChatMessages(conv._id, conv.type);
 */
declare function useChatMessages(conversationId: string | null, type: 'channel' | 'dm' | 'group', clientOverride?: ChatClient): {
    messages: Message[];
    loading: boolean;
    error: string | null;
    sendMessage: (content: string, replyTo?: string) => Promise<void>;
    editMessage: (messageId: string, content: string) => Promise<void>;
};
/**
 * Subscribe to the unread message count badge, its per-conversation breakdown,
 * and the call that clears it.
 *
 * `unreadCount` is a message total: DMs and private groups count everything the
 * other side sent since you last read it, public channels only count messages
 * that mention you or reply to you. Call `markRead(conversationId)` when a
 * thread is actually on screen — fetching messages does not clear it.
 *
 * @example
 * const { unreadCount, byConversation, markRead } = useUnreadCount();
 */
declare function useUnreadCount(clientOverride?: ChatClient): {
    unreadCount: number;
    byConversation: Record<string, number>;
    markRead: (conversationId: string) => Promise<void>;
};
/**
 * Typing indicator for a conversation.
 * Returns who is typing and exposes `setTyping` to broadcast your own state.
 *
 * @example
 * const { typingUsers, setTyping } = useTyping(conv._id);
 */
declare function useTyping(conversationId: string | null, clientOverride?: ChatClient): {
    typingUsers: string[];
    setTyping: (isTyping: boolean) => void;
};

export { ChatClient, ChatProvider, useChatMessages, useConversations, useTyping, useUnreadCount };
