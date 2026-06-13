interface Channel {
    _id: string;
    name: string;
    description?: string;
    type: string;
    conversationKind?: 'channel' | 'group';
    owner?: string;
    members?: string[];
    memberCount: number;
    isPublic: boolean;
}
interface Message {
    _id: string;
    sender: string;
    content: string;
    replyTo?: string | null;
    editedAt?: string | null;
    createdAt: string;
}
interface Conversation {
    _id: string;
    name: string;
    description?: string;
    type: 'channel' | 'group' | 'dm';
    isPublic: boolean;
    owner?: string;
    members?: string[];
    memberCount?: number;
    peer?: string;
    lastMessage?: Message | null;
    unread?: boolean;
}
interface DmDeliveryInfo {
    hasFcm: boolean;
    memoSuggested: boolean;
    cooldownMs: number;
}
interface DmStatusInfo {
    meSeenAt: string;
    peerSeenAt: string | null;
    peerLastSeenAt: string | null;
    peerOnline: boolean;
}
interface TypingStatusInfo {
    users: string[];
    ttlMs: number;
}
interface ChatPreferences {
    mutedUsers: string[];
    blockedUsers: string[];
}
interface MessagesResult {
    messages: Message[];
    status?: DmStatusInfo | null;
}
interface StorageAdapter {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
interface ChatClientOptions {
    /** Base URL of the Snapie instance, e.g. "https://snapie.io" */
    baseUrl: string;
    /** Override default localStorage — useful for React Native or Node */
    storage?: StorageAdapter;
    /** How often to poll for new messages when FCM is not available (ms, default 15000) */
    pollInterval?: number;
}

declare class ChatService {
    private token;
    private tokenUsername;
    private base;
    private storage;
    constructor(baseUrl: string, storage: StorageAdapter);
    isAuthenticated(): boolean;
    getTokenUsername(): string | null;
    authenticate(username: string, signMessage: (msg: string) => Promise<string>): Promise<void>;
    logout(): void;
    getChannels(): Promise<Channel[]>;
    getConversations(): Promise<Conversation[]>;
    getChannelMessages(channelId: string, opts?: {
        before?: string;
        after?: string;
        limit?: number;
    }): Promise<Message[]>;
    sendChannelMessage(channelId: string, content: string, replyTo?: string): Promise<Message>;
    editChannelMessage(channelId: string, messageId: string, content: string): Promise<Message>;
    joinChannel(channelId: string): Promise<void>;
    leaveChannel(channelId: string): Promise<void>;
    getDmMessages(conversationId: string, opts?: {
        before?: string;
        after?: string;
        limit?: number;
    }): Promise<MessagesResult>;
    sendDmMessage(conversationId: string, content: string, replyTo?: string): Promise<{
        message: Message;
        delivery?: DmDeliveryInfo;
    }>;
    editDmMessage(conversationId: string, messageId: string, content: string): Promise<Message>;
    openDm(targetUser: string): Promise<Conversation>;
    createGroup(payload: {
        name: string;
        description?: string;
        isPublic?: boolean;
        members?: string[];
    }): Promise<Channel>;
    getGroups(): Promise<Channel[]>;
    addGroupMember(groupId: string, member: string): Promise<Channel>;
    removeGroupMember(groupId: string, member: string): Promise<Channel>;
    getUnreadCount(): Promise<number>;
    setTyping(conversationId: string, isTyping: boolean): Promise<void>;
    getTyping(conversationId: string): Promise<TypingStatusInfo>;
    getPreferences(): Promise<ChatPreferences>;
    muteUser(username: string): Promise<void>;
    unmuteUser(username: string): Promise<void>;
    blockUser(username: string): Promise<void>;
    unblockUser(username: string): Promise<void>;
    registerDevice(fcmToken: string): Promise<void>;
    markDmMemoFallbackSent(conversationId: string): Promise<void>;
    private buildQS;
    private get;
    private post;
    request<T>(url: string, opts: RequestInit, auth: boolean): Promise<T>;
}

type ConversationsCallback = (conversations: Conversation[]) => void;
type MessagesCallback = (messages: Message[]) => void;
type UnreadCallback = (count: number) => void;
/**
 * High-level Snapie chat client.
 *
 * Usage:
 *   const client = new ChatClient({ baseUrl: 'https://snapie.io' });
 *   await client.authenticate(username, msg => keychain.sign(msg));
 *   const conversations = await client.getConversations();
 *   const unsub = client.subscribeToMessages(convId, 'dm', msgs => setMessages(msgs));
 */
declare class ChatClient {
    readonly service: ChatService;
    private poller;
    /** Cache of messages per conversationId — avoids re-rendering unchanged data */
    private messageCache;
    constructor(options: ChatClientOptions);
    isAuthenticated(): boolean;
    getUsername(): string | null;
    /**
     * Authenticate with a Hive account.
     * `signMessage` should call Hive Keychain or equivalent with the posting key.
     */
    authenticate(username: string, signMessage: (challenge: string) => Promise<string>): Promise<void>;
    logout(): void;
    getConversations(): Promise<Conversation[]>;
    openDm(targetUser: string): Promise<Conversation>;
    getChannels(): Promise<Channel[]>;
    getGroups(): Promise<Channel[]>;
    joinChannel(channelId: string): Promise<void>;
    leaveChannel(channelId: string): Promise<void>;
    createGroup(payload: {
        name: string;
        description?: string;
        isPublic?: boolean;
        members?: string[];
    }): Promise<Channel>;
    addGroupMember(groupId: string, member: string): Promise<Channel>;
    removeGroupMember(groupId: string, member: string): Promise<Channel>;
    getMessages(conversationId: string, type: 'channel' | 'dm' | 'group', opts?: {
        before?: string;
        after?: string;
        limit?: number;
    }): Promise<MessagesResult>;
    sendMessage(conversationId: string, type: 'channel' | 'dm' | 'group', content: string, replyTo?: string): Promise<{
        message: Message;
        delivery?: DmDeliveryInfo;
    }>;
    editMessage(conversationId: string, type: 'channel' | 'dm' | 'group', messageId: string, content: string): Promise<Message>;
    /**
     * Subscribe to live updates for a conversation's message list.
     * Calls `callback` immediately with the current messages, then again on every poll tick.
     * Returns an unsubscribe function.
     *
     * @example
     * const unsub = client.subscribeToMessages(conv._id, conv.type, msgs => setMessages(msgs));
     * // later:
     * unsub();
     */
    subscribeToMessages(conversationId: string, type: 'channel' | 'dm' | 'group', callback: MessagesCallback): () => void;
    /**
     * Subscribe to the full conversations list, refreshed on every poll tick.
     * Returns an unsubscribe function.
     */
    subscribeToConversations(callback: ConversationsCallback): () => void;
    /**
     * Subscribe to the unread message count, refreshed on every poll tick.
     * Returns an unsubscribe function.
     */
    subscribeToUnreadCount(callback: UnreadCallback): () => void;
    /**
     * Notify the client of an incoming FCM foreground message.
     * Call this from your FCM `onMessage` handler to trigger an immediate refresh
     * rather than waiting for the next poll tick.
     *
     * @example
     * onMessage(messaging, () => client.onForegroundPush());
     */
    onForegroundPush(): void;
    setTyping(conversationId: string, isTyping: boolean): Promise<void>;
    getTyping(conversationId: string): Promise<TypingStatusInfo>;
    getUnreadCount(): Promise<number>;
    getPreferences(): Promise<ChatPreferences>;
    muteUser(username: string): Promise<void>;
    unmuteUser(username: string): Promise<void>;
    blockUser(username: string): Promise<void>;
    unblockUser(username: string): Promise<void>;
    registerDevice(fcmToken: string): Promise<void>;
    markDmMemoFallbackSent(conversationId: string): Promise<void>;
    destroy(): void;
}

export { ChatClient as C, type DmDeliveryInfo as D, type Message as M, type StorageAdapter as S, type TypingStatusInfo as T, ChatService as a, type ChatClientOptions as b, type Channel as c, type Conversation as d, type MessagesResult as e, type DmStatusInfo as f, type ChatPreferences as g };
