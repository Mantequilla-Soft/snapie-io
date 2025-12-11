"use client";

import { useState, useEffect, useRef } from "react";
import { buildEcencyAccessToken, bootstrapEcencyChat, hasEcencyChatSession } from "@/lib/hive/ecency-auth";
import { useHiveUser } from "@/contexts/UserContext";

interface Message {
  id: string;
  message: string;
  user_id: string;
  username?: string;
  create_at: number;
}

interface Channel {
  id: string;
  name: string;
  display_name: string;
}

export default function ChatPanel() {
  const { hiveUser: user } = useHiveUser();
  const [isOpen, setIsOpen] = useState(false);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if already bootstrapped on mount
  useEffect(() => {
    if (hasEcencyChatSession()) {
      setIsBootstrapped(true);
      loadChannel();
    }
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleBootstrap = async () => {
    if (!user?.name) {
      setError("Please log in first");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Generate access token using Keychain
      const accessToken = await buildEcencyAccessToken(user.name);

      // Bootstrap chat
      const response = await fetch("/api/chat/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: user.name,
          accessToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Bootstrap failed");
      }

      const data = await response.json();
      setIsBootstrapped(true);
      
      // Load channel
      await loadChannel();
    } catch (err: any) {
      console.error("Bootstrap error:", err);
      setError(err.message || "Failed to connect to chat");
    } finally {
      setIsLoading(false);
    }
  };

  const loadChannel = async () => {
    try {
      const response = await fetch("/api/chat/channels", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load channels");
      }

      const channels = await response.json();
      
      // Find Snapie community channel
      const snapieChannel = channels.find((ch: Channel) => 
        ch.name.includes(process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || "hive-178315")
      );

      if (snapieChannel) {
        setChannel(snapieChannel);
        await loadMessages(snapieChannel.id);
      }
    } catch (err: any) {
      console.error("Load channel error:", err);
      setError(err.message);
    }
  };

  const loadMessages = async (channelId: string) => {
    try {
      const response = await fetch(`/api/chat/channels/${channelId}/posts`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load messages");
      }

      const data = await response.json();
      
      // Parse messages from Mattermost response
      if (data.posts && data.order) {
        const parsedMessages = data.order.map((id: string) => ({
          id,
          message: data.posts[id].message,
          user_id: data.posts[id].user_id,
          username: data.users?.[data.posts[id].user_id]?.username || "Unknown",
          create_at: data.posts[id].create_at,
        })).reverse(); // Reverse to show oldest first

        setMessages(parsedMessages);
      }
    } catch (err: any) {
      console.error("Load messages error:", err);
      setError(err.message);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !channel) return;

    try {
      const response = await fetch(`/api/chat/channels/${channel.id}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          message: newMessage,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      setNewMessage("");
      
      // Reload messages
      await loadMessages(channel.id);
    } catch (err: any) {
      console.error("Send message error:", err);
      setError(err.message);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <>
      {/* Chat toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg"
        aria-label="Toggle chat"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-50 w-96 h-[500px] bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {channel ? channel.display_name : "Snapie Chat"}
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {!isBootstrapped ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center">
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Connect to Snapie chat
                  </p>
                  <button
                    onClick={handleBootstrap}
                    disabled={isLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
                  >
                    {isLoading ? "Connecting..." : "Connect"}
                  </button>
                  {error && (
                    <p className="text-red-500 text-sm mt-2">{error}</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className="flex flex-col">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">
                          {msg.username}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(msg.create_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 text-sm">
                        {msg.message}
                      </p>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={!newMessage.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
