import type {
  Channel,
  Conversation,
  Message,
  MessagesResult,
  DmDeliveryInfo,
  TypingStatusInfo,
  ChatPreferences,
  StorageAdapter,
} from './types';

const TOKEN_KEY = 'snapie-chat-token';
const TOKEN_USER_KEY = 'snapie-chat-token-user';

export class ChatService {
  private token: string | null = null;
  private tokenUsername: string | null = null;
  private base: string;
  private storage: StorageAdapter;

  constructor(baseUrl: string, storage: StorageAdapter) {
    this.base = `${baseUrl.replace(/\/$/, '')}/api/chat`;
    this.storage = storage;
    this.token = storage.getItem(TOKEN_KEY);
    this.tokenUsername = storage.getItem(TOKEN_USER_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  getTokenUsername(): string | null {
    return this.tokenUsername;
  }

  async authenticate(
    username: string,
    signMessage: (msg: string) => Promise<string>
  ): Promise<void> {
    const { challenge } = await this.post<{ challenge: string }>(
      `${this.base}/auth/challenge`,
      { username },
      false
    );
    const signature = await signMessage(challenge);
    const { token } = await this.post<{ token: string }>(
      `${this.base}/auth/verify`,
      { username, challenge, signature },
      false
    );
    this.token = token;
    this.tokenUsername = username;
    this.storage.setItem(TOKEN_KEY, token);
    this.storage.setItem(TOKEN_USER_KEY, username);
  }

  logout(): void {
    this.token = null;
    this.tokenUsername = null;
    this.storage.removeItem(TOKEN_KEY);
    this.storage.removeItem(TOKEN_USER_KEY);
  }

  async getChannels(): Promise<Channel[]> {
    const { channels } = await this.get<{ channels: Channel[] }>(`${this.base}/channels`, false);
    return channels;
  }

  async getConversations(): Promise<Conversation[]> {
    const { conversations } = await this.get<{ conversations: Conversation[] }>(`${this.base}/conversations`, true);
    return conversations;
  }

  async getChannelMessages(
    channelId: string,
    opts: { before?: string; after?: string; limit?: number } = {}
  ): Promise<Message[]> {
    const qs = this.buildQS(opts);
    const { messages } = await this.get<{ messages: Message[] }>(
      `${this.base}/channels/${channelId}/messages${qs}`,
      true
    );
    return messages;
  }

  async sendChannelMessage(channelId: string, content: string, replyTo?: string): Promise<Message> {
    const { message } = await this.post<{ message: Message }>(
      `${this.base}/channels/${channelId}/messages`,
      { content, replyTo: replyTo ?? null },
      true
    );
    return message;
  }

  async editChannelMessage(channelId: string, messageId: string, content: string): Promise<Message> {
    const { message } = await this.request<{ message: Message }>(
      `${this.base}/channels/${channelId}/messages`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId, content }) },
      true
    );
    return message;
  }

  async joinChannel(channelId: string): Promise<void> {
    await this.post(`${this.base}/channels/${channelId}/join`, {}, true);
  }

  async leaveChannel(channelId: string): Promise<void> {
    await this.post(`${this.base}/channels/${channelId}/leave`, {}, true);
  }

  async getDmMessages(
    conversationId: string,
    opts: { before?: string; after?: string; limit?: number } = {}
  ): Promise<MessagesResult> {
    const qs = this.buildQS(opts);
    const { messages, status } = await this.get<MessagesResult>(
      `${this.base}/dm/${conversationId}/messages${qs}`,
      true
    );
    return { messages, status };
  }

  async sendDmMessage(
    conversationId: string,
    content: string,
    replyTo?: string
  ): Promise<{ message: Message; delivery?: DmDeliveryInfo }> {
    return this.post<{ message: Message; delivery?: DmDeliveryInfo }>(
      `${this.base}/dm/${conversationId}/messages`,
      { content, replyTo: replyTo ?? null },
      true
    );
  }

  async editDmMessage(conversationId: string, messageId: string, content: string): Promise<Message> {
    const { message } = await this.request<{ message: Message }>(
      `${this.base}/dm/${conversationId}/messages`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId, content }) },
      true
    );
    return message;
  }

  async openDm(targetUser: string): Promise<Conversation> {
    const { conversation } = await this.post<{ conversation: Conversation }>(
      `${this.base}/dm`,
      { targetUser },
      true
    );
    return conversation;
  }

  async createGroup(payload: {
    name: string;
    description?: string;
    isPublic?: boolean;
    members?: string[];
  }): Promise<Channel> {
    const { group } = await this.post<{ group: Channel }>(`${this.base}/groups`, payload, true);
    return group;
  }

  async getGroups(): Promise<Channel[]> {
    const { groups } = await this.get<{ groups: Channel[] }>(`${this.base}/groups`, true);
    return groups;
  }

  async addGroupMember(groupId: string, member: string): Promise<Channel> {
    const { group } = await this.post<{ group: Channel }>(
      `${this.base}/groups/${groupId}/members`,
      { member },
      true
    );
    return group;
  }

  async removeGroupMember(groupId: string, member: string): Promise<Channel> {
    const { group } = await this.request<{ group: Channel }>(
      `${this.base}/groups/${groupId}/members`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ member }) },
      true
    );
    return group;
  }

  async getUnreadCount(): Promise<number> {
    if (!this.token) return 0;
    try {
      const { unread } = await this.get<{ unread: number }>(`${this.base}/unread`, true);
      return unread;
    } catch {
      return 0;
    }
  }

  async setTyping(conversationId: string, isTyping: boolean): Promise<void> {
    await this.post(`${this.base}/typing`, { conversationId, isTyping }, true);
  }

  async getTyping(conversationId: string): Promise<TypingStatusInfo> {
    const qs = new URLSearchParams({ conversationId }).toString();
    return this.get<TypingStatusInfo>(`${this.base}/typing?${qs}`, true);
  }

  async getPreferences(): Promise<ChatPreferences> {
    return this.get<ChatPreferences>(`${this.base}/preferences`, true);
  }

  async muteUser(username: string): Promise<void> {
    await this.post(`${this.base}/preferences`, { action: 'mute', target: username }, true);
  }

  async unmuteUser(username: string): Promise<void> {
    await this.post(`${this.base}/preferences`, { action: 'unmute', target: username }, true);
  }

  async blockUser(username: string): Promise<void> {
    await this.post(`${this.base}/preferences`, { action: 'block', target: username }, true);
  }

  async unblockUser(username: string): Promise<void> {
    await this.post(`${this.base}/preferences`, { action: 'unblock', target: username }, true);
  }

  async registerDevice(fcmToken: string): Promise<void> {
    await this.post(`${this.base}/register-device`, { fcmToken }, true);
  }

  async markDmMemoFallbackSent(conversationId: string): Promise<void> {
    await this.post(`${this.base}/dm/${conversationId}/memo-fallback`, { success: true }, true);
  }

  private buildQS(opts: { before?: string; after?: string; limit?: number }): string {
    const p = new URLSearchParams();
    if (opts.before) p.set('before', opts.before);
    if (opts.after) p.set('after', opts.after);
    if (opts.limit) p.set('limit', String(opts.limit));
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  private async get<T>(url: string, auth: boolean): Promise<T> {
    return this.request<T>(url, { method: 'GET' }, auth);
  }

  private async post<T>(url: string, body: unknown, auth: boolean): Promise<T> {
    return this.request<T>(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      auth
    );
  }

  async request<T>(url: string, opts: RequestInit, auth: boolean): Promise<T> {
    const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
    if (auth && this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(url, { ...opts, headers });

    if (res.status === 401 && auth) {
      this.token = null;
      this.storage.removeItem(TOKEN_KEY);
      throw new Error('CHAT_UNAUTHORIZED');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }
}
