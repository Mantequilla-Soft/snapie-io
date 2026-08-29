'use client'
import { Box, Flex } from '@chakra-ui/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/layout/Sidebar';
import MobileHeader from '@/components/layout/MobileHeader';
import BottomTabBar from '@/components/layout/BottomTabBar';
import MeSheet from '@/components/layout/MeSheet';
import ChatPanel from '@/components/chat/ChatPanel';
import { chatService } from '@/lib/chat/ChatService';
import { useHangout } from '@/contexts/HangoutContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useShowInterestPicker } from '@/hooks/useShowInterestPicker';
import { isPointsEnabledFor } from '@/lib/points/config';

const HangoutModal = dynamic(() => import('@/components/hangouts/HangoutModal'), { ssr: false });
const EmancipationBanner = dynamic(() => import('@/components/auth/EmancipationBanner'), { ssr: false });
const NeedsWalletHandler = dynamic(() => import('@/components/auth/NeedsWalletHandler'), { ssr: false });
const InterestPicker = dynamic(() => import('@/components/onboarding/InterestPicker'), { ssr: false });
const WhatsNewModal = dynamic(() => import('@/components/whatsnew/WhatsNewModal'), { ssr: false });
const PointsToaster = dynamic(() => import('@/components/points/PointsToaster'), { ssr: false });
const DebugConsole = dynamic(() => import('@/components/debug/DebugConsole'), { ssr: false });

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isComposePage = pathname === '/compose';
  const isShortsPage = pathname === '/shorts';
  const isEmbedMode = searchParams.get('embed') === 'true';
  const isChatPopoutMode = searchParams.get('chat_popout') === '1';
  const { activeRoom, closeRoom } = useHangout();
  const { settings } = useUserSettings();
  const { username: currentUsername } = useCurrentUser();
  // Discovery Engine Phase 2 — onboarding only ever shows while behind the
  // discovery flag (see hooks/useShowInterestPicker.ts), and only to brand-new
  // Hive accounts, server-authoritative so it doesn't reappear on a new
  // device/browser once dismissed.
  const { shouldShow: showInterestPicker, dismiss: dismissInterestPicker } = useShowInterestPicker(currentUsername);
  const baseGradient = settings.colorMode === 'light'
    ? 'radial(circle at 18% 8%, rgba(3, 105, 161, 0.08), transparent 34%), radial(circle at 78% 0%, rgba(3, 105, 161, 0.05), transparent 30%), linear(to-br, #ffffff, #f8fafc 48%, #f1f5f9)'
    : 'radial(circle at 18% 8%, rgba(28, 161, 241, 0.12), transparent 34%), radial(circle at 78% 0%, rgba(28, 161, 241, 0.07), transparent 30%), linear(to-br, #080f1e, #0d1525 48%, #070d1a)';

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [isMeSheetOpen, setIsMeSheetOpen] = useState(false);
  const popoutRef = useRef<Window | null>(null);

  useEffect(() => {
    if (isEmbedMode) {
      document.body.classList.add('embed-mode');
    } else {
      document.body.classList.remove('embed-mode');
    }
    return () => { document.body.classList.remove('embed-mode'); };
  }, [isEmbedMode]);

  //  Polls unconditionally, including while the panel is open or minimized.
  //  It used to pause whenever isChatOpen — which stays true when the panel is
  //  minimized — and zero the count locally on open, so the badge was a local
  //  guess that read 0 through arriving DMs and then snapped back on close.
  //  Clearing is now the server's job: ChatPanel marks a conversation read and
  //  hands us the recomputed total.
  const refreshChatUnread = useCallback(async () => {
    if (isEmbedMode) return;
    setChatUnreadCount(await chatService.getUnreadCount());
  }, [isEmbedMode]);

  useEffect(() => {
    if (isEmbedMode) return;
    refreshChatUnread();
    const id = setInterval(refreshChatUnread, 30000);
    return () => clearInterval(id);
  }, [isEmbedMode, refreshChatUnread]);

  useEffect(() => {
    if (!isChatPopoutMode) return;
    setIsChatOpen(true);
    setIsChatMinimized(false);
  }, [isChatPopoutMode]);

  // Close MeSheet when navigating
  useEffect(() => { setIsMeSheetOpen(false); }, [pathname]);

  const handlePopoutChat = useCallback(() => {
    if (typeof window === 'undefined') return;
    const width = 520;
    const height = 760;
    const left = window.screenX + Math.max(0, window.outerWidth - width - 40);
    const top = window.screenY + 40;

    if (popoutRef.current && !popoutRef.current.closed) {
      popoutRef.current.focus();
      return;
    }

    const popup = window.open(
      '/?embed=true&chat_popout=1',
      'snapie-chat-popout',
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`
    );
    if (!popup) return;
    popoutRef.current = popup;
    setIsChatOpen(false);
    setIsChatMinimized(false);
    popup.addEventListener('beforeunload', () => {
      popoutRef.current = null;
    });
  }, []);

  // On mobile, pad content away from the fixed header and tab bar.
  // Skip padding on shorts (full-screen immersive) and embed/popout modes.
  // The tab bar itself is 60px, but on notched devices its own safe-area
  // padding (see BottomTabBar) pushes its actual top edge higher than that —
  // so content needs to clear 60px + the safe-area inset, plus a bit of
  // breathing room, or the last bit of a short page (e.g. a post's only
  // comment) ends up permanently hidden behind the fixed bar with nowhere
  // left to scroll to reveal it.
  const mobilePaddingTop = !isEmbedMode && !isChatPopoutMode && !isShortsPage ? { base: '56px', sm: '0' } : undefined;
  const mobilePaddingBottom = !isEmbedMode && !isChatPopoutMode && !isShortsPage ? { base: 'calc(76px + env(safe-area-inset-bottom))', sm: '0' } : undefined;

  return (
    <Box
      bg="background"
      color="text"
      minH="100dvh"
      bgGradient={baseGradient}
    >
      <Box maxW="1320px" mx="auto" h="100dvh">
        <Flex direction={{ base: 'column', sm: 'row' }} h="100dvh">
          {!isEmbedMode && !isChatPopoutMode && (
            <Sidebar isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} chatUnreadCount={chatUnreadCount} />
          )}
          <Box
            id="app-scroll-container"
            flex="1"
            h="100dvh"
            overflowY="auto"
            pt={mobilePaddingTop}
          >
            {/* Deliberately NOT display=flex/flexDirection=column: this box's
                children (EmancipationBanner, the routed page, the spacer
                below) were flex items of a fixed-height flex container, so
                flexbox's default shrink resolved the routed page's box to
                ~viewport height regardless of its actual content — any
                overflow was still painted (visible), but anything placed
                after it in flex order landed layered inside that overflow
                instead of truly after it, so it never extended scrollHeight.
                Plain block flow lets each child's real content height push
                the next one down, which the spacer below depends on. */}
            <EmancipationBanner />
            {!isChatPopoutMode && children}
            <NeedsWalletHandler />
            {/* A real element, not padding-bottom on the scroll container —
                some browsers don't extend an overflow:auto element's
                scrollHeight to include its own trailing padding, so a page
                whose content ends close to one viewport tall (e.g. a post
                with a single comment) could never actually scroll far enough
                to clear the fixed BottomTabBar. */}
            {mobilePaddingBottom && (
              <Box h={mobilePaddingBottom} aria-hidden />
            )}
          </Box>
        </Flex>
      </Box>

      {!isEmbedMode && !isChatPopoutMode && (
        <>
          {/* Mobile chrome */}
          <MobileHeader onMePress={() => setIsMeSheetOpen(true)} />
          <BottomTabBar />
          <MeSheet
            isOpen={isMeSheetOpen}
            onClose={() => setIsMeSheetOpen(false)}
            onToggleChat={() => setIsChatOpen(c => !c)}
            chatUnreadCount={chatUnreadCount}
          />

          {/* Chat panel (all screen sizes) */}
          <ChatPanel
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            isMinimized={isChatMinimized}
            onMinimize={() => setIsChatMinimized(true)}
            onRestore={() => { setIsChatMinimized(false); setIsChatOpen(true); }}
            onPopout={handlePopoutChat}
            onUnreadChange={setChatUnreadCount}
          />
        </>
      )}
      {isChatPopoutMode && (
        <ChatPanel
          isOpen={isChatOpen}
          onClose={() => {
            setIsChatOpen(false);
            if (typeof window !== 'undefined') window.close();
          }}
          isMinimized={false}
          isPopoutWindow
        />
      )}
      {!isEmbedMode && activeRoom && (
        <HangoutModal isOpen onClose={closeRoom} roomName={activeRoom} />
      )}
      {!isEmbedMode && !isChatPopoutMode && showInterestPicker && (
        <InterestPicker onDone={dismissInterestPicker} />
      )}
      {/* "What's new" changelog — everyone, not just the discovery allowlist,
          but never stacked on top of the onboarding picker. */}
      {!isEmbedMode && !isChatPopoutMode && !showInterestPicker && <WhatsNewModal />}
      {/* Snapie Points earn-toaster — allowlist-gated dogfood (Stage 1). */}
      {!isEmbedMode && !isChatPopoutMode && isPointsEnabledFor(currentUsername) && <PointsToaster />}
      {/* Opt-in mobile debug console (?debug=1) — see components/debug/DebugConsole.tsx. */}
      <DebugConsole />
    </Box>
  );
}
