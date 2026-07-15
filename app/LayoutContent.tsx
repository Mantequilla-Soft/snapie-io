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
import { isDiscoveryEnabledFor } from '@/lib/discovery/config';
import { isPointsEnabledFor } from '@/lib/points/config';

const HangoutModal = dynamic(() => import('@/components/hangouts/HangoutModal'), { ssr: false });
const EmancipationBanner = dynamic(() => import('@/components/auth/EmancipationBanner'), { ssr: false });
const NeedsWalletHandler = dynamic(() => import('@/components/auth/NeedsWalletHandler'), { ssr: false });
const InterestPicker = dynamic(() => import('@/components/onboarding/InterestPicker'), { ssr: false });
const WhatsNewModal = dynamic(() => import('@/components/whatsnew/WhatsNewModal'), { ssr: false });
const PointsToaster = dynamic(() => import('@/components/points/PointsToaster'), { ssr: false });

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
  // Discovery Engine Phase 2 — onboarding only ever shows while dogfooding
  // behind the same flag + allowlist as the rest of "For You" personalization
  // (see lib/discovery/config.ts). Invisible to everyone else regardless of
  // their interestsOnboardedAt state.
  const showInterestPicker = isDiscoveryEnabledFor(currentUsername) && settings.interestsOnboardedAt === null;
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

  useEffect(() => {
    if (isEmbedMode || isChatOpen) return;
    const poll = async () => { setChatUnreadCount(await chatService.getUnreadCount()); };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [isChatOpen, isEmbedMode]);

  useEffect(() => { if (isChatOpen) setChatUnreadCount(0); }, [isChatOpen]);

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
  const mobilePaddingTop = !isEmbedMode && !isChatPopoutMode && !isShortsPage ? { base: '56px', sm: '0' } : undefined;
  const mobilePaddingBottom = !isEmbedMode && !isChatPopoutMode && !isShortsPage ? { base: '64px', sm: '0' } : undefined;

  return (
    <Box
      bg="background"
      color="text"
      minH="100vh"
      bgGradient={baseGradient}
    >
      <Box maxW="1320px" mx="auto" h="100vh">
        <Flex direction={{ base: 'column', sm: 'row' }} h="100vh">
          {!isEmbedMode && !isChatPopoutMode && (
            <Sidebar isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} chatUnreadCount={chatUnreadCount} />
          )}
          <Box
            flex="1"
            h="100vh"
            overflowY="auto"
            display="flex"
            flexDirection="column"
            pt={mobilePaddingTop}
            pb={mobilePaddingBottom}
          >
            <EmancipationBanner />
            {!isChatPopoutMode && children}
            <NeedsWalletHandler />
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
        // No-op: saving/skipping updates interestsOnboardedAt via
        // useUserSettings, which flips showInterestPicker false and
        // unmounts this on its own — no separate close handler needed.
        <InterestPicker onDone={() => {}} />
      )}
      {/* "What's new" changelog — everyone, not just the discovery allowlist,
          but never stacked on top of the onboarding picker. */}
      {!isEmbedMode && !isChatPopoutMode && !showInterestPicker && <WhatsNewModal />}
      {/* Snapie Points earn-toaster — allowlist-gated dogfood (Stage 1). */}
      {!isEmbedMode && !isChatPopoutMode && isPointsEnabledFor(currentUsername) && <PointsToaster />}
    </Box>
  );
}
