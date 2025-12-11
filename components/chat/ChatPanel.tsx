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
          height={{ base: "calc(100vh - 60px)", sm: "500px" }}
          bg="background"
          borderRadius={{ base: "0", sm: "lg" }}
          boxShadow="2xl"
          display="flex"
          flexDirection="column"
          border={{ base: "none", sm: "1px solid" }}
          borderColor="border"
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
                              <Text color="text" fontSize="sm">
                                {msg.message}
                              </Text>
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
                                  <Text color="text" fontSize="sm">
                                    {msg.message}
                                  </Text>
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
