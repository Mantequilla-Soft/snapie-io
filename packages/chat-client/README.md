# @snapie/chat-client

Hive-authenticated chat SDK for [Snapie](https://snapie.io). Supports DMs, channels, groups, real-time subscriptions (polling + FCM), and typing indicators.

Works in any JavaScript/TypeScript environment. React hooks available as a separate entry point.

---

## Installation

```bash
npm install @snapie/chat-client
# or
pnpm add @snapie/chat-client
```

---

## Quick start

```typescript
import { ChatClient } from '@snapie/chat-client';

const client = new ChatClient({ baseUrl: 'https://snapie.io' });

// Authenticate with a Hive account (posting key challenge/response)
await client.authenticate(username, async (challenge) => {
  // Use Hive Keychain, Aioha, or any signing library
  return await keychain.signBuffer(username, challenge, 'Posting');
});

// Get all conversations
const conversations = await client.getConversations();

// Subscribe to live messages (polls every 15s, merges new ones)
const unsub = client.subscribeToMessages(conversationId, 'dm', (messages) => {
  console.log(messages);
});

// Send a message
await client.sendMessage(conversationId, 'dm', 'Hello from 3speak!');

// Stop subscribing
unsub();

// Clean up everything when done
client.destroy();
```

---

## Configuration

```typescript
const client = new ChatClient({
  baseUrl: 'https://snapie.io',   // required — Snapie instance URL
  pollInterval: 15000,             // optional — ms between polls (default: 15000)
  storage: customStorage,          // optional — custom StorageAdapter (see below)
});
```

### Custom storage (React Native / Node)

By default the client uses `localStorage`. Override it with any object that implements `getItem`, `setItem`, `removeItem`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const client = new ChatClient({
  baseUrl: 'https://snapie.io',
  storage: {
    getItem: (key) => AsyncStorage.getItem(key),      // note: sync wrapper needed
    setItem: (key, val) => AsyncStorage.setItem(key, val),
    removeItem: (key) => AsyncStorage.removeItem(key),
  },
});
```

---

## Authentication

The auth flow uses Hive's posting key signature — no passwords, no OAuth.

```typescript
// 1. Authenticate
await client.authenticate(username, async (challenge) => {
  return await signingLibrary.sign(challenge);
});

// 2. Check status
client.isAuthenticated(); // boolean
client.getUsername();     // string | null

// 3. Logout
client.logout();
```

---

## Conversations

```typescript
// List all conversations (DMs + channels + groups)
const conversations = await client.getConversations();
// Conversation { _id, name, type: 'dm'|'channel'|'group', lastMessage, unread, ... }

// Open or resume a DM with another Hive user
const conv = await client.openDm('alice');
```

---

## Messages

```typescript
// Fetch messages (one-time)
const { messages } = await client.getMessages(conversationId, 'dm');
const { messages } = await client.getMessages(channelId, 'channel', { limit: 50 });

// Send
const { message } = await client.sendMessage(conversationId, 'dm', 'Hey!');

// Reply
const { message } = await client.sendMessage(conversationId, 'dm', 'Got it', replyToMessageId);

// Edit
const updated = await client.editMessage(conversationId, 'dm', messageId, 'Edited text');
```

---

## Real-time subscriptions

All `subscribe*` methods return an **unsubscribe function**. They fire immediately with current data, then refresh on every poll tick.

```typescript
// Messages
const unsub = client.subscribeToMessages(conv._id, conv.type, (messages) => {
  setMessages(messages); // always the full ordered list
});

// Conversations list
const unsub = client.subscribeToConversations((conversations) => {
  setConversations(conversations);
});

// Unread badge count
const unsub = client.subscribeToUnreadCount((count) => {
  setBadge(count);
});

// Stop any subscription
unsub();
```

### FCM foreground integration

When a Firebase Cloud Messaging push arrives while the app is open, trigger an immediate refresh instead of waiting for the next poll tick:

```typescript
import { onMessage } from 'firebase/messaging';

onMessage(messaging, () => {
  client.onForegroundPush();
});
```

---

## Channels & groups

```typescript
// List public channels
const channels = await client.getChannels();

// Join / leave
await client.joinChannel(channelId);
await client.leaveChannel(channelId);

// Create a group
const group = await client.createGroup({
  name: 'My Group',
  description: 'Optional',
  isPublic: false,
  members: ['alice', 'bob'],
});

await client.addGroupMember(group._id, 'charlie');
await client.removeGroupMember(group._id, 'charlie');
```

---

## Typing indicators

```typescript
// Signal that the current user is typing
await client.setTyping(conversationId, true);
await client.setTyping(conversationId, false);

// Poll who else is typing
const { users } = await client.getTyping(conversationId);
// users: string[] — list of usernames currently typing
```

---

## Preferences

```typescript
await client.muteUser('spammer');
await client.unmuteUser('spammer');
await client.blockUser('troll');
await client.unblockUser('troll');

const prefs = await client.getPreferences();
// { mutedUsers: string[], blockedUsers: string[] }
```

---

## Image uploads & rendering

### Uploading an image

```typescript
// Upload a File and get back the public URL
const url = await client.uploadImage(file, username, async (challenge) => {
  return await keychain.signBuffer(username, challenge, 'Posting');
});

// Embed the URL in a message
await client.sendMessage(conversationId, 'dm', url);
// or append to text:
await client.sendMessage(conversationId, 'dm', `Check this out\n${url}`);
```

### Rendering image messages

Snapie embeds image URLs as plain text inside `message.content`. Use `extractImageUrls` to detect and render them:

```typescript
import { extractImageUrls } from '@snapie/chat-client';

function MessageBubble({ message }) {
  const images = extractImageUrls(message.content);
  return (
    <div>
      <p>{message.content}</p>
      {images.map(url => <img key={url} src={url} alt="" />)}
    </div>
  );
}
```

`isImageUrl(url)` is also exported if you need to check a single URL.

---

## Push notifications (FCM)

```typescript
// Register a device token so this user receives push notifications
await client.registerDevice(fcmToken);
```

---

## React hooks

```tsx
import { ChatProvider, useConversations, useChatMessages, useUnreadCount, useTyping } from '@snapie/chat-client/react';

// Wrap once at the top level
<ChatProvider client={client}>
  <App />
</ChatProvider>
```

### `useConversations`

```tsx
function ConversationList() {
  const { conversations, loading } = useConversations();
  if (loading) return <Spinner />;
  return conversations.map(conv => <ConvRow key={conv._id} conv={conv} />);
}
```

### `useChatMessages`

```tsx
function MessageView({ conv }) {
  const { messages, loading, sendMessage, editMessage } = useChatMessages(conv._id, conv.type);

  return (
    <>
      {messages.map(m => <Bubble key={m._id} message={m} />)}
      <Input onSend={sendMessage} />
    </>
  );
}
```

### `useUnreadCount`

```tsx
function ChatButton() {
  const { unreadCount } = useUnreadCount();
  return <Button badge={unreadCount}>Chat</Button>;
}
```

### `useTyping`

```tsx
function TypingIndicator({ convId }) {
  const { typingUsers, setTyping } = useTyping(convId);
  // setTyping(true) when user starts typing — auto-clears after 5s
  return typingUsers.length > 0 ? <Text>{typingUsers.join(', ')} is typing...</Text> : null;
}
```

---

## TypeScript types

All types are exported from the main entry point:

```typescript
import type {
  ChatClient,
  ChatClientOptions,
  Conversation,
  Message,
  Channel,
  MessagesResult,
  DmDeliveryInfo,
  DmStatusInfo,
  TypingStatusInfo,
  ChatPreferences,
  StorageAdapter,
} from '@snapie/chat-client';
```

---

## Backend

The SDK communicates with the Snapie chat API at `{baseUrl}/api/chat/*`. The backend is hosted at `https://snapie.io`. Auth tokens are JWTs issued after Hive posting-key signature verification and are stored in the configured storage adapter.
