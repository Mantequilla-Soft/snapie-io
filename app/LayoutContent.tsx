'use client'
import { Box, Flex } from '@chakra-ui/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/layout/Sidebar';
import FooterNavigation from '@/components/layout/FooterNavigation';
import ChatPanel from '@/components/chat/ChatPanel';
import { chatService } from '@/lib/chat/ChatService';
import { useHangout } from '@/contexts/HangoutContext';

const HangoutModal = dynamic(() => import('@/components/hangouts/HangoutModal'), { ssr: false });
const EmancipationBanner = dynamic(() => import('@/components/auth/EmancipationBanner'), { ssr: false });

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isComposePage = pathname === '/compose';
  const isEmbedMode = searchParams.get('embed') === 'true';
  const isChatPopoutMode = searchParams.get('chat_popout') === '1';
  const { activeRoom, closeRoom } = useHangout();

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const popoutRef = useRef<Window | null>(null);

  useEffect(() => {
    if (isEmbedMode) {
      document.body.classList.add('embed-mode');
    } else {
      document.body.classList.remove('embed-mode');
    }
    return () => { document.body.classList.remove('embed-mode'); };
  }, [isEmbedMode]);

  // Poll unread count when chat is closed
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

  return (
    <Box
      bg="background"
      color="text"
      minH="100vh"
      bgGradient="radial(circle at 18% 8%, rgba(24, 168, 255, 0.16), transparent 34%), radial(circle at 78% 0%, rgba(102, 228, 255, 0.10), transparent 30%), linear(to-br, #06111f, #071827 48%, #04101d)"
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
          >
            <EmancipationBanner />
            {!isChatPopoutMode && children}
          </Box>
        </Flex>
      </Box>
      {!isEmbedMode && !isChatPopoutMode && (
        <>
          <FooterNavigation isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} chatUnreadCount={chatUnreadCount} />
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
    </Box>
  );
}
