export interface Channel {
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

export interface Message {
  _id: string;
  sender: string;
  content: string;
  replyTo?: string | null;
  editedAt?: string | null;
  createdAt: string;
  /** Usernames mentioned in `content`, extracted server-side at write time. */
  mentions?: string[];
  /** Sender of the message this replies to, denormalized server-side. */
  replyToSender?: string | null;
}

export interface Conversation {
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
  /** Unread messages in this conversation. Sums across conversations to the
   *  badge total — both come from the same server-side counter. */
  unreadCount?: number;
}

/**
 * Badge total plus its per-conversation breakdown.
 *
 * A DM (or a private group) counts every message someone else sent since you
 * last read it; a public channel only counts messages that mention you or reply
 * to something you wrote, so ambient channel chatter never badges. Messages
 * from muted or blocked users are excluded, as they are from the thread itself.
 */
export interface UnreadSnapshot {
  total: number;
  byConversation: Record<string, number>;
}

export interface DmDeliveryInfo {
  hasFcm: boolean;
  memoSuggested: boolean;
  cooldownMs: number;
}

export interface DmStatusInfo {
  meSeenAt: string;
  peerSeenAt: string | null;
  peerLastSeenAt: string | null;
  peerOnline: boolean;
}

export interface TypingStatusInfo {
  users: string[];
  ttlMs: number;
}

export interface ChatPreferences {
  mutedUsers: string[];
  blockedUsers: string[];
}

export interface MessagesResult {
  messages: Message[];
  status?: DmStatusInfo | null;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ChatClientOptions {
  /** Base URL of the Snapie instance, e.g. "https://snapie.io" */
  baseUrl: string;
  /** Override default localStorage — useful for React Native or Node */
  storage?: StorageAdapter;
  /** How often to poll for new messages when FCM is not available (ms, default 15000) */
  pollInterval?: number;
}
