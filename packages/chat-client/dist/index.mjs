// src/service.ts
var TOKEN_KEY = "snapie-chat-token";
var TOKEN_USER_KEY = "snapie-chat-token-user";
var ChatService = class {
  constructor(baseUrl, storage) {
    this.token = null;
    this.tokenUsername = null;
    this.base = `${baseUrl.replace(/\/$/, "")}/api/chat`;
    this.storage = storage;
    this.token = storage.getItem(TOKEN_KEY);
    this.tokenUsername = storage.getItem(TOKEN_USER_KEY);
  }
  isAuthenticated() {
    return !!this.token;
  }
  getTokenUsername() {
    return this.tokenUsername;
  }
  async authenticate(username, signMessage) {
    const { challenge } = await this.post(
      `${this.base}/auth/challenge`,
      { username },
      false
    );
    const signature = await signMessage(challenge);
    const { token } = await this.post(
      `${this.base}/auth/verify`,
      { username, challenge, signature },
      false
    );
    this.token = token;
    this.tokenUsername = username;
    this.storage.setItem(TOKEN_KEY, token);
    this.storage.setItem(TOKEN_USER_KEY, username);
  }
  logout() {
    this.token = null;
    this.tokenUsername = null;
    this.storage.removeItem(TOKEN_KEY);
    this.storage.removeItem(TOKEN_USER_KEY);
  }
  async getChannels() {
    const { channels } = await this.get(`${this.base}/channels`, false);
    return channels;
  }
  async getConversations() {
    const { conversations } = await this.get(`${this.base}/conversations`, true);
    return conversations;
  }
  async getChannelMessages(channelId, opts = {}) {
    const qs = this.buildQS(opts);
    const { messages } = await this.get(
      `${this.base}/channels/${channelId}/messages${qs}`,
      true
    );
    return messages;
  }
  async sendChannelMessage(channelId, content, replyTo) {
    const { message } = await this.post(
      `${this.base}/channels/${channelId}/messages`,
      { content, replyTo: replyTo ?? null },
      true
    );
    return message;
  }
  async editChannelMessage(channelId, messageId, content) {
    const { message } = await this.request(
      `${this.base}/channels/${channelId}/messages`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, content }) },
      true
    );
    return message;
  }
  async joinChannel(channelId) {
    await this.post(`${this.base}/channels/${channelId}/join`, {}, true);
  }
  async leaveChannel(channelId) {
    await this.post(`${this.base}/channels/${channelId}/leave`, {}, true);
  }
  async getDmMessages(conversationId, opts = {}) {
    const qs = this.buildQS(opts);
    const { messages, status } = await this.get(
      `${this.base}/dm/${conversationId}/messages${qs}`,
      true
    );
    return { messages, status };
  }
  async sendDmMessage(conversationId, content, replyTo) {
    return this.post(
      `${this.base}/dm/${conversationId}/messages`,
      { content, replyTo: replyTo ?? null },
      true
    );
  }
  async editDmMessage(conversationId, messageId, content) {
    const { message } = await this.request(
      `${this.base}/dm/${conversationId}/messages`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, content }) },
      true
    );
    return message;
  }
  async openDm(targetUser) {
    const { conversation } = await this.post(
      `${this.base}/dm`,
      { targetUser },
      true
    );
    return conversation;
  }
  async createGroup(payload) {
    const { group } = await this.post(`${this.base}/groups`, payload, true);
    return group;
  }
  async getGroups() {
    const { groups } = await this.get(`${this.base}/groups`, true);
    return groups;
  }
  async addGroupMember(groupId, member) {
    const { group } = await this.post(
      `${this.base}/groups/${groupId}/members`,
      { member },
      true
    );
    return group;
  }
  async removeGroupMember(groupId, member) {
    const { group } = await this.request(
      `${this.base}/groups/${groupId}/members`,
      { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ member }) },
      true
    );
    return group;
  }
  async getUnreadCount() {
    if (!this.token) return 0;
    try {
      const { unread } = await this.get(`${this.base}/unread`, true);
      return unread;
    } catch {
      return 0;
    }
  }
  async setTyping(conversationId, isTyping) {
    await this.post(`${this.base}/typing`, { conversationId, isTyping }, true);
  }
  async getTyping(conversationId) {
    const qs = new URLSearchParams({ conversationId }).toString();
    return this.get(`${this.base}/typing?${qs}`, true);
  }
  async getPreferences() {
    return this.get(`${this.base}/preferences`, true);
  }
  async muteUser(username) {
    await this.post(`${this.base}/preferences`, { action: "mute", target: username }, true);
  }
  async unmuteUser(username) {
    await this.post(`${this.base}/preferences`, { action: "unmute", target: username }, true);
  }
  async blockUser(username) {
    await this.post(`${this.base}/preferences`, { action: "block", target: username }, true);
  }
  async unblockUser(username) {
    await this.post(`${this.base}/preferences`, { action: "unblock", target: username }, true);
  }
  async registerDevice(fcmToken) {
    await this.post(`${this.base}/register-device`, { fcmToken }, true);
  }
  async markDmMemoFallbackSent(conversationId) {
    await this.post(`${this.base}/dm/${conversationId}/memo-fallback`, { success: true }, true);
  }
  buildQS(opts) {
    const p = new URLSearchParams();
    if (opts.before) p.set("before", opts.before);
    if (opts.after) p.set("after", opts.after);
    if (opts.limit) p.set("limit", String(opts.limit));
    const s = p.toString();
    return s ? `?${s}` : "";
  }
  async get(url, auth) {
    return this.request(url, { method: "GET" }, auth);
  }
  async post(url, body, auth) {
    return this.request(
      url,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      auth
    );
  }
  async request(url, opts, auth) {
    const headers = { ...opts.headers };
    if (auth && this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401 && auth) {
      this.token = null;
      this.storage.removeItem(TOKEN_KEY);
      throw new Error("CHAT_UNAUTHORIZED");
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    return res.json();
  }
};

// src/polling.ts
var PollingManager = class {
  constructor(intervalMs) {
    this.timer = null;
    this.handlers = /* @__PURE__ */ new Set();
    this.interval = intervalMs;
  }
  subscribe(handler) {
    this.handlers.add(handler);
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), this.interval);
    }
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }
  tick() {
    for (const h of this.handlers) {
      try {
        h();
      } catch {
      }
    }
  }
  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.handlers.clear();
  }
};

// src/storage.ts
function createDefaultStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  const mem = {};
  return {
    getItem: (k) => mem[k] ?? null,
    setItem: (k, v) => {
      mem[k] = v;
    },
    removeItem: (k) => {
      delete mem[k];
    }
  };
}

// src/client.ts
var ChatClient = class {
  constructor(options) {
    /** Cache of messages per conversationId — avoids re-rendering unchanged data */
    this.messageCache = /* @__PURE__ */ new Map();
    const storage = options.storage ?? createDefaultStorage();
    this.service = new ChatService(options.baseUrl, storage);
    this.poller = new PollingManager(options.pollInterval ?? 15e3);
  }
  // ── Auth ─────────────────────────────────────────────────────────────────
  isAuthenticated() {
    return this.service.isAuthenticated();
  }
  getUsername() {
    return this.service.getTokenUsername();
  }
  /**
   * Authenticate with a Hive account.
   * `signMessage` should call Hive Keychain or equivalent with the posting key.
   */
  async authenticate(username, signMessage) {
    return this.service.authenticate(username, signMessage);
  }
  logout() {
    this.service.logout();
    this.messageCache.clear();
  }
  // ── Conversations ────────────────────────────────────────────────────────
  getConversations() {
    return this.service.getConversations();
  }
  openDm(targetUser) {
    return this.service.openDm(targetUser);
  }
  // ── Channels ─────────────────────────────────────────────────────────────
  getChannels() {
    return this.service.getChannels();
  }
  getGroups() {
    return this.service.getGroups();
  }
  joinChannel(channelId) {
    return this.service.joinChannel(channelId);
  }
  leaveChannel(channelId) {
    return this.service.leaveChannel(channelId);
  }
  createGroup(payload) {
    return this.service.createGroup(payload);
  }
  addGroupMember(groupId, member) {
    return this.service.addGroupMember(groupId, member);
  }
  removeGroupMember(groupId, member) {
    return this.service.removeGroupMember(groupId, member);
  }
  // ── Messages ─────────────────────────────────────────────────────────────
  async getMessages(conversationId, type, opts = {}) {
    if (type === "dm") {
      return this.service.getDmMessages(conversationId, opts);
    }
    const messages = await this.service.getChannelMessages(conversationId, opts);
    return { messages };
  }
  async sendMessage(conversationId, type, content, replyTo) {
    if (type === "dm") {
      return this.service.sendDmMessage(conversationId, content, replyTo);
    }
    const message = await this.service.sendChannelMessage(conversationId, content, replyTo);
    return { message };
  }
  async editMessage(conversationId, type, messageId, content) {
    if (type === "dm") {
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
  subscribeToMessages(conversationId, type, callback) {
    let latestMessageId;
    const fetch2 = async () => {
      try {
        const opts = latestMessageId ? { after: latestMessageId } : { limit: 40 };
        const { messages: incoming } = await this.getMessages(conversationId, type, opts);
        if (incoming.length === 0) return;
        const existing = this.messageCache.get(conversationId) ?? [];
        if (latestMessageId) {
          const existingIds = new Set(existing.map((m) => m._id));
          const fresh = incoming.filter((m) => !existingIds.has(m._id));
          if (fresh.length === 0) return;
          const merged = [...existing, ...fresh];
          this.messageCache.set(conversationId, merged);
          callback(merged);
        } else {
          this.messageCache.set(conversationId, incoming);
          callback(incoming);
        }
        latestMessageId = incoming[incoming.length - 1]._id;
      } catch {
      }
    };
    fetch2();
    const stopPolling = this.poller.subscribe(fetch2);
    return () => {
      stopPolling();
    };
  }
  /**
   * Subscribe to the full conversations list, refreshed on every poll tick.
   * Returns an unsubscribe function.
   */
  subscribeToConversations(callback) {
    const fetch2 = async () => {
      try {
        const conversations = await this.service.getConversations();
        callback(conversations);
      } catch {
      }
    };
    fetch2();
    return this.poller.subscribe(fetch2);
  }
  /**
   * Subscribe to the unread message count, refreshed on every poll tick.
   * Returns an unsubscribe function.
   */
  subscribeToUnreadCount(callback) {
    const fetch2 = async () => {
      try {
        const count = await this.service.getUnreadCount();
        callback(count);
      } catch {
        callback(0);
      }
    };
    fetch2();
    return this.poller.subscribe(fetch2);
  }
  /**
   * Notify the client of an incoming FCM foreground message.
   * Call this from your FCM `onMessage` handler to trigger an immediate refresh
   * rather than waiting for the next poll tick.
   *
   * @example
   * onMessage(messaging, () => client.onForegroundPush());
   */
  onForegroundPush() {
    for (const handler of this.poller.handlers) {
      try {
        handler();
      } catch {
      }
    }
  }
  // ── Presence & typing ────────────────────────────────────────────────────
  setTyping(conversationId, isTyping) {
    return this.service.setTyping(conversationId, isTyping);
  }
  getTyping(conversationId) {
    return this.service.getTyping(conversationId);
  }
  getUnreadCount() {
    return this.service.getUnreadCount();
  }
  // ── Preferences ──────────────────────────────────────────────────────────
  getPreferences() {
    return this.service.getPreferences();
  }
  muteUser(username) {
    return this.service.muteUser(username);
  }
  unmuteUser(username) {
    return this.service.unmuteUser(username);
  }
  blockUser(username) {
    return this.service.blockUser(username);
  }
  unblockUser(username) {
    return this.service.unblockUser(username);
  }
  // ── Push notifications ────────────────────────────────────────────────────
  registerDevice(fcmToken) {
    return this.service.registerDevice(fcmToken);
  }
  markDmMemoFallbackSent(conversationId) {
    return this.service.markDmMemoFallbackSent(conversationId);
  }
  // ── Cleanup ───────────────────────────────────────────────────────────────
  destroy() {
    this.poller.destroy();
    this.messageCache.clear();
  }
};

export { ChatClient, ChatService, PollingManager, createDefaultStorage };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map