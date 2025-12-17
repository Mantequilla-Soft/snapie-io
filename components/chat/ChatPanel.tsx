"use client";

import { useState, useEffect, useRef } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Flex,
  IconButton,
  Spinner,
  Avatar,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Badge,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  Wrap,
  WrapItem,
  Tooltip,
} from "@chakra-ui/react";
import { CloseIcon, ChevronLeftIcon, AddIcon, MinusIcon } from "@chakra-ui/icons";
import { buildEcencyAccessToken, bootstrapEcencyChat, hasEcencyChatSession } from "@/lib/hive/ecency-auth";
import { useKeychain } from "@/contexts/KeychainContext";
import { getHiveAvatarUrl } from "@/lib/utils/avatarUtils";
import { FiMessageSquare } from "react-icons/fi";
import Image from "next/image";

// Common emoji reactions
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀"];

// Map Mattermost emoji names back to emoji characters for display
const NAME_TO_EMOJI: { [key: string]: string } = {
  "+1": "👍",
  "-1": "👎",
  "thumbsup": "👍",
  "thumbsdown": "👎",
  "heart": "❤️",
  "joy": "😂",
  "open_mouth": "😮",
  "cry": "😢",
  "fire": "🔥",
  "tada": "🎉",
  "eyes": "👀",
  "grinning": "😀",
  "slightly_smiling_face": "🙂",
  "heart_eyes": "😍",
  "thinking": "🤔",
  "clap": "👏",
  "rocket": "🚀",
};

// Regex to detect GIF/image URLs
const GIF_URL_REGEX = /(https?:\/\/[^\s]+\.(?:gif|gifv|webp|png|jpg|jpeg)(?:\?[^\s]*)?)/gi;
const GIPHY_MEDIA_REGEX = /(https?:\/\/media[0-9]?\.giphy\.com\/[^\s]+)/gi;

// Helper function to render message content with GIF support
function renderMessageContent(message: string): React.ReactNode {
  // Check for GIF/image URLs (including Giphy media URLs)
  const gifMatches = message.match(GIF_URL_REGEX) || message.match(GIPHY_MEDIA_REGEX);
  
  if (gifMatches && gifMatches.length > 0) {
    // Split message into parts (text and images)
    const parts: React.ReactNode[] = [];
    let remainingText = message;
    let keyIndex = 0;
    
    // Find all image URLs and split around them
    const allUrls = [...(message.match(GIF_URL_REGEX) || []), ...(message.match(GIPHY_MEDIA_REGEX) || [])];
    const uniqueUrls = [...new Set(allUrls)];
    
    for (const url of uniqueUrls) {
      const index = remainingText.indexOf(url);
      if (index !== -1) {
        // Add text before the URL
        if (index > 0) {
          const textBefore = remainingText.substring(0, index).trim();
          if (textBefore) {
            parts.push(
              <Text key={`text-${keyIndex++}`} wordBreak="break-word" whiteSpace="pre-wrap">
                {textBefore}
              </Text>
            );
          }
        }
        
        // Add the image
        parts.push(
          <Box key={`img-${keyIndex++}`} mt={1} mb={1} position="relative" maxW="200px" maxH="200px">
            <Image 
              src={url} 
              alt="GIF"
              width={200}
              height={200}
              style={{ 
                borderRadius: '8px',
                objectFit: 'contain',
                width: 'auto',
                height: 'auto',
                maxWidth: '200px',
                maxHeight: '200px'
              }}
              unoptimized // GIFs need to be unoptimized to animate
            />
          </Box>
        );
        
        // Update remaining text
        remainingText = remainingText.substring(index + url.length);
      }
    }
    
    // Add any remaining text
    if (remainingText.trim()) {
      parts.push(
        <Text key={`text-${keyIndex++}`} wordBreak="break-word" whiteSpace="pre-wrap">
          {remainingText.trim()}
        </Text>
      );
    }
    
    return <>{parts}</>;
  }
  
  // No images, just return text with proper wrapping
  return (
    <Text wordBreak="break-word" whiteSpace="pre-wrap">
      {message}
    </Text>
  );
}

interface Reaction {
  emoji_name: string;
  user_id: string;
  username?: string;
}

interface Message {
  id: string;
  message: string;
  user_id: string;
  username?: string;
  create_at: number;
  reactions?: Reaction[];
}

interface Channel {
  id: string;
  name: string;
  display_name: string;
  type?: string; // 'O' for open/community, 'D' for direct
  last_post_at?: number;
}

interface DMChannel extends Channel {
  otherUser: string; // The username of the other person in the DM
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  unreadCount?: number;
}

export default function ChatPanel({ isOpen, onClose, isMinimized, onMinimize, onRestore, unreadCount = 0 }: ChatPanelProps) {
  const { user, isLoggedIn } = useKeychain();
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Draggable bubble state - start above mobile footer (60px footer + some padding)
  const [bubblePosition, setBubblePosition] = useState({ x: 20, y: typeof window !== 'undefined' ? window.innerHeight - 140 : 500 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const bubbleRef = useRef<HTMLDivElement>(null);
  
  const [channel, setChannel] = useState<Channel | null>(null);
  const [communityChannel, setCommunityChannel] = useState<Channel | null>(null);
  const [dmChannels, setDmChannels] = useState<DMChannel[]>([]); // List of DM conversations
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isDM, setIsDM] = useState(false);
  const [activeTab, setActiveTab] = useState(0); // 0 = Community, 1 = DMs
  const [selectedDM, setSelectedDM] = useState<DMChannel | null>(null); // Currently viewing DM
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [usePollingFallback, setUsePollingFallback] = useState(false);
  const lastMessageCountRef = useRef<number>(0);
  const previousUserRef = useRef<string | null>(null);

  // Reset chat state when user changes (login/logout/switch account)
  useEffect(() => {
    // Skip on initial mount
    if (previousUserRef.current === null) {
      previousUserRef.current = user || '';
      return;
    }

    // User changed - reset everything
    if (previousUserRef.current !== (user || '')) {
      console.log('👤 [Chat] User changed from', previousUserRef.current, 'to', user, '- resetting chat');
      
      // Close existing WebSocket connection
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      setUsePollingFallback(false);
      
      // Clear all chat state
      setIsBootstrapped(false);
      setChannel(null);
      setCommunityChannel(null);
      setDmChannels([]);
      setMessages([]);
      setSelectedDM(null);
      setActiveTab(0);
      setError(null);
      lastMessageCountRef.current = 0;
      
      // Clear the mm_pat cookie by setting it to expire
      document.cookie = 'mm_pat=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      
      previousUserRef.current = user || '';
      
      // If new user exists and chat is open, they'll need to re-bootstrap
      // The UI will show the "Connect to Chat" button
    }
  }, [user]);

  // Check if already bootstrapped on mount
  useEffect(() => {
    if (hasEcencyChatSession()) {
      setIsBootstrapped(true);
      loadChannel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally run only on mount

  // Scroll to bottom when messages change (only if new messages arrived)
  useEffect(() => {
    // Only auto-scroll if we have more messages than before (new message arrived)
    if (messages.length > lastMessageCountRef.current) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 50);
    }
    lastMessageCountRef.current = messages.length;
  }, [messages]);

  // WebSocket connection for real-time messages
  useEffect(() => {
    // Cleanup function to close websocket and clear reconnect timeout
    const cleanup = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (websocketRef.current) {
        console.log('🔌 [Chat] Closing WebSocket connection');
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };

    // Only connect if chat is open, not minimized, bootstrapped, and has a channel
    const shouldConnect = isOpen && !isMinimized && isBootstrapped && channel;
    
    if (!shouldConnect) {
      cleanup();
      return;
    }

    // Don't reconnect if already connected
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const connectWebSocket = () => {
      // Use the Ecency websocket proxy - it handles auth via the mm_pat cookie
      const wsUrl = 'wss://ecency.com/api/mattermost/websocket';
      
      console.log('🔌 [Chat] Connecting to WebSocket:', wsUrl);
      
      const socket = new WebSocket(wsUrl);
      websocketRef.current = socket;

      socket.addEventListener('open', () => {
        console.log('🔌 [Chat] WebSocket connected');
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
        
        // Send ping to confirm connection
        socket.send(JSON.stringify({ seq: 1, action: 'ping' }));
      });

      socket.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different event types
          switch (data.event) {
            case 'hello':
              console.log('🔌 [Chat] WebSocket authenticated successfully');
              break;
              
            case 'posted': {
              // New message posted
              const postData = JSON.parse(data.data.post);
              const channelId = postData.channel_id;
              
              // Only process if it's for the current channel
              if (channel && channelId === channel.id) {
                const newMessage: Message = {
                  id: postData.id,
                  message: postData.message,
                  user_id: postData.user_id,
                  username: data.data.sender_name || 'Unknown',
                  create_at: postData.create_at,
                  reactions: [],
                };
                
                console.log('💬 [Chat] New message via WebSocket:', newMessage.username, '-', newMessage.message.substring(0, 50));
                
                setMessages(prev => {
                  // Avoid duplicates
                  if (prev.some(m => m.id === newMessage.id)) {
                    return prev;
                  }
                  return [...prev, newMessage];
                });
              }
              break;
            }
              
            case 'post_edited': {
              // Message was edited
              const postData = JSON.parse(data.data.post);
              const channelId = postData.channel_id;
              
              if (channel && channelId === channel.id) {
                setMessages(prev => prev.map(msg => 
                  msg.id === postData.id 
                    ? { ...msg, message: postData.message }
                    : msg
                ));
                console.log('✏️ [Chat] Message edited via WebSocket:', postData.id);
              }
              break;
            }
              
            case 'post_deleted': {
              // Message was deleted
              const postData = JSON.parse(data.data.post);
              const channelId = postData.channel_id;
              
              if (channel && channelId === channel.id) {
                setMessages(prev => prev.filter(msg => msg.id !== postData.id));
                console.log('🗑️ [Chat] Message deleted via WebSocket:', postData.id);
              }
              break;
            }
              
            case 'reaction_added': {
              // Reaction added to a message
              const { post_id, emoji_name, user_id } = data.data;
              
              setMessages(prev => prev.map(msg => {
                if (msg.id === post_id) {
                  const existingReactions = msg.reactions || [];
                  // Check if this reaction already exists from this user
                  const alreadyExists = existingReactions.some(
                    r => r.emoji_name === emoji_name && r.user_id === user_id
                  );
                  if (!alreadyExists) {
                    return {
                      ...msg,
                      reactions: [...existingReactions, { emoji_name, user_id }]
                    };
                  }
                }
                return msg;
              }));
              console.log('👍 [Chat] Reaction added via WebSocket:', emoji_name);
              break;
            }
              
            case 'reaction_removed': {
              // Reaction removed from a message
              const { post_id, emoji_name, user_id } = data.data;
              
              setMessages(prev => prev.map(msg => {
                if (msg.id === post_id) {
                  return {
                    ...msg,
                    reactions: (msg.reactions || []).filter(
                      r => !(r.emoji_name === emoji_name && r.user_id === user_id)
                    )
                  };
                }
                return msg;
              }));
              console.log('👎 [Chat] Reaction removed via WebSocket:', emoji_name);
              break;
            }
              
            case 'typing':
              // User is typing - could implement typing indicator
              // console.log('⌨️ [Chat] User typing:', data.data.user_id);
              break;
              
            default:
              // Log unknown events for debugging (but not too verbosely)
              if (data.event && data.event !== 'status_change' && data.event !== 'user_updated') {
                console.log('🔌 [Chat] WebSocket event:', data.event);
              }
          }
        } catch (err) {
          // Not all messages are JSON (e.g., pong responses)
          // console.log('🔌 [Chat] WebSocket raw message:', event.data);
        }
      });

      socket.addEventListener('close', (event) => {
        console.log('🔌 [Chat] WebSocket closed:', event.code, event.reason);
        websocketRef.current = null;
        
        // Attempt to reconnect if we should still be connected
        if (isOpen && !isMinimized && isBootstrapped && channel) {
          const attempts = reconnectAttemptsRef.current;
          
          // After 3 failed attempts, fall back to polling
          if (attempts >= 3) {
            console.log('🔌 [Chat] WebSocket failed after 3 attempts, falling back to polling');
            setUsePollingFallback(true);
            return;
          }
          
          const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Exponential backoff, max 30s
          
          console.log(`🔌 [Chat] Reconnecting in ${delay}ms (attempt ${attempts + 1})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connectWebSocket();
          }, delay);
        }
      });

      socket.addEventListener('error', (error) => {
        console.error('🔌 [Chat] WebSocket error:', error);
      });
    };

    connectWebSocket();

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isMinimized, isBootstrapped, channel?.id]); // channel object intentionally excluded to avoid infinite reconnects

  // Polling fallback when WebSocket is not available (e.g., cross-origin issues on localhost)
  useEffect(() => {
    // Clear any existing interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    // Only poll if WebSocket failed and we need fallback
    const shouldPoll = usePollingFallback && isOpen && !isMinimized && isBootstrapped && channel;
    
    if (!shouldPoll) {
      return;
    }

    console.log('📡 [Chat] Starting polling fallback (5s interval)');
    
    pollingRef.current = setInterval(async () => {
      // Check if tab is visible (Page Visibility API)
      if (document.hidden) {
        return;
      }
      
      try {
        const response = await fetch(`/api/chat/channels/${channel.id}/posts`, {
          credentials: "include",
        });

        if (!response.ok) return;

        const data = await response.json();
        
        // Parse messages
        let newMessages: Message[] = [];
        
        if (Array.isArray(data.posts) && data.posts.length > 0) {
          newMessages = data.posts.map((post: any) => ({
            id: post.id,
            message: post.message,
            user_id: post.user_id,
            username: data.users?.[post.user_id]?.username || post.username || "Unknown",
            create_at: post.create_at,
            reactions: post.metadata?.reactions || [],
          })).sort((a: Message, b: Message) => a.create_at - b.create_at);
        } else if (data.posts && data.order) {
          newMessages = data.order.map((id: string) => ({
            id,
            message: data.posts[id].message,
            user_id: data.posts[id].user_id,
            username: data.users?.[data.posts[id].user_id]?.username || "Unknown",
            create_at: data.posts[id].create_at,
            reactions: data.posts[id].metadata?.reactions || [],
          })).reverse();
        }

        // Only update if we have new messages
        if (newMessages.length > 0) {
          const lastNewId = newMessages[newMessages.length - 1]?.id;
          const lastCurrentId = messages[messages.length - 1]?.id;
          
          if (lastNewId !== lastCurrentId || newMessages.length !== messages.length) {
            setMessages(newMessages);
          }
        }
      } catch (err) {
        // Silent fail for polling
        console.log('📡 [Chat] Polling error (silent):', err);
      }
    }, 5000); // 5 second interval for fallback polling

    return () => {
      if (pollingRef.current) {
        console.log('📡 [Chat] Stopping polling fallback');
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usePollingFallback, isOpen, isMinimized, isBootstrapped, channel?.id]);

  // Drag handlers for the floating bubble
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragOffset.current = {
      x: clientX - bubblePosition.x,
      y: clientY - bubblePosition.y,
    };
  };

  useEffect(() => {
    const handleDragMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const newX = Math.max(0, Math.min(window.innerWidth - 60, clientX - dragOffset.current.x));
      // Keep bubble above mobile footer (60px) + padding, max Y is innerHeight - 60 (bubble) - 70 (footer + padding)
      const maxY = window.innerWidth < 640 ? window.innerHeight - 130 : window.innerHeight - 60;
      const newY = Math.max(0, Math.min(maxY, clientY - dragOffset.current.y));
      setBubblePosition({ x: newX, y: newY });
    };

    const handleDragEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove, { passive: false });
      window.addEventListener('touchend', handleDragEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, bubblePosition]);

  const handleBootstrap = async () => {
    if (!user) {
      setError("Please log in first");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Generate access token using Keychain
      const accessToken = await buildEcencyAccessToken(user);

      // Bootstrap chat
      const response = await fetch("/api/chat/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: user,
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

      const data = await response.json();
      console.log("🔵 Channels API response:", data);
      
      // Handle different response formats
      const channels = Array.isArray(data) ? data : data.channels || [];
      const users = data.users || {}; // User ID to username mapping
      
      if (!Array.isArray(channels)) {
        console.error("🔴 Channels is not an array:", channels);
        setError("Invalid channels response");
        return;
      }
      
      // Find Snapie community channel
      const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || "hive-178315";
      const snapieChannel = channels.find((ch: Channel) => 
        ch.name?.includes(communityTag) || ch.display_name?.includes("Snapie")
      );

      console.log("🔵 Found channel:", snapieChannel);
      console.log("🔵 Users mapping:", users);

      // Extract DM channels (type 'D' or name contains '__')
      const directChannels = channels
        .filter((ch: Channel) => ch.type === 'D' || ch.name?.includes('__'))
        .map((ch: any) => {
          // Try multiple ways to get the other user's name:
          // 1. From channel's members array if available
          // 2. From users mapping using member IDs
          // 3. From display_name (Ecency often sets this to the other user)
          // 4. Parse from channel name (user1__user2 format)
          
          let otherUser = 'Unknown';
          
          // Check if display_name looks like a username (not a UUID)
          if (ch.display_name && !ch.display_name.includes('-') && ch.display_name.length < 20) {
            otherUser = ch.display_name;
          }
          // Check header field (some Mattermost setups use this)
          else if (ch.header && !ch.header.includes('-') && ch.header.length < 20) {
            otherUser = ch.header;
          }
          // Try to find from users mapping if we have member IDs
          else if (ch.members && Array.isArray(ch.members)) {
            const otherMemberId = ch.members.find((id: string) => users[id]?.username !== user);
            if (otherMemberId && users[otherMemberId]) {
              otherUser = users[otherMemberId].username;
            }
          }
          // Last resort: try parsing name (but it's usually UUIDs for DMs)
          else {
            const parts = ch.name?.split('__') || [];
            if (parts.length === 2) {
              // Check if either part is in the users mapping
              for (const part of parts) {
                if (users[part]?.username && users[part].username !== user) {
                  otherUser = users[part].username;
                  break;
                }
              }
            }
          }
          
          return {
            ...ch,
            otherUser,
          } as DMChannel;
        })
        .sort((a: DMChannel, b: DMChannel) => (b.last_post_at || 0) - (a.last_post_at || 0));
      
      console.log("🔵 Found DM channels:", directChannels);
      setDmChannels(directChannels);

      if (snapieChannel) {
        setChannel(snapieChannel);
        setCommunityChannel(snapieChannel);
        await loadMessages(snapieChannel.id);
      } else {
        console.log("🟡 No Snapie channel found. Available channels:", channels.map((c: Channel) => c.name));
        setError("Snapie channel not found. Try rejoining.");
      }
    } catch (err: any) {
      console.error("Load channel error:", err);
      setError(err.message);
    }
  };

  const loadMessages = async (channelId: string, updateDMName: boolean = false) => {
    try {
      console.log("🔵 Loading messages for channel:", channelId);
      const response = await fetch(`/api/chat/channels/${channelId}/posts`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load messages");
      }

      const data = await response.json();
      console.log("🔵 Messages API response:", data);
      
      // If this is a DM and we have users data, update the DM channel name
      if (updateDMName && data.users) {
        const usersMap = data.users;
        // Find the other user (not the current logged-in user)
        const otherUserId = Object.keys(usersMap).find(id => usersMap[id].username !== user);
        if (otherUserId && usersMap[otherUserId]?.username) {
          const otherUsername = usersMap[otherUserId].username;
          console.log("🔵 Found other user in DM:", otherUsername);
          
          // Update the DM channels list with the correct username
          setDmChannels(prev => prev.map(dm => 
            dm.id === channelId ? { ...dm, otherUser: otherUsername } : dm
          ));
          
          // Update selected DM if it's the current one
          setSelectedDM(prev => 
            prev?.id === channelId ? { ...prev, otherUser: otherUsername } : prev
          );
        }
      }
      
      // Handle Ecency's response format - posts is an array
      if (Array.isArray(data.posts) && data.posts.length > 0) {
        const parsedMessages = data.posts.map((post: any) => ({
          id: post.id,
          message: post.message,
          user_id: post.user_id,
          username: data.users?.[post.user_id]?.username || post.username || "Unknown",
          create_at: post.create_at,
          reactions: post.metadata?.reactions || [],
        })).sort((a: Message, b: Message) => a.create_at - b.create_at); // Sort by time

        console.log("🔵 Parsed messages:", parsedMessages.length);
        setMessages(parsedMessages);
      } else if (data.posts && data.order) {
        // Fallback for Mattermost's standard format (object with order)
        const parsedMessages = data.order.map((id: string) => ({
          id,
          message: data.posts[id].message,
          user_id: data.posts[id].user_id,
          username: data.users?.[data.posts[id].user_id]?.username || "Unknown",
          create_at: data.posts[id].create_at,
          reactions: data.posts[id].metadata?.reactions || [],
        })).reverse();

        console.log("🔵 Parsed messages (order format):", parsedMessages.length);
        setMessages(parsedMessages);
      } else {
        console.log("🟡 No messages found in response");
        setMessages([]);
      }
    } catch (err: any) {
      console.error("Load messages error:", err);
      setError(err.message);
    }
  };

  // Start a DM with a user
  const startDirectMessage = async (username: string) => {
    if (!username || username === user) return; // Don't DM yourself
    
    try {
      setIsLoading(true);
      const response = await fetch("/api/chat/direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        throw new Error("Failed to start DM");
      }

      const dmChannel = await response.json();
      console.log("🔵 DM channel created:", dmChannel);
      
      // Ecency returns { channelId: '...' }
      const dmChannelId = dmChannel.channelId || dmChannel.id;
      
      if (!dmChannelId) {
        throw new Error("No channel ID returned from DM creation");
      }
      
      // Create the DM channel object
      const newDMChannel: DMChannel = {
        id: dmChannelId,
        name: `${user}__${username}`,
        display_name: `DM with @${username}`,
        otherUser: username,
        type: 'D',
      };
      
      // Add to DM channels list if not already there
      setDmChannels(prev => {
        const exists = prev.some(ch => ch.id === dmChannelId);
        if (exists) return prev;
        return [newDMChannel, ...prev];
      });
      
      // Switch to DM channel
      setChannel(newDMChannel);
      setSelectedDM(newDMChannel);
      setIsDM(true);
      setActiveTab(1); // Switch to DMs tab
      await loadMessages(dmChannelId);
    } catch (err: any) {
      console.error("Start DM error:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Open an existing DM conversation
  const openDMConversation = async (dm: DMChannel) => {
    setSelectedDM(dm);
    setChannel(dm);
    setIsDM(true);
    // Pass true to update the DM name from user data
    await loadMessages(dm.id, true);
  };

  // Go back to DM list
  const backToDMList = () => {
    setSelectedDM(null);
    setIsDM(false);
  };

  // Go back to community channel
  const backToCommunity = async () => {
    setIsDM(false);
    setSelectedDM(null);
    setActiveTab(0);
    
    // Use stored community channel if available (no network request needed)
    if (communityChannel) {
      setChannel(communityChannel);
      await loadMessages(communityChannel.id);
    } else {
      // Fallback to fetching channels if not stored
      await loadChannel();
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
      
      // Force scroll to bottom after sending (with small delay for DOM update)
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
    } catch (err: any) {
      console.error("Send message error:", err);
      setError(err.message);
    }
  };

  // Handle adding/removing emoji reaction
  const handleReaction = async (messageId: string, emoji: string) => {
    if (!channel) return;
    
    try {
      const response = await fetch(
        `/api/chat/channels/${channel.id}/posts/${messageId}/reactions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ emoji, add: true }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to add reaction");
      }

      // Reload messages to get updated reactions
      await loadMessages(channel.id);
    } catch (err: any) {
      console.error("Reaction error:", err);
    }
  };

  // Group reactions by emoji and count them
  const groupReactions = (reactions: Reaction[] = []) => {
    const grouped: { [emoji: string]: { count: number; users: string[] } } = {};
    reactions.forEach((r) => {
      // Convert emoji name to emoji character for display
      const emojiChar = NAME_TO_EMOJI[r.emoji_name] || r.emoji_name;
      if (!grouped[emojiChar]) {
        grouped[emojiChar] = { count: 0, users: [] };
      }
      grouped[emojiChar].count++;
      if (r.username) {
        grouped[emojiChar].users.push(r.username);
      }
    });
    return grouped;
  };

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  // Render floating bubble when minimized
  if (isMinimized) {
    return (
      <Box
        ref={bubbleRef}
        position="fixed"
        left={`${bubblePosition.x}px`}
        top={`${bubblePosition.y}px`}
        zIndex={1001}
        w="56px"
        h="56px"
        borderRadius="full"
        bg="blue.500"
        boxShadow="lg"
        cursor={isDragging ? "grabbing" : "grab"}
        display="flex"
        alignItems="center"
        justifyContent="center"
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        onClick={(e) => {
          // Only restore if not dragging (to avoid accidental clicks while dragging)
          if (!isDragging) {
            onRestore?.();
          }
        }}
        _hover={{ transform: isDragging ? "none" : "scale(1.05)", bg: "blue.600" }}
        transition={isDragging ? "none" : "all 0.2s"}
        userSelect="none"
      >
        <FiMessageSquare size={24} color="white" />
        {unreadCount > 0 && (
          <Badge
            position="absolute"
            top="-4px"
            right="-4px"
            colorScheme="red"
            borderRadius="full"
            minW="20px"
            h="20px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="xs"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </Box>
    );
  }

  return (
    <>
        <Box
          position="fixed"
          // Mobile: full screen above footer, Desktop: floating panel
          bottom={{ base: "60px", sm: "20px" }}
          right={{ base: "0", sm: "20px" }}
          left={{ base: "0", sm: "auto" }}
          top={{ base: "0", sm: "auto" }}
          zIndex={1000}
          width={{ base: "100%", sm: "400px" }}
          // Use dvh for iOS Safari keyboard compatibility, fallback to vh
          height={{ base: "calc(100dvh - 60px)", sm: "500px" }}
          maxHeight={{ base: "calc(100dvh - 60px)", sm: "500px" }}
          bg="background"
          borderRadius={{ base: "0", sm: "lg" }}
          boxShadow="2xl"
          display="flex"
          flexDirection="column"
          border={{ base: "none", sm: "1px solid" }}
          borderColor="border"
          // iOS Safari fix: prevent body scroll and ensure proper positioning
          sx={{
            '@supports (-webkit-touch-callout: none)': {
              // iOS Safari specific
              height: { base: 'calc(100dvh - 60px)', sm: '500px' },
            },
          }}
        >
          {/* Header */}
          <Flex
            p={3}
            borderBottom="1px solid"
            borderColor="border"
            justify="space-between"
            align="center"
          >
            <HStack spacing={2}>
              {selectedDM && (
                <IconButton
                  aria-label="Back to list"
                  icon={<ChevronLeftIcon boxSize={5} />}
                  size="sm"
                  variant="ghost"
                  onClick={backToDMList}
                />
              )}
              <Text fontWeight="semibold" color="text" fontSize="md">
                {selectedDM ? `@${selectedDM.otherUser?.replace(/^@/, '')}` : "Snapie Chat"}
              </Text>
            </HStack>
            <HStack spacing={1}>
              <Tooltip label="Minimize to bubble">
                <IconButton
                  aria-label="Minimize chat"
                  icon={<MinusIcon />}
                  size="sm"
                  variant="ghost"
                  onClick={onMinimize}
                />
              </Tooltip>
              <IconButton
                aria-label="Close chat"
                icon={<CloseIcon />}
                size="sm"
                variant="ghost"
                onClick={onClose}
              />
            </HStack>
          </Flex>

          {/* Content */}
          <Flex flex={1} overflow="hidden" direction="column">
            {!user ? (
              <Flex flex={1} align="center" justify="center" p={4}>
                <VStack spacing={4}>
                  <Text color="text" textAlign="center">
                    Please log in with Hive Keychain to use chat
                  </Text>
                </VStack>
              </Flex>
            ) : !isBootstrapped ? (
              <Flex flex={1} align="center" justify="center" p={4}>
                <VStack spacing={4}>
                  <Text color="text">
                    Connect to Snapie chat
                  </Text>
                  <Button
                    colorScheme="blue"
                    onClick={handleBootstrap}
                    isLoading={isLoading}
                    loadingText="Connecting..."
                  >
                    Connect
                  </Button>
                  {error && (
                    <Text color="red.500" fontSize="sm">{error}</Text>
                  )}
                </VStack>
              </Flex>
            ) : selectedDM ? (
              // DM Conversation View
              <>
                {/* Messages */}
                <Box flex={1} overflowY="auto" p={4}>
                  <VStack spacing={3} align="stretch">
                    {messages.map((msg) => {
                      const groupedReactions = groupReactions(msg.reactions);
                      return (
                        <Box key={msg.id} role="group">
                          <HStack align="flex-start" spacing={2}>
                            <Avatar
                              size="xs"
                              name={msg.username || 'Unknown'}
                              src={getHiveAvatarUrl(msg.username || 'unknown', 'small')}
                            />
                            <Box flex={1}>
                              <HStack spacing={2} mb={0}>
                                <Text fontWeight="semibold" fontSize="sm" color="text">
                                  {msg.username || 'Unknown'}
                                </Text>
                                <Text fontSize="xs" color="gray.500">
                                  {new Date(msg.create_at).toLocaleTimeString()}
                                </Text>
                              </HStack>
                              <Box color="text" fontSize="sm" maxW="100%" overflow="hidden">
                                {renderMessageContent(msg.message)}
                              </Box>
                              {/* Reactions display */}
                              <HStack spacing={1} mt={1} flexWrap="wrap">
                                {Object.entries(groupedReactions).map(([emoji, data]) => (
                                  <Tooltip 
                                    key={emoji} 
                                    label={data.users.join(', ')} 
                                    fontSize="xs"
                                  >
                                    <Badge
                                      variant="subtle"
                                      colorScheme="gray"
                                      borderRadius="full"
                                      px={2}
                                      py={0.5}
                                      cursor="pointer"
                                      onClick={() => handleReaction(msg.id, emoji)}
                                    >
                                      {emoji} {data.count}
                                    </Badge>
                                  </Tooltip>
                                ))}
                                {/* Add reaction button */}
                                <Popover placement="top" isLazy>
                                  <PopoverTrigger>
                                    <IconButton
                                      aria-label="Add reaction"
                                      icon={<Text fontSize="xs">😀</Text>}
                                      size="xs"
                                      variant="ghost"
                                      opacity={0}
                                      _groupHover={{ opacity: 1 }}
                                      h="20px"
                                      minW="20px"
                                    />
                                  </PopoverTrigger>
                                  <PopoverContent w="auto" bg="secondary">
                                    <PopoverBody p={2}>
                                      <Wrap spacing={1}>
                                        {REACTION_EMOJIS.map((emoji) => (
                                          <WrapItem key={emoji}>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => handleReaction(msg.id, emoji)}
                                              p={1}
                                              minW="auto"
                                            >
                                              {emoji}
                                            </Button>
                                          </WrapItem>
                                        ))}
                                      </Wrap>
                                    </PopoverBody>
                                  </PopoverContent>
                                </Popover>
                              </HStack>
                            </Box>
                          </HStack>
                        </Box>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </VStack>
                </Box>

                {/* Composer */}
                <Box
                  as="form"
                  onSubmit={handleSendMessage}
                  p={4}
                  borderTop="1px solid"
                  borderColor="border"
                >
                  <HStack spacing={2}>
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                      bg="inputBackground"
                      color="text"
                      fontSize="16px"
                      autoComplete="off"
                      autoCorrect="off"
                    />
                    <Button
                      type="submit"
                      colorScheme="blue"
                      isDisabled={!newMessage.trim()}
                    >
                      Send
                    </Button>
                  </HStack>
                </Box>
              </>
            ) : (
              // Tabs View (Community / DMs)
              <Tabs 
                index={activeTab} 
                onChange={async (index) => {
                  setActiveTab(index);
                  // When switching to Community tab, reload community messages
                  if (index === 0 && communityChannel) {
                    setChannel(communityChannel);
                    await loadMessages(communityChannel.id);
                  }
                }} 
                display="flex" 
                flexDirection="column" 
                flex={1}
                overflow="hidden"
              >
                <TabList borderBottom="1px solid" borderColor="border" px={2}>
                  <Tab 
                    fontSize="sm" 
                    _selected={{ color: "blue.400", borderColor: "blue.400" }}
                  >
                    Community
                  </Tab>
                  <Tab 
                    fontSize="sm" 
                    _selected={{ color: "blue.400", borderColor: "blue.400" }}
                  >
                    DMs {dmChannels.length > 0 && (
                      <Badge ml={1} colorScheme="blue" borderRadius="full" fontSize="xs">
                        {dmChannels.length}
                      </Badge>
                    )}
                  </Tab>
                </TabList>

                <TabPanels flex={1} overflow="hidden" display="flex" flexDirection="column">
                  {/* Community Tab */}
                  <TabPanel p={0} flex={1} display="flex" flexDirection="column" overflow="hidden">
                    {/* Messages */}
                    <Box flex={1} overflowY="auto" p={4}>
                      <VStack spacing={3} align="stretch">
                        {messages.map((msg) => {
                          const groupedReactions = groupReactions(msg.reactions);
                          return (
                            <Box key={msg.id} role="group">
                              <HStack align="flex-start" spacing={2}>
                                <Avatar
                                  size="xs"
                                  name={msg.username || 'Unknown'}
                                  src={getHiveAvatarUrl(msg.username || 'unknown', 'small')}
                                  cursor="pointer"
                                  onClick={() => msg.username && startDirectMessage(msg.username)}
                                />
                                <Box flex={1}>
                                  <HStack spacing={2} mb={0}>
                                    <Text 
                                      fontWeight="semibold" 
                                      fontSize="sm" 
                                      color="text"
                                      cursor={msg.username !== user ? "pointer" : "default"}
                                      _hover={msg.username !== user ? { color: "blue.400", textDecoration: "underline" } : {}}
                                      onClick={() => msg.username && msg.username !== user && startDirectMessage(msg.username)}
                                    >
                                      {msg.username || 'Unknown'}
                                    </Text>
                                    <Text fontSize="xs" color="gray.500">
                                      {new Date(msg.create_at).toLocaleTimeString()}
                                    </Text>
                                  </HStack>
                                  <Box color="text" fontSize="sm" maxW="100%" overflow="hidden">
                                    {renderMessageContent(msg.message)}
                                  </Box>
                                  {/* Reactions display */}
                                  <HStack spacing={1} mt={1} flexWrap="wrap">
                                    {Object.entries(groupedReactions).map(([emoji, data]) => (
                                      <Tooltip 
                                        key={emoji} 
                                        label={data.users.join(', ')} 
                                        fontSize="xs"
                                      >
                                        <Badge
                                          variant="subtle"
                                          colorScheme="gray"
                                          borderRadius="full"
                                          px={2}
                                          py={0.5}
                                          cursor="pointer"
                                          onClick={() => handleReaction(msg.id, emoji)}
                                        >
                                          {emoji} {data.count}
                                        </Badge>
                                      </Tooltip>
                                    ))}
                                    {/* Add reaction button */}
                                    <Popover placement="top" isLazy>
                                      <PopoverTrigger>
                                        <IconButton
                                          aria-label="Add reaction"
                                          icon={<Text fontSize="xs">😀</Text>}
                                          size="xs"
                                          variant="ghost"
                                          opacity={0}
                                          _groupHover={{ opacity: 1 }}
                                          h="20px"
                                          minW="20px"
                                        />
                                      </PopoverTrigger>
                                      <PopoverContent w="auto" bg="secondary">
                                        <PopoverBody p={2}>
                                          <Wrap spacing={1}>
                                            {REACTION_EMOJIS.map((emoji) => (
                                              <WrapItem key={emoji}>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => handleReaction(msg.id, emoji)}
                                                  p={1}
                                                  minW="auto"
                                                >
                                                  {emoji}
                                                </Button>
                                              </WrapItem>
                                            ))}
                                          </Wrap>
                                        </PopoverBody>
                                      </PopoverContent>
                                    </Popover>
                                  </HStack>
                                </Box>
                              </HStack>
                            </Box>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </VStack>
                    </Box>

                    {/* Composer */}
                    <Box
                      as="form"
                      onSubmit={handleSendMessage}
                      p={4}
                      borderTop="1px solid"
                      borderColor="border"
                    >
                      <HStack spacing={2}>
                        <Input
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type a message..."
                          bg="inputBackground"
                          color="text"
                          fontSize="16px"
                          autoComplete="off"
                          autoCorrect="off"
                        />
                        <Button
                          type="submit"
                          colorScheme="blue"
                          isDisabled={!newMessage.trim()}
                        >
                          Send
                        </Button>
                      </HStack>
                    </Box>
                  </TabPanel>

                  {/* DMs Tab */}
                  <TabPanel p={0} flex={1} overflowY="auto">
                    {dmChannels.length === 0 ? (
                      <Flex flex={1} align="center" justify="center" p={4} minH="200px">
                        <VStack spacing={2}>
                          <Text color="gray.500" fontSize="sm" textAlign="center">
                            No direct messages yet
                          </Text>
                          <Text color="gray.400" fontSize="xs" textAlign="center">
                            Click on a username in the community chat to start a DM
                          </Text>
                        </VStack>
                      </Flex>
                    ) : (
                      <VStack spacing={0} align="stretch">
                        {dmChannels.map((dm) => (
                          <HStack
                            key={dm.id}
                            p={3}
                            spacing={3}
                            cursor="pointer"
                            _hover={{ bg: "whiteAlpha.100" }}
                            onClick={() => openDMConversation(dm)}
                            borderBottom="1px solid"
                            borderColor="border"
                          >
                            <Avatar
                              size="sm"
                              name={dm.otherUser?.replace(/^@/, '')}
                              src={getHiveAvatarUrl(dm.otherUser?.replace(/^@/, '') || 'unknown', 'small')}
                            />
                            <Box flex={1}>
                              <Text fontWeight="medium" fontSize="sm" color="text">
                                @{dm.otherUser?.replace(/^@/, '')}
                              </Text>
                              <Text fontSize="xs" color="gray.500" noOfLines={1}>
                                Tap to view conversation
                              </Text>
                            </Box>
                          </HStack>
                        ))}
                      </VStack>
                    )}
                  </TabPanel>
                </TabPanels>
              </Tabs>
            )}
          </Flex>
        </Box>
    </>
  );
}
