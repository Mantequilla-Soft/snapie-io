'use client';

export interface Channel {
  _id: string;
  name: string;
  description?: string;
  type: string;
  memberCount: number;
  isPublic: boolean;
}

export interface Message {
  _id: string;
  sender: string;
  content: string;
  replyTo?: string | null;
  createdAt: string;
}

const TOKEN_KEY = 'hive-chat-token';
const BASE = '/api/chat';

class ChatService {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem(TOKEN_KEY);
    }
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  async authenticate(
    username: string,
    signMessage: (msg: string) => Promise<string>
  ): Promise<void> {
    const { challenge } = await this.post<{ challenge: string }>(
      `${BASE}/auth/challenge`,
      { username },
      false
    );
    const signature = await signMessage(challenge);
    const { token } = await this.post<{ token: string }>(
      `${BASE}/auth/verify`,
      { username, challenge, signature },
      false
    );
    this.token = token;
    localStorage.setItem(TOKEN_KEY, token);
  }

  logout(): void {
    this.token = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  async getChannels(): Promise<Channel[]> {
    const { channels } = await this.get<{ channels: Channel[] }>(`${BASE}/channels`, false);
    return channels;
  }

  async getMessages(
    channelId: string,
    opts: { before?: string; limit?: number } = {}
  ): Promise<Message[]> {
    const params = new URLSearchParams();
    if (opts.before) params.set('before', opts.before);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const { messages } = await this.get<{ messages: Message[] }>(
      `${BASE}/channels/${channelId}/messages${qs ? `?${qs}` : ''}`,
      true
    );
    return messages;
  }

  async sendMessage(channelId: string, content: string, replyTo?: string): Promise<Message> {
    const { message } = await this.post<{ message: Message }>(
      `${BASE}/channels/${channelId}/messages`,
      { content, replyTo: replyTo || null },
      true
    );
    return message;
  }

  async joinChannel(channelId: string): Promise<void> {
    await this.post(`${BASE}/channels/${channelId}/join`, {}, true);
  }

  async leaveChannel(channelId: string): Promise<void> {
    await this.post(`${BASE}/channels/${channelId}/leave`, {}, true);
  }

  async registerDevice(fcmToken: string): Promise<void> {
    await this.post(`${BASE}/register-device`, { fcmToken }, true);
  }

  async getUnreadCount(): Promise<number> {
    if (!this.token) return 0;
    try {
      const { unread } = await this.get<{ unread: number }>(`${BASE}/unread`, true);
      return unread;
    } catch {
      return 0;
    }
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

  private async request<T>(url: string, opts: RequestInit, auth: boolean, retry = true): Promise<T> {
    const headers: Record<string, string> = {
      ...(opts.headers as Record<string, string>),
    };
    if (auth && this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(url, { ...opts, headers });

    if (res.status === 401 && auth && retry) {
      // Token expired — caller should re-authenticate
      this.token = null;
      localStorage.removeItem(TOKEN_KEY);
      throw new Error('CHAT_UNAUTHORIZED');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }
}

export const chatService = new ChatService();
