'use client';

import {
  Box, Flex, Text, Input, IconButton, VStack, HStack, Spinner,
  Button, Icon, useBreakpointValue,
} from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { useAioha } from '@aioha/react-ui';
import { FiSend, FiX, FiMinus, FiHash, FiMessageSquare, FiMaximize2 } from 'react-icons/fi';
import { KeyTypes } from '@aioha/aioha';
import { chatService, Channel, Message } from '@/lib/chat/ChatService';
import { onForegroundMessage } from '@/lib/chat/fcmClient';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const POLL_INTERVAL = 5000;

const fadeIn = keyframes`from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); }`;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({ msg, isOwn }: { msg: Message; isOwn: boolean }) {
  return (
    <Box
      animation={`${fadeIn} 0.18s ease`}
      alignSelf={isOwn ? 'flex-end' : 'flex-start'}
      maxW="82%"
    >
      {!isOwn && (
        <Text fontSize="10px" color="blue.300" fontWeight="600" mb="2px" ml="2px" letterSpacing="0.03em">
          @{msg.sender}
        </Text>
      )}
      <Box
        bg={isOwn ? 'blue.600' : 'whiteAlpha.100'}
        px={3}
        py={2}
        borderRadius={isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px'}
        border="1px solid"
        borderColor={isOwn ? 'blue.500' : 'whiteAlpha.100'}
      >
        <Text fontSize="sm" color="white" lineHeight="1.5" whiteSpace="pre-wrap" wordBreak="break-word">
          {msg.content}
        </Text>
      </Box>
      <Text fontSize="9px" color="whiteAlpha.400" mt="2px" textAlign={isOwn ? 'right' : 'left'} mx="2px">
        {formatTime(msg.createdAt)}
      </Text>
    </Box>
  );
}

function ChannelTab({
  channel,
  isActive,
  onClick,
}: {
  channel: Channel;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      size="xs"
      variant="ghost"
      flexShrink={0}
      px={3}
      py={1}
      h="auto"
      borderRadius="full"
      bg={isActive ? 'blue.600' : 'transparent'}
      color={isActive ? 'white' : 'whiteAlpha.600'}
      _hover={{ bg: isActive ? 'blue.600' : 'whiteAlpha.100', color: 'white' }}
      leftIcon={<Icon as={FiHash} boxSize={3} />}
      fontWeight={isActive ? '600' : '400'}
      fontSize="xs"
    >
      {channel.name}
    </Button>
  );
}

export default function ChatPanel({ isOpen, onClose, isMinimized, onMinimize, onRestore }: ChatPanelProps) {
  const { user, aioha } = useAioha();
  const isMobile = useBreakpointValue({ base: true, md: false });

  const [authState, setAuthState] = useState<'idle' | 'connecting' | 'done' | 'error'>('idle');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>(
    process.env.NEXT_PUBLIC_CHAT_DEFAULT_CHANNEL || 'general'
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const oldestIdRef = useRef<string | undefined>(undefined);

  const isAuthed = chatService.isAuthenticated();

  // ── Load channels on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    chatService.getChannels().then(setChannels).catch(() => {});
  }, [isOpen]);

  // ── Load messages when channel changes ────────────────────────────────
  const loadMessages = useCallback(async (channelId: string, append = false) => {
    setLoadingMessages(!append);
    try {
      const msgs = await chatService.getMessages(channelId, {
        before: append ? oldestIdRef.current : undefined,
        limit: 50,
      });
      if (msgs.length > 0) oldestIdRef.current = msgs[0]._id;
      setMessages(prev => append ? [...msgs, ...prev] : msgs);
    } catch {}
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    oldestIdRef.current = undefined;
    loadMessages(activeChannelId);
  }, [isOpen, isMinimized, activeChannelId, loadMessages]);

  // ── Poll for new messages ─────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || isMinimized) return;
    pollRef.current = setInterval(async () => {
      try {
        const msgs = await chatService.getMessages(activeChannelId, { limit: 20 });
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m._id));
          const newMsgs = msgs.filter(m => !existingIds.has(m._id));
          return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
        });
      } catch {}
    }, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isOpen, isMinimized, activeChannelId]);

  // ── FCM foreground listener ────────────────────────────────────────────
  useEffect(() => {
    return onForegroundMessage(() => {
      chatService.getMessages(activeChannelId, { limit: 10 }).then(msgs => {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m._id));
          const newMsgs = msgs.filter(m => !existingIds.has(m._id));
          return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
        });
      }).catch(() => {});
    });
  }, [activeChannelId]);

  // ── Auto-scroll to bottom on new messages ─────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Auth ──────────────────────────────────────────────────────────────
  async function handleConnect() {
    if (!user) return;
    setAuthState('connecting');
    try {
      await chatService.authenticate(user, async (challenge) => {
        const res = await aioha.signMessage(challenge, KeyTypes.Posting);
        if (!res.success || !res.result) throw new Error('Sign failed');
        return res.result as string;
      });
      await chatService.joinChannel(activeChannelId);
      setAuthState('done');
    } catch {
      setAuthState('error');
    }
  }

  // ── Send ───────────────────────────────────────────────────────────────
  async function handleSend() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');
    try {
      const msg = await chatService.sendMessage(activeChannelId, content);
      setMessages(prev => [...prev, msg]);
    } catch (err: any) {
      if (err?.message === 'CHAT_UNAUTHORIZED') setAuthState('idle');
      setDraft(content);
    }
    setSending(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Panel dimensions ───────────────────────────────────────────────────
  const panelW = isMobile ? '100vw' : '360px';
  const panelH = isMobile ? '85vh' : '520px';
  const panelBottom = isMobile ? '0' : '0';
  const panelRight = isMobile ? '0' : '16px';
  const borderRadius = isMobile ? '20px 20px 0 0' : '16px 16px 0 0';

  if (!isOpen) return null;

  // ── Minimized strip ────────────────────────────────────────────────────
  if (isMinimized) {
    return (
      <Box
        position="fixed"
        bottom="0"
        right={{ base: '0', md: '16px' }}
        w={{ base: '100vw', md: '220px' }}
        h="44px"
        bg="rgba(6,17,31,0.96)"
        backdropFilter="blur(12px)"
        borderRadius="12px 12px 0 0"
        border="1px solid"
        borderColor="whiteAlpha.100"
        borderBottom="none"
        zIndex={1400}
        px={4}
        cursor="pointer"
        onClick={onRestore}
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        _hover={{ borderColor: 'blue.500' }}
        transition="border-color 0.2s"
      >
        <HStack spacing={2}>
          <Icon as={FiMessageSquare} color="blue.300" boxSize={4} />
          <Text fontSize="sm" fontWeight="600" color="white">Chat</Text>
        </HStack>
        <HStack spacing={1}>
          <IconButton aria-label="Restore" icon={<FiMaximize2 />} size="xs" variant="ghost" color="whiteAlpha.600" _hover={{ color: 'white' }} onClick={onRestore} />
          <IconButton aria-label="Close" icon={<FiX />} size="xs" variant="ghost" color="whiteAlpha.600" _hover={{ color: 'white' }} onClick={(e) => { e.stopPropagation(); onClose(); }} />
        </HStack>
      </Box>
    );
  }

  const activeChannel = channels.find(c => c._id === activeChannelId);

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && (
        <Box
          position="fixed" inset="0" zIndex={1399}
          bg="blackAlpha.600"
          backdropFilter="blur(2px)"
          onClick={onClose}
        />
      )}

      <Box
        position="fixed"
        bottom={panelBottom}
        right={panelRight}
        w={panelW}
        h={panelH}
        zIndex={1400}
        display="flex"
        flexDirection="column"
        bg="rgba(6,17,31,0.95)"
        backdropFilter="blur(16px)"
        borderRadius={borderRadius}
        border="1px solid"
        borderColor="whiteAlpha.100"
        borderBottom="none"
        overflow="hidden"
        boxShadow="0 -4px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(24,168,255,0.08)"
        sx={{
          '&': { animation: isMobile ? 'slideUp 0.25s cubic-bezier(0.32,0.72,0,1)' : 'fadeUp 0.2s ease' },
          '@keyframes slideUp': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
          '@keyframes fadeUp': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        }}
      >

        {/* Header */}
        <Flex
          align="center"
          justify="space-between"
          px={4}
          py={3}
          borderBottom="1px solid"
          borderColor="whiteAlpha.100"
          flexShrink={0}
        >
          <HStack spacing={2}>
            <Box w={2} h={2} borderRadius="full" bg="green.400" boxShadow="0 0 6px rgba(72,187,120,0.8)" />
            <Text fontSize="sm" fontWeight="700" color="white" letterSpacing="0.02em">
              {activeChannel ? `#${activeChannel.name}` : 'Chat'}
            </Text>
          </HStack>
          <HStack spacing={1}>
            {onMinimize && (
              <IconButton
                aria-label="Minimize"
                icon={<FiMinus />}
                size="xs"
                variant="ghost"
                color="whiteAlpha.500"
                _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                onClick={onMinimize}
              />
            )}
            <IconButton
              aria-label="Close chat"
              icon={<FiX />}
              size="xs"
              variant="ghost"
              color="whiteAlpha.500"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              onClick={onClose}
            />
          </HStack>
        </Flex>

        {/* Channel tabs */}
        {channels.length > 1 && (
          <Flex
            px={3}
            py={2}
            gap={1}
            overflowX="auto"
            flexShrink={0}
            borderBottom="1px solid"
            borderColor="whiteAlpha.50"
            sx={{ '&::-webkit-scrollbar': { display: 'none' } }}
          >
            {channels.map(ch => (
              <ChannelTab
                key={ch._id}
                channel={ch}
                isActive={ch._id === activeChannelId}
                onClick={() => setActiveChannelId(ch._id)}
              />
            ))}
          </Flex>
        )}

        {/* Messages */}
        <Flex
          flex="1"
          direction="column"
          overflowY="auto"
          px={4}
          py={3}
          gap={2}
          sx={{
            '&::-webkit-scrollbar': { width: '3px' },
            '&::-webkit-scrollbar-track': { bg: 'transparent' },
            '&::-webkit-scrollbar-thumb': { bg: 'whiteAlpha.200', borderRadius: 'full' },
          }}
        >
          {loadingMessages ? (
            <Flex justify="center" align="center" flex="1">
              <Spinner color="blue.300" size="sm" />
            </Flex>
          ) : messages.length === 0 ? (
            <Flex direction="column" justify="center" align="center" flex="1" gap={2} opacity={0.5}>
              <Icon as={FiMessageSquare} boxSize={8} color="whiteAlpha.400" />
              <Text fontSize="xs" color="whiteAlpha.500">No messages yet. Say hello!</Text>
            </Flex>
          ) : (
            <VStack align="stretch" spacing={2}>
              {messages.map(msg => (
                <MessageBubble key={msg._id} msg={msg} isOwn={msg.sender === user} />
              ))}
            </VStack>
          )}
          <div ref={messagesEndRef} />
        </Flex>

        {/* Auth overlay / compose bar */}
        {!isAuthed || authState === 'idle' ? (
          <Flex
            px={4}
            py={4}
            borderTop="1px solid"
            borderColor="whiteAlpha.100"
            direction="column"
            align="center"
            gap={2}
            flexShrink={0}
          >
            {!user ? (
              <Text fontSize="xs" color="whiteAlpha.500" textAlign="center">
                Log in to send messages
              </Text>
            ) : (
              <>
                <Text fontSize="xs" color="whiteAlpha.500" textAlign="center">
                  Connect your Hive account to chat
                </Text>
                <Button
                  size="sm"
                  colorScheme="blue"
                  onClick={handleConnect}
                  isLoading={authState === 'connecting'}
                  loadingText="Signing in…"
                  leftIcon={<Icon as={FiMessageSquare} />}
                  borderRadius="full"
                  px={6}
                >
                  Connect
                </Button>
                {authState === 'error' && (
                  <Text fontSize="xs" color="red.400">Sign failed — try again</Text>
                )}
              </>
            )}
          </Flex>
        ) : (
          <Flex
            px={3}
            py={3}
            borderTop="1px solid"
            borderColor="whiteAlpha.100"
            gap={2}
            align="center"
            flexShrink={0}
          >
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message…"
              size="sm"
              borderRadius="full"
              bg="whiteAlpha.50"
              border="1px solid"
              borderColor="whiteAlpha.100"
              color="white"
              _placeholder={{ color: 'whiteAlpha.400' }}
              _focus={{ borderColor: 'blue.400', boxShadow: '0 0 0 1px var(--chakra-colors-blue-400)', bg: 'whiteAlpha.100' }}
              _hover={{ borderColor: 'whiteAlpha.300' }}
              maxLength={2000}
              autoComplete="off"
            />
            <IconButton
              aria-label="Send"
              icon={<FiSend />}
              size="sm"
              colorScheme="blue"
              borderRadius="full"
              isLoading={sending}
              isDisabled={!draft.trim()}
              onClick={handleSend}
              flexShrink={0}
            />
          </Flex>
        )}
      </Box>
    </>
  );
}
