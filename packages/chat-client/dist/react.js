'use strict';

var react = require('react');
var jsxRuntime = require('react/jsx-runtime');

// src/react/index.tsx
var ChatContext = react.createContext(null);
function ChatProvider({ client, children }) {
  return /* @__PURE__ */ jsxRuntime.jsx(ChatContext.Provider, { value: client, children });
}
function useChatClient() {
  const client = react.useContext(ChatContext);
  if (!client) throw new Error("useChatClient must be used inside <ChatProvider>");
  return client;
}
function useConversations(clientOverride) {
  const client = clientOverride ?? useChatClient();
  const [conversations, setConversations] = react.useState([]);
  const [loading, setLoading] = react.useState(true);
  react.useEffect(() => {
    let first = true;
    const unsub = client.subscribeToConversations((convs) => {
      setConversations(convs);
      if (first) {
        setLoading(false);
        first = false;
      }
    });
    return unsub;
  }, [client]);
  return { conversations, loading };
}
function useChatMessages(conversationId, type, clientOverride) {
  const client = clientOverride ?? useChatClient();
  const [messages, setMessages] = react.useState([]);
  const [loading, setLoading] = react.useState(false);
  const [error, setError] = react.useState(null);
  react.useEffect(() => {
    if (!conversationId || !client.isAuthenticated()) return;
    setLoading(true);
    setMessages([]);
    setError(null);
    let first = true;
    const unsub = client.subscribeToMessages(conversationId, type, (msgs) => {
      setMessages(msgs);
      if (first) {
        setLoading(false);
        first = false;
      }
    });
    return unsub;
  }, [client, conversationId, type]);
  const sendMessage = react.useCallback(
    async (content, replyTo) => {
      if (!conversationId) return;
      try {
        const { message } = await client.sendMessage(conversationId, type, content, replyTo);
        setMessages((prev) => [...prev, message]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed");
      }
    },
    [client, conversationId, type]
  );
  const editMessage = react.useCallback(
    async (messageId, content) => {
      if (!conversationId) return;
      const updated = await client.editMessage(conversationId, type, messageId, content);
      setMessages((prev) => prev.map((m) => m._id === updated._id ? updated : m));
    },
    [client, conversationId, type]
  );
  return { messages, loading, error, sendMessage, editMessage };
}
function useUnreadCount(clientOverride) {
  const client = clientOverride ?? useChatClient();
  const [unreadCount, setUnreadCount] = react.useState(0);
  react.useEffect(() => {
    if (!client.isAuthenticated()) return;
    const unsub = client.subscribeToUnreadCount(setUnreadCount);
    return unsub;
  }, [client]);
  return { unreadCount };
}
function useTyping(conversationId, clientOverride) {
  const client = clientOverride ?? useChatClient();
  const [typingUsers, setTypingUsers] = react.useState([]);
  const timerRef = react.useRef(null);
  react.useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(async () => {
      try {
        const info = await client.getTyping(conversationId);
        setTypingUsers(info.users);
      } catch {
      }
    }, 3e3);
    return () => clearInterval(interval);
  }, [client, conversationId]);
  const setTyping = react.useCallback(
    (isTyping) => {
      if (!conversationId) return;
      client.setTyping(conversationId, isTyping).catch(() => {
      });
      if (isTyping) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          client.setTyping(conversationId, false).catch(() => {
          });
        }, 5e3);
      }
    },
    [client, conversationId]
  );
  return { typingUsers, setTyping };
}

exports.ChatProvider = ChatProvider;
exports.useChatMessages = useChatMessages;
exports.useConversations = useConversations;
exports.useTyping = useTyping;
exports.useUnreadCount = useUnreadCount;
//# sourceMappingURL=react.js.map
//# sourceMappingURL=react.js.map