import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { C as ChatClient, d as Conversation, M as Message } from './client-Bztyx_3e.js';

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
 * Subscribe to the unread message count badge.
 *
 * @example
 * const { unreadCount } = useUnreadCount();
 */
declare function useUnreadCount(clientOverride?: ChatClient): {
    unreadCount: number;
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
