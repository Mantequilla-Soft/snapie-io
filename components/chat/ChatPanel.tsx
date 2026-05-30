'use client';

import {
  Avatar,
  AvatarGroup,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Icon,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Switch,
  Spinner,
  Text,
  VStack,
  useBreakpointValue,
} from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useState, useEffect, useRef, useCallback, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useAioha } from '@aioha/react-ui';
import { FiArrowLeft, FiChevronDown, FiHash, FiMaximize2, FiMessageSquare, FiMinus, FiPlus, FiSend, FiUsers, FiX } from 'react-icons/fi';
import { KeyTypes } from '@aioha/aioha';
import { chatService, Channel, Conversation, DmStatusInfo, Message } from '@/lib/chat/ChatService';
import { getFCMToken, onForegroundMessage } from '@/lib/chat/fcmClient';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';
import { transferEncryptedMemoWithAioha } from '@/lib/hive/aioha';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const POLL_INTERVAL = 15000;
const QUICK_EMOJIS = ['😀', '😂', '❤️', '🔥', '👏', '👍', '🙏', '🎉', '😮', '😢'];
const fadeIn = keyframes`from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); }`;
const CHAT_PANEL_SIZE_KEY = 'snapie-chat-panel-size';
const DESKTOP_PANEL_DEFAULT = { width: 460, height: 680 };
const DESKTOP_PANEL_MIN = { width: 400, height: 520 };

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function avatarNameForConversation(conv: Conversation): string {
  if (conv.type === 'dm') return conv.peer || conv.name.replace(/^@/, '');
  if (conv.members?.length) return conv.members[0];
  return conv.name;
}

function ConversationAvatar({ conv }: { conv: Conversation }) {
  if (conv.type === 'group' && conv.members && conv.members.length > 1) {
    return (
      <AvatarGroup size="xs" max={2}>
        {conv.members.slice(0, 2).map(member => (
          <Avatar key={member} name={member} src={getHiveAvatarUrl(member, 'small')} />
        ))}
      </AvatarGroup>
    );
  }
  if (conv.type === 'channel') {
    return (
      <Flex
        w="28px"
        h="28px"
        borderRadius="full"
        bg="whiteAlpha.200"
        align="center"
        justify="center"
        flexShrink={0}
      >
        <Icon as={FiHash} boxSize={3} color="whiteAlpha.800" />
      </Flex>
    );
  }
  const username = avatarNameForConversation(conv);
  return <Avatar size="xs" name={username} src={getHiveAvatarUrl(username, 'small')} />;
}

function MessageBubble({
  msg,
  isOwn,
  onOpenDm,
}: {
  msg: Message;
  isOwn: boolean;
  onOpenDm?: (username: string) => void;
}) {
  const canOpenDm = !isOwn && !!onOpenDm;
  return (
    <Box
      animation={`${fadeIn} 0.18s ease`}
      alignSelf={isOwn ? 'flex-end' : 'flex-start'}
      maxW="88%"
    >
      <HStack align="flex-end" spacing={2}>
        {!isOwn && (
          <Box
            onDoubleClick={() => onOpenDm?.(msg.sender)}
            cursor={canOpenDm ? 'pointer' : 'default'}
            title={canOpenDm ? 'Double-click to open DM' : undefined}
          >
            <Avatar size="2xs" name={msg.sender} src={getHiveAvatarUrl(msg.sender, 'small')} />
          </Box>
        )}
        <Box>
          {!isOwn && (
            <Text
              fontSize="10px"
              color="blue.300"
              fontWeight="600"
              mb="2px"
              ml="2px"
              letterSpacing="0.03em"
              onDoubleClick={() => onOpenDm?.(msg.sender)}
              cursor={canOpenDm ? 'pointer' : 'default'}
              title={canOpenDm ? 'Double-click to open DM' : undefined}
            >
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
      </HStack>
    </Box>
  );
}

function ConversationRow({ conv, isActive, onClick }: { conv: Conversation; isActive: boolean; onClick: () => void }) {
  return (
    <Flex
      onClick={onClick}
      px={3}
      py={2}
      borderRadius="12px"
      bg={isActive ? 'blue.600' : 'transparent'}
      border="1px solid"
      borderColor={isActive ? 'blue.400' : 'transparent'}
      cursor="pointer"
      _hover={{ bg: isActive ? 'blue.600' : 'whiteAlpha.100' }}
      align="center"
      justify="space-between"
    >
      <HStack spacing={2} minW={0}>
        <ConversationAvatar conv={conv} />
        <Box minW={0}>
          <Text color="white" fontSize="sm" fontWeight="600" noOfLines={1}>
            {conv.type === 'channel' ? `#${conv.name}` : conv.name}
          </Text>
          <Text fontSize="11px" color="whiteAlpha.600" noOfLines={1}>
            {conv.lastMessage ? `${conv.lastMessage.sender}: ${conv.lastMessage.content}` : 'No messages yet'}
          </Text>
        </Box>
      </HStack>
      {conv.unread && <Box w="7px" h="7px" borderRadius="full" bg="blue.300" />}
    </Flex>
  );
}

export default function ChatPanel({ isOpen, onClose, isMinimized, onMinimize, onRestore }: ChatPanelProps) {
  const { user, aioha } = useAioha();
  const isMobile = useBreakpointValue({ base: true, md: false });

  const [authState, setAuthState] = useState<'idle' | 'connecting' | 'done' | 'error'>('idle');
  const [authError, setAuthError] = useState<string>('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>(
    process.env.NEXT_PUBLIC_CHAT_DEFAULT_CHANNEL || 'general'
  );
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [listAction, setListAction] = useState<'none' | 'new-dm' | 'new-group'>('none');
  const [dmTarget, setDmTarget] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupMemberDraft, setGroupMemberDraft] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [groupIsPublic, setGroupIsPublic] = useState(false);
  const [memberInput, setMemberInput] = useState('');
  const [memberActionBusy, setMemberActionBusy] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [confirmBlockUser, setConfirmBlockUser] = useState<string | null>(null);
  const [showMemoFallbackPrompt, setShowMemoFallbackPrompt] = useState<null | { conversationId: string; peer: string }>(null);
  const [memoAssetChoice, setMemoAssetChoice] = useState<'HIVE' | 'HBD'>('HIVE');
  const [mutedUsers, setMutedUsers] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dmStatus, setDmStatus] = useState<DmStatusInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [panelSize, setPanelSize] = useState(DESKTOP_PANEL_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const oldestIdRef = useRef<string | undefined>(undefined);
  const shouldAutoScrollRef = useRef(true);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const isAuthed = chatService.isAuthenticated();
  const activeConversation = conversations.find(c => c._id === activeConversationId);

  const mergeConversations = useCallback((baseConversations: Conversation[], publicChannels: Channel[]): Conversation[] => {
    const byId = new Map(baseConversations.map(c => [c._id, c]));
    for (const ch of publicChannels) {
      if (!byId.has(ch._id)) {
        byId.set(ch._id, {
          _id: ch._id,
          name: ch.name,
          description: ch.description,
          type: ch.conversationKind === 'group' ? 'group' : 'channel',
          isPublic: ch.isPublic,
          owner: ch.owner,
          members: ch.members || [],
          memberCount: ch.memberCount,
          lastMessage: null,
          unread: false,
        });
      }
    }
    return Array.from(byId.values());
  }, []);

  const resetListActions = () => {
    setListAction('none');
    setDmTarget('');
    setGroupName('');
    setGroupMemberDraft('');
    setGroupMembers([]);
    setGroupIsPublic(false);
    setPanelError('');
  };

  const reloadConversations = useCallback(async () => {
    if (!isOpen || !isAuthed) return;
    const [pubChannels, convs] = await Promise.all([
      chatService.getChannels().catch(() => [] as Channel[]),
      chatService.getConversations().catch(() => [] as Conversation[]),
    ]);
    setChannels(pubChannels);
    setConversations(mergeConversations(convs, pubChannels));
  }, [isAuthed, isOpen, mergeConversations]);

  const reloadPreferences = useCallback(async () => {
    if (!isAuthed) return;
    try {
      const prefs = await chatService.getPreferences();
      setMutedUsers(prefs.mutedUsers || []);
      setBlockedUsers(prefs.blockedUsers || []);
    } catch {}
  }, [isAuthed]);

  // ── Load conversations/channels on open ────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    Promise.all([
      chatService.getChannels().catch(() => [] as Channel[]),
      isAuthed ? chatService.getConversations().catch(() => [] as Conversation[]) : Promise.resolve([] as Conversation[]),
    ]).then(([pubChannels, convs]) => {
      setChannels(pubChannels);
      setConversations(mergeConversations(convs, pubChannels));
    });
    if (isAuthed) reloadPreferences();
  }, [isOpen, isAuthed, mergeConversations, reloadPreferences]);

  useEffect(() => {
    if (!conversations.length) return;
    const exists = conversations.some(c => c._id === activeConversationId);
    if (!exists) setActiveConversationId(conversations[0]._id);
  }, [conversations, activeConversationId]);

  useEffect(() => {
    if (isMobile) return;
    try {
      const raw = localStorage.getItem(CHAT_PANEL_SIZE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { width?: number; height?: number };
      if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return;
      const maxWidth = Math.max(DESKTOP_PANEL_MIN.width, window.innerWidth - 24);
      const maxHeight = Math.max(DESKTOP_PANEL_MIN.height, window.innerHeight - 24);
      setPanelSize({
        width: Math.min(Math.max(parsed.width, DESKTOP_PANEL_MIN.width), maxWidth),
        height: Math.min(Math.max(parsed.height, DESKTOP_PANEL_MIN.height), maxHeight),
      });
    } catch {}
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    localStorage.setItem(CHAT_PANEL_SIZE_KEY, JSON.stringify(panelSize));
  }, [panelSize, isMobile]);

  const fetchMessagesForConversation = useCallback(async (
    convId: string,
    convType: Conversation['type'] | undefined,
    opts: { before?: string; limit?: number } = {}
  ): Promise<Message[]> => {
    if (!convId) return [];
    if (convType === 'dm') {
      const out = await chatService.getDmMessages(convId, opts);
      setDmStatus(out.status || null);
      return out.messages;
    }
    setDmStatus(null);
    return chatService.getMessages(convId, opts);
  }, []);

  // ── Load messages when active conversation changes ────────────────────
  const loadMessages = useCallback(async (
    convId: string,
    convType: Conversation['type'] | undefined,
    append = false
  ) => {
    setLoadingMessages(!append);
    try {
      const msgs = await fetchMessagesForConversation(convId, convType, {
        before: append ? oldestIdRef.current : undefined,
        limit: 50,
      });
      if (msgs.length > 0) oldestIdRef.current = msgs[0]._id;
      setMessages(prev => append ? [...msgs, ...prev] : msgs);
    } catch {
      setMessages([]);
    }
    setLoadingMessages(false);
  }, [fetchMessagesForConversation]);

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    oldestIdRef.current = undefined;
    shouldAutoScrollRef.current = true;
    setDmStatus(null);
    loadMessages(activeConversationId, activeConversation?.type);
  }, [isOpen, isMinimized, activeConversationId, activeConversation?.type, loadMessages]);

  async function handleOpenConversation(conv: Conversation) {
    setPanelError('');
    setActiveConversationId(conv._id);
    if (isMobile) setMobileView('thread');
    if (!isAuthed || conv.type === 'dm') return;
    try { await chatService.joinChannel(conv._id); } catch {}
  }

  async function handleCreateDmSubmit() {
    const target = dmTarget.trim();
    if (!target || !isAuthed) return;
    try {
      const conv = await chatService.openDm(target);
      await reloadConversations();
      setActiveConversationId(conv._id);
      if (isMobile) setMobileView('thread');
      resetListActions();
    } catch (err: any) {
      setPanelError(err?.message || 'Could not start DM');
    }
  }

  async function openDmByUsername(targetUser: string) {
    if (!targetUser || !isAuthed) return;
    try {
      const conv = await chatService.openDm(targetUser);
      await reloadConversations();
      setActiveConversationId(conv._id);
      if (isMobile) setMobileView('thread');
      setPanelError('');
    } catch (err: any) {
      setPanelError(err?.message || 'Could not open DM');
    }
  }

  async function handleCreateGroupSubmit() {
    if (!isAuthed) return;
    const name = groupName.trim();
    if (!name) return;
    try {
      const group = await chatService.createGroup({ name, members: groupMembers, isPublic: groupIsPublic });
      await reloadConversations();
      setActiveConversationId(group._id);
      if (isMobile) setMobileView('thread');
      resetListActions();
    } catch (err: any) {
      setPanelError(err?.message || 'Could not create group');
    }
  }

  function addGroupMemberDraft() {
    const normalized = groupMemberDraft.trim().toLowerCase();
    if (!normalized) return;
    setGroupMembers(prev => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setGroupMemberDraft('');
  }

  function removeDraftGroupMember(member: string) {
    setGroupMembers(prev => prev.filter(m => m !== member));
  }

  async function handleAddMember() {
    if (!activeConversation || activeConversation.type !== 'group') return;
    const member = memberInput.trim();
    if (!member || memberActionBusy) return;
    setMemberActionBusy(true);
    setPanelError('');
    try {
      await chatService.addGroupMember(activeConversation._id, member);
      setMemberInput('');
      await reloadConversations();
    } catch (err: any) {
      setPanelError(err?.message || 'Could not add member');
    }
    setMemberActionBusy(false);
  }

  async function handleRemoveMember(member: string) {
    if (!activeConversation || activeConversation.type !== 'group' || memberActionBusy) return;
    const confirmed = window.confirm(`Remove @${member} from this group?`);
    if (!confirmed) return;
    setMemberActionBusy(true);
    setPanelError('');
    try {
      await chatService.removeGroupMember(activeConversation._id, member);
      await reloadConversations();
    } catch (err: any) {
      setPanelError(err?.message || 'Could not remove member');
    }
    setMemberActionBusy(false);
  }

  async function handleMute(username: string) {
    try {
      await chatService.muteUser(username);
      await reloadPreferences();
      await loadMessages(activeConversationId, activeConversation?.type);
    } catch {}
  }

  async function handleUnmute(username: string) {
    try {
      await chatService.unmuteUser(username);
      await reloadPreferences();
      await loadMessages(activeConversationId, activeConversation?.type);
    } catch {}
  }

  async function handleBlock(username: string) {
    setConfirmBlockUser(username);
  }

  async function confirmBlockAction() {
    const username = confirmBlockUser;
    if (!username) return;
    try {
      await chatService.blockUser(username);
      await reloadPreferences();
      await loadMessages(activeConversationId, activeConversation?.type);
    } catch {}
    setConfirmBlockUser(null);
  }

  async function handleUnblock(username: string) {
    try {
      await chatService.unblockUser(username);
      await reloadPreferences();
      await loadMessages(activeConversationId, activeConversation?.type);
    } catch {}
  }

  async function handleMemoFallbackConfirm() {
    if (!showMemoFallbackPrompt || !user) return;
    const payload = `[sent from snapie.io] New DM from @${user}. Open snapie.io chat to reply.`;
    try {
      await transferEncryptedMemoWithAioha(showMemoFallbackPrompt.peer, 0.001, memoAssetChoice, payload);
      await chatService.markDmMemoFallbackSent(showMemoFallbackPrompt.conversationId);
      setPanelError('');
    } catch (memoErr: any) {
      setPanelError(memoErr?.message || 'Hive memo notify failed');
    }
    setShowMemoFallbackPrompt(null);
  }

  // ── Poll fallback ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || isMinimized || !isAuthed) return;
    pollRef.current = setInterval(async () => {
      try {
        await reloadConversations();
        const msgs = await fetchMessagesForConversation(activeConversationId, activeConversation?.type, { limit: 20 });
        setMessages(msgs);
      } catch {}
    }, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isOpen, isMinimized, isAuthed, activeConversationId, activeConversation?.type, reloadConversations, fetchMessagesForConversation]);

  // ── FCM foreground listener ────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthed) return () => {};
    return onForegroundMessage(async () => {
      await reloadConversations();
      const msgs = await fetchMessagesForConversation(activeConversationId, activeConversation?.type, { limit: 20 });
      setMessages(msgs);
    });
  }, [isAuthed, activeConversationId, activeConversation?.type, reloadConversations, fetchMessagesForConversation]);

  // ── Auto-scroll to bottom on new messages ─────────────────────────────
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleMessagesScroll() {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  }

  function handleResizeStart(e: ReactMouseEvent<HTMLDivElement>) {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: panelSize.width,
      height: panelSize.height,
    };
    setIsResizing(true);
  }

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const dx = start.x - e.clientX;
      const dy = start.y - e.clientY;
      const maxWidth = Math.max(DESKTOP_PANEL_MIN.width, window.innerWidth - 24);
      const maxHeight = Math.max(DESKTOP_PANEL_MIN.height, window.innerHeight - 24);
      setPanelSize({
        width: Math.min(Math.max(start.width + dx, DESKTOP_PANEL_MIN.width), maxWidth),
        height: Math.min(Math.max(start.height + dy, DESKTOP_PANEL_MIN.height), maxHeight),
      });
    };

    const onMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

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
      await chatService.joinChannel(activeConversationId);
      const fcmToken = await getFCMToken();
      if (fcmToken) {
        await chatService.registerDevice(fcmToken);
      }
      await reloadConversations();
      setAuthState('done');
    } catch (err: any) {
      setAuthError(err?.message || 'Unknown error');
      setAuthState('error');
    }
  }

  // ── Send ───────────────────────────────────────────────────────────────
  async function handleSend() {
    const content = draft.trim();
    if (!content || sending || !activeConversation) return;
    setSending(true);
    setDraft('');
    try {
      setPanelError('');
      let msg: Message;
      let dmDelivery: { hasFcm: boolean; memoSuggested: boolean; cooldownMs: number } | undefined;
      if (activeConversation.type === 'dm') {
        const out = await chatService.sendDmMessageWithDelivery(activeConversation._id, content);
        msg = out.message;
        dmDelivery = out.delivery;
      } else {
        msg = await chatService.sendMessage(activeConversation._id, content);
      }
      setMessages(prev => [...prev, msg]);
      if (activeConversation.type === 'dm' && dmDelivery?.memoSuggested && activeConversation.peer && user) {
        setShowMemoFallbackPrompt({ conversationId: activeConversation._id, peer: activeConversation.peer });
      }
      await reloadConversations();
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
  const panelW = isMobile ? '100vw' : `${panelSize.width}px`;
  const panelH = isMobile ? '85vh' : `${panelSize.height}px`;
  const panelBottom = isMobile ? '0' : '0';
  const panelRight = isMobile ? '0' : '16px';
  const borderRadius = isMobile ? '20px 20px 0 0' : '16px 16px 0 0';
  const showList = isMobile ? mobileView === 'list' : true;
  const showThread = isMobile ? mobileView === 'thread' : true;
  const isDesktopSplit = !isMobile;
  const canManageMembers = !!(
    user &&
    activeConversation &&
    activeConversation.type === 'group' &&
    activeConversation.owner === user
  );

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
        maxH={isMobile ? '85vh' : 'calc(100vh - 24px)'}
        zIndex={1400}
        display="flex"
        flexDirection="column"
        cursor={isResizing ? 'nwse-resize' : 'default'}
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
        {!isMobile && (
          <Box
            position="absolute"
            left="0"
            bottom="0"
            w="16px"
            h="16px"
            cursor="nwse-resize"
            zIndex={1500}
            onMouseDown={handleResizeStart}
            title="Resize chat panel"
            sx={{
              background: 'linear-gradient(135deg, transparent 48%, rgba(255,255,255,0.35) 49%, rgba(255,255,255,0.35) 51%, transparent 52%)',
            }}
          />
        )}

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
            {isMobile && mobileView === 'thread' && (
              <IconButton
                aria-label="Back to conversations"
                icon={<FiArrowLeft />}
                size="xs"
                variant="ghost"
                color="whiteAlpha.700"
                onClick={() => setMobileView('list')}
              />
            )}
            <Text fontSize="sm" fontWeight="700" color="white" letterSpacing="0.02em">
              {showList && !showThread ? 'Conversations' : (activeConversation?.type === 'channel' ? `#${activeConversation?.name}` : activeConversation?.name || 'Chat')}
            </Text>
            {showThread && activeConversation?.type === 'dm' && (
              <HStack spacing={1}>
                <Box
                  w="7px"
                  h="7px"
                  borderRadius="full"
                  bg={dmStatus?.peerOnline ? 'green.300' : 'whiteAlpha.400'}
                />
                <Text fontSize="10px" color={dmStatus?.peerOnline ? 'green.200' : 'whiteAlpha.500'}>
                  {dmStatus?.peerOnline ? 'Online' : (dmStatus?.peerLastSeenAt ? `Last seen ${formatLastSeen(dmStatus.peerLastSeenAt)}` : 'Offline')}
                </Text>
              </HStack>
            )}
            {showThread && activeConversation?.type === 'group' && (
              <Badge colorScheme="purple" variant="subtle" borderRadius="full" px={2}>
                {activeConversation.members?.length || 0} members
              </Badge>
            )}
          </HStack>
          <HStack spacing={1}>
            {isMobile && isAuthed && (
              <Menu>
                <MenuButton
                  as={IconButton}
                  aria-label="New conversation"
                  icon={<FiPlus />}
                  size="xs"
                  variant="ghost"
                  color="whiteAlpha.500"
                  _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                />
                <MenuList bg="gray.800" borderColor="whiteAlpha.200">
                  <MenuItem
                    bg="gray.800"
                    color="white"
                    onClick={() => {
                      setMobileView('list');
                      setListAction('new-dm');
                      setPanelError('');
                    }}
                  >
                    Start DM
                  </MenuItem>
                  <MenuItem
                    bg="gray.800"
                    color="white"
                    onClick={() => {
                      setMobileView('list');
                      setListAction('new-group');
                      setPanelError('');
                    }}
                  >
                    Create group
                  </MenuItem>
                </MenuList>
              </Menu>
            )}
            {!isMobile && showList && isAuthed && (
              <>
                <IconButton
                  aria-label="Start DM"
                  icon={<FiMessageSquare />}
                  size="xs"
                  variant="ghost"
                  color="whiteAlpha.500"
                  _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                  onClick={() => {
                    setListAction(listAction === 'new-dm' ? 'none' : 'new-dm');
                    setPanelError('');
                  }}
                />
                <IconButton
                  aria-label="Create group"
                  icon={<FiUsers />}
                  size="xs"
                  variant="ghost"
                  color="whiteAlpha.500"
                  _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                  onClick={() => {
                    setListAction(listAction === 'new-group' ? 'none' : 'new-group');
                    setPanelError('');
                  }}
                />
              </>
            )}
            {onMinimize && !isMobile && (
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

        <Flex
          flex="1"
          minH={0}
          direction={isDesktopSplit ? 'row' : 'column'}
        >
          {/* Conversation list */}
          {showList && (
            <Flex
              px={3}
              py={2}
              direction="column"
              gap={2}
              overflowY="auto"
              flex={isDesktopSplit ? '0 0 42%' : '1'}
              minW={0}
              borderRight={isDesktopSplit ? '1px solid' : 'none'}
              borderRightColor={isDesktopSplit ? 'whiteAlpha.100' : 'transparent'}
              sx={{
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                '&::-webkit-scrollbar': { width: '3px' },
                '&::-webkit-scrollbar-track': { bg: 'transparent' },
                '&::-webkit-scrollbar-thumb': { bg: 'whiteAlpha.200', borderRadius: 'full' },
              }}
            >
            {listAction === 'new-dm' && (
              <Box border="1px solid" borderColor="whiteAlpha.200" borderRadius="12px" p={3} bg="whiteAlpha.50">
                <Text color="white" fontSize="xs" mb={2}>Start Direct Message</Text>
                <HStack>
                  <Input
                    value={dmTarget}
                    onChange={e => setDmTarget(e.target.value)}
                    placeholder="Hive username"
                    size="sm"
                    bg="blackAlpha.300"
                    borderColor="whiteAlpha.200"
                    color="white"
                  />
                  <Button size="sm" colorScheme="blue" onClick={handleCreateDmSubmit}>Start</Button>
                </HStack>
              </Box>
            )}
            {listAction === 'new-group' && (
              <Box border="1px solid" borderColor="whiteAlpha.200" borderRadius="12px" p={3} bg="whiteAlpha.50">
                <Text color="white" fontSize="xs" mb={2}>Create Group Chat</Text>
                <VStack spacing={2} align="stretch">
                  <Input
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    placeholder="Group name"
                    size="sm"
                    bg="blackAlpha.300"
                    borderColor="whiteAlpha.200"
                    color="white"
                  />
                  <Input
                    value={groupMemberDraft}
                    onChange={e => setGroupMemberDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addGroupMemberDraft();
                      }
                    }}
                    placeholder="Add member username"
                    size="sm"
                    bg="blackAlpha.300"
                    borderColor="whiteAlpha.200"
                    color="white"
                  />
                  <HStack justify="space-between">
                    <HStack spacing={2} flexWrap="wrap">
                      {groupMembers.map(member => (
                        <HStack key={member} spacing={1} bg="whiteAlpha.100" px={2} py={1} borderRadius="full">
                          <Avatar size="2xs" name={member} src={getHiveAvatarUrl(member, 'small')} />
                          <Text fontSize="10px" color="whiteAlpha.900">@{member}</Text>
                          <IconButton
                            aria-label={`Remove ${member}`}
                            icon={<FiX />}
                            size="2xs"
                            variant="ghost"
                            color="red.300"
                            onClick={() => removeDraftGroupMember(member)}
                          />
                        </HStack>
                      ))}
                    </HStack>
                    <Button size="xs" variant="ghost" colorScheme="blue" onClick={addGroupMemberDraft}>
                      Add
                    </Button>
                  </HStack>
                  <HStack justify="space-between">
                    <HStack>
                      <Switch size="sm" isChecked={groupIsPublic} onChange={e => setGroupIsPublic(e.target.checked)} />
                      <Text color="whiteAlpha.700" fontSize="xs">Public group</Text>
                    </HStack>
                    <Button size="sm" colorScheme="blue" onClick={handleCreateGroupSubmit}>Create</Button>
                  </HStack>
                </VStack>
              </Box>
            )}
            {!!panelError && (
              <Text fontSize="xs" color="red.300" px={1}>{panelError}</Text>
            )}
            {conversations.length === 0 ? (
              <Flex flex="1" align="center" justify="center" py={6}>
                <Text fontSize="xs" color="whiteAlpha.500">No conversations yet</Text>
              </Flex>
            ) : (
              conversations.map(conv => (
                <ConversationRow
                  key={conv._id}
                  conv={conv}
                  isActive={conv._id === activeConversationId}
                  onClick={() => handleOpenConversation(conv)}
                />
              ))
            )}
            </Flex>
          )}

          {/* Thread view */}
          {showThread && (
            <Flex flex="1" minW={0} direction="column">
              {canManageMembers && (
                <Box px={3} py={2} borderBottom="1px solid" borderColor="whiteAlpha.100" bg="whiteAlpha.50">
                  <Text fontSize="10px" color="whiteAlpha.600" mb={2}>Group members (owner controls)</Text>
                  <HStack mb={2}>
                    <Input
                      value={memberInput}
                      onChange={e => setMemberInput(e.target.value)}
                      placeholder="Add member username"
                      size="xs"
                      bg="blackAlpha.300"
                      borderColor="whiteAlpha.200"
                      color="white"
                    />
                    <Button size="xs" colorScheme="blue" onClick={handleAddMember} isLoading={memberActionBusy}>Add</Button>
                  </HStack>
                  <HStack spacing={2} flexWrap="wrap">
                    {(activeConversation?.members || []).map(member => (
                      <HStack key={member} spacing={1} bg="whiteAlpha.100" px={2} py={1} borderRadius="full">
                        <Avatar size="2xs" name={member} src={getHiveAvatarUrl(member, 'small')} />
                        <Text fontSize="10px" color="whiteAlpha.900">@{member}</Text>
                        {member === activeConversation.owner && (
                          <Badge colorScheme="purple" variant="solid" fontSize="8px" borderRadius="full">Owner</Badge>
                        )}
                        {member !== activeConversation.owner && (
                          <Badge colorScheme="blue" variant="subtle" fontSize="8px" borderRadius="full">Member</Badge>
                        )}
                        {member !== activeConversation.owner && (
                          <IconButton
                            aria-label={`Remove ${member}`}
                            icon={<FiX />}
                            size="2xs"
                            variant="ghost"
                            color="red.300"
                            onClick={() => handleRemoveMember(member)}
                          />
                        )}
                      </HStack>
                    ))}
                  </HStack>
                  <Divider mt={2} borderColor="whiteAlpha.200" />
                </Box>
              )}
              <Flex
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                flex="1"
                direction="column"
                overflowY="auto"
                px={4}
                py={3}
                gap={2}
                sx={{
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
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
                    <MessageBubble
                      key={msg._id}
                      msg={msg}
                      isOwn={msg.sender === user}
                      onOpenDm={openDmByUsername}
                    />
                    ))}
                    {activeConversation?.type === 'dm' && (() => {
                      const myLast = [...messages].reverse().find(m => m.sender === user);
                      if (!myLast) return null;
                      const peerSeenTs = dmStatus?.peerSeenAt ? new Date(dmStatus.peerSeenAt).getTime() : 0;
                      const msgTs = new Date(myLast.createdAt).getTime();
                      if (peerSeenTs && peerSeenTs >= msgTs) {
                        return (
                          <Text fontSize="10px" color="whiteAlpha.500" textAlign="right" pr={1}>
                            Seen
                          </Text>
                        );
                      }
                      return null;
                    })()}
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
                        leftIcon={<Icon as={FiPlus} />}
                        borderRadius="full"
                        px={6}
                      >
                        Connect
                      </Button>
                      {authState === 'error' && (
                        <Text fontSize="xs" color="red.400">{authError || 'Sign failed — try again'}</Text>
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
                pb="calc(12px + env(safe-area-inset-bottom))"
                direction="column"
              >
                {confirmBlockUser && (
                  <Box
                    w="100%"
                    border="1px solid"
                    borderColor="red.400"
                    bg="red.900"
                    borderRadius="10px"
                    p={2}
                  >
                    <Text fontSize="xs" color="white" mb={2}>
                      Block @{confirmBlockUser}? You will no longer receive their messages.
                    </Text>
                    <HStack justify="flex-end">
                      <Button size="xs" variant="ghost" onClick={() => setConfirmBlockUser(null)}>Cancel</Button>
                      <Button size="xs" colorScheme="red" onClick={confirmBlockAction}>Block</Button>
                    </HStack>
                  </Box>
                )}
                {showMemoFallbackPrompt && (
                  <Box
                    w="100%"
                    border="1px solid"
                    borderColor="blue.400"
                    bg="blue.900"
                    borderRadius="10px"
                    p={2}
                  >
                    <Text fontSize="xs" color="white" mb={2}>
                      @{showMemoFallbackPrompt.peer} has no push token. Send encrypted Hive memo fallback?
                    </Text>
                    <HStack mb={2}>
                      <Button
                        size="xs"
                        variant={memoAssetChoice === 'HIVE' ? 'solid' : 'ghost'}
                        colorScheme="blue"
                        onClick={() => setMemoAssetChoice('HIVE')}
                      >
                        HIVE
                      </Button>
                      <Button
                        size="xs"
                        variant={memoAssetChoice === 'HBD' ? 'solid' : 'ghost'}
                        colorScheme="blue"
                        onClick={() => setMemoAssetChoice('HBD')}
                      >
                        HBD
                      </Button>
                    </HStack>
                    <HStack justify="flex-end">
                      <Button size="xs" variant="ghost" onClick={() => setShowMemoFallbackPrompt(null)}>Skip</Button>
                      <Button size="xs" colorScheme="blue" onClick={handleMemoFallbackConfirm}>
                        Send 0.001 {memoAssetChoice}
                      </Button>
                    </HStack>
                  </Box>
                )}
                <HStack spacing={1} w="100%" justify="space-between">
                  <HStack spacing={1} flexWrap="wrap">
                    {QUICK_EMOJIS.map(em => (
                      <Button
                        key={em}
                        size="xs"
                        variant="ghost"
                        minW="unset"
                        px={2}
                        onClick={() => setDraft(prev => `${prev}${em}`)}
                      >
                        {em}
                      </Button>
                    ))}
                  </HStack>
                  {activeConversation?.type === 'dm' && activeConversation.peer && (
                    <Menu>
                      <MenuButton as={Button} size="xs" variant="ghost" rightIcon={<FiChevronDown />}>
                        Manage
                      </MenuButton>
                      <MenuList bg="gray.800" borderColor="whiteAlpha.200">
                        {mutedUsers.includes(activeConversation.peer) ? (
                          <MenuItem bg="gray.800" color="white" onClick={() => handleUnmute(activeConversation.peer || '')}>
                            Unmute @{activeConversation.peer}
                          </MenuItem>
                        ) : (
                          <MenuItem bg="gray.800" color="white" onClick={() => handleMute(activeConversation.peer || '')}>
                            Mute @{activeConversation.peer}
                          </MenuItem>
                        )}
                        {blockedUsers.includes(activeConversation.peer) ? (
                          <MenuItem bg="gray.800" color="white" onClick={() => handleUnblock(activeConversation.peer || '')}>
                            Unblock @{activeConversation.peer}
                          </MenuItem>
                        ) : (
                          <MenuItem bg="gray.800" color="red.300" onClick={() => handleBlock(activeConversation.peer || '')}>
                            Block @{activeConversation.peer}
                          </MenuItem>
                        )}
                      </MenuList>
                    </Menu>
                  )}
                </HStack>
                <HStack w="100%">
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
                </HStack>
                </Flex>
              )}
            </Flex>
          )}
        </Flex>
      </Box>
    </>
  );
}
