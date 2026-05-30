'use client'
import { Box, Flex } from '@chakra-ui/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/layout/Sidebar';
import FooterNavigation from '@/components/layout/FooterNavigation';
import ChatPanel from '@/components/chat/ChatPanel';
import { chatService } from '@/lib/chat/ChatService';
import { useHangout } from '@/contexts/HangoutContext';

const HangoutModal = dynamic(() => import('@/components/hangouts/HangoutModal'), { ssr: false });

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isComposePage = pathname === '/compose';
  const isEmbedMode = searchParams.get('embed') === 'true';
  const { activeRoom, closeRoom } = useHangout();

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

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

  return (
    <Box
      bg="background"
      color="text"
      minH="100vh"
      bgGradient="radial(circle at 18% 8%, rgba(24, 168, 255, 0.16), transparent 34%), radial(circle at 78% 0%, rgba(102, 228, 255, 0.10), transparent 30%), linear(to-br, #06111f, #071827 48%, #04101d)"
    >
      <Flex direction={{ base: 'column', sm: 'row' }} h="100vh">
        {!isEmbedMode && (
          <Sidebar isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} chatUnreadCount={chatUnreadCount} />
        )}
        <Box
          flex="1"
          ml={isEmbedMode ? '0' : (isComposePage ? { base: '0', sm: '96px' } : { base: '0', sm: '96px', md: '296px' })}
          h="100vh"
          overflowY="auto"
          transition="margin-left 0.3s ease"
        >
          {children}
        </Box>
      </Flex>
      {!isEmbedMode && (
        <>
          <FooterNavigation isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} chatUnreadCount={chatUnreadCount} />
          <ChatPanel
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            isMinimized={isChatMinimized}
            onMinimize={() => setIsChatMinimized(true)}
            onRestore={() => { setIsChatMinimized(false); setIsChatOpen(true); }}
          />
        </>
      )}
      {!isEmbedMode && activeRoom && (
        <HangoutModal isOpen onClose={closeRoom} roomName={activeRoom} />
      )}
    </Box>
  );
}
