import { ChatService } from './service';
import { PollingManager } from './polling';
import { createDefaultStorage } from './storage';
import type {
  ChatClientOptions,
  Channel,
  Conversation,
  Message,
  MessagesResult,
  ChatPreferences,
  TypingStatusInfo,
  DmDeliveryInfo,
} from './types';

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
export class ChatClient {
  readonly service: ChatService;
  private poller: PollingManager;

  /** Cache of messages per conversationId — avoids re-rendering unchanged data */
  private messageCache: Map<string, Message[]> = new Map();

  constructor(options: ChatClientOptions) {
    const storage = options.storage ?? createDefaultStorage();
    this.service = new ChatService(options.baseUrl, storage);
    this.poller = new PollingManager(options.pollInterval ?? 15_000);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  isAuthenticated(): boolean {
    return this.service.isAuthenticated();
  }

  getUsername(): string | null {
    return this.service.getTokenUsername();
  }

  /**
   * Authenticate with a Hive account.
   * `signMessage` should call Hive Keychain or equivalent with the posting key.
   */
  async authenticate(
    username: string,
    signMessage: (challenge: string) => Promise<string>
  ): Promise<void> {
    return this.service.authenticate(username, signMessage);
  }

  logout(): void {
    this.service.logout();
    this.messageCache.clear();
  }

  // ── Conversations ────────────────────────────────────────────────────────

  getConversations(): Promise<Conversation[]> {
    return this.service.getConversations();
  }

  openDm(targetUser: string): Promise<Conversation> {
    return this.service.openDm(targetUser);
  }

  // ── Channels ─────────────────────────────────────────────────────────────

  getChannels(): Promise<Channel[]> {
    return this.service.getChannels();
  }

  getGroups(): Promise<Channel[]> {
    return this.service.getGroups();
  }

  joinChannel(channelId: string): Promise<void> {
    return this.service.joinChannel(channelId);
  }

  leaveChannel(channelId: string): Promise<void> {
    return this.service.leaveChannel(channelId);
  }

  createGroup(payload: {
    name: string;
    description?: string;
    isPublic?: boolean;
    members?: string[];
  }): Promise<Channel> {
    return this.service.createGroup(payload);
  }

  addGroupMember(groupId: string, member: string): Promise<Channel> {
    return this.service.addGroupMember(groupId, member);
  }

  removeGroupMember(groupId: string, member: string): Promise<Channel> {
    return this.service.removeGroupMember(groupId, member);
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async getMessages(
    conversationId: string,
    type: 'channel' | 'dm' | 'group',
    opts: { before?: string; after?: string; limit?: number } = {}
  ): Promise<MessagesResult> {
    if (type === 'dm') {
      return this.service.getDmMessages(conversationId, opts);
    }
    const messages = await this.service.getChannelMessages(conversationId, opts);
    return { messages };
  }

  async sendMessage(
    conversationId: string,
    type: 'channel' | 'dm' | 'group',
    content: string,
    replyTo?: string
  ): Promise<{ message: Message; delivery?: DmDeliveryInfo }> {
    if (type === 'dm') {
      return this.service.sendDmMessage(conversationId, content, replyTo);
    }
    const message = await this.service.sendChannelMessage(conversationId, content, replyTo);
    return { message };
  }

  async editMessage(
    conversationId: string,
    type: 'channel' | 'dm' | 'group',
    messageId: string,
    content: string
  ): Promise<Message> {
    if (type === 'dm') {
      return this.service.editDmMessage(conversationId, messageId, content);
    }
    return this.service.editChannelMessage(conversationId, messageId, content);
  }

  // ── Real-time subscriptions ───────────────────────────────────────────────

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
  subscribeToMessages(
    conversationId: string,
    type: 'channel' | 'dm' | 'group',
    callback: MessagesCallback
  ): () => void {
    let latestMessageId: string | undefined;

    const fetch = async () => {
      try {
        const opts = latestMessageId ? { after: latestMessageId } : { limit: 40 };
        const { messages: incoming } = await this.getMessages(conversationId, type, opts);
        if (incoming.length === 0) return;

        const existing = this.messageCache.get(conversationId) ?? [];

        if (latestMessageId) {
          // Append only genuinely new messages
          const existingIds = new Set(existing.map(m => m._id));
          const fresh = incoming.filter(m => !existingIds.has(m._id));
          if (fresh.length === 0) return;
          const merged = [...existing, ...fresh];
          this.messageCache.set(conversationId, merged);
          callback(merged);
        } else {
          // Initial load
          this.messageCache.set(conversationId, incoming);
          callback(incoming);
        }

        latestMessageId = incoming[incoming.length - 1]._id;
      } catch {
        // Silently retry on next tick
      }
    };

    // Fire immediately, then on each poll tick
    fetch();
    const stopPolling = this.poller.subscribe(fetch);

    return () => {
      stopPolling();
    };
  }

  /**
   * Subscribe to the full conversations list, refreshed on every poll tick.
   * Returns an unsubscribe function.
   */
  subscribeToConversations(callback: ConversationsCallback): () => void {
    const fetch = async () => {
      try {
        const conversations = await this.service.getConversations();
        callback(conversations);
      } catch {
        // Silently retry on next tick
      }
    };

    fetch();
    return this.poller.subscribe(fetch);
  }

  /**
   * Subscribe to the unread message count, refreshed on every poll tick.
   * Returns an unsubscribe function.
   */
  subscribeToUnreadCount(callback: UnreadCallback): () => void {
    const fetch = async () => {
      try {
        const count = await this.service.getUnreadCount();
        callback(count);
      } catch {
        callback(0);
      }
    };

    fetch();
    return this.poller.subscribe(fetch);
  }

  /**
   * Notify the client of an incoming FCM foreground message.
   * Call this from your FCM `onMessage` handler to trigger an immediate refresh
   * rather than waiting for the next poll tick.
   *
   * @example
   * onMessage(messaging, () => client.onForegroundPush());
   */
  onForegroundPush(): void {
    for (const handler of (this.poller as unknown as { handlers: Set<() => void> }).handlers) {
      try { handler(); } catch { /* */ }
    }
  }

  // ── Presence & typing ────────────────────────────────────────────────────

  setTyping(conversationId: string, isTyping: boolean): Promise<void> {
    return this.service.setTyping(conversationId, isTyping);
  }

  getTyping(conversationId: string): Promise<TypingStatusInfo> {
    return this.service.getTyping(conversationId);
  }

  getUnreadCount(): Promise<number> {
    return this.service.getUnreadCount();
  }

  // ── Preferences ──────────────────────────────────────────────────────────

  getPreferences(): Promise<ChatPreferences> {
    return this.service.getPreferences();
  }

  muteUser(username: string): Promise<void> {
    return this.service.muteUser(username);
  }

  unmuteUser(username: string): Promise<void> {
    return this.service.unmuteUser(username);
  }

  blockUser(username: string): Promise<void> {
    return this.service.blockUser(username);
  }

  unblockUser(username: string): Promise<void> {
    return this.service.unblockUser(username);
  }

  // ── Push notifications ────────────────────────────────────────────────────

  registerDevice(fcmToken: string): Promise<void> {
    return this.service.registerDevice(fcmToken);
  }

  markDmMemoFallbackSent(conversationId: string): Promise<void> {
    return this.service.markDmMemoFallbackSent(conversationId);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy(): void {
    this.poller.destroy();
    this.messageCache.clear();
  }
}
