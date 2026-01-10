'use client'
import { Box, Flex } from '@chakra-ui/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import FooterNavigation from '@/components/layout/FooterNavigation';
import ChatPanel from '@/components/chat/ChatPanel';
import { Providers } from './providers';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isComposePage = pathname === '/compose';
  const isEmbedMode = searchParams.get('embed') === 'true';
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  useEffect(() => {
    console.log('🟢 Layout: isChatOpen changed to:', isChatOpen);
  }, [isChatOpen]);

  useEffect(() => {
    // Add embed-mode class to body when embed mode is active
    if (isEmbedMode) {
      document.body.classList.add('embed-mode');
    } else {
      document.body.classList.remove('embed-mode');
    }
  }, [isEmbedMode]);

  // Poll for unread messages
  useEffect(() => {
    if (isEmbedMode) return; // Skip chat polling in embed mode

    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/chat/unread', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setChatUnreadCount(data.unread || 0);
        }
      } catch (err) {
        // Silently fail - don't spam console
      }
    };

    // Fetch immediately
    fetchUnread();
    
    // Poll every 30 seconds when chat is closed
    const interval = setInterval(() => {
      if (!isChatOpen) {
        fetchUnread();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isChatOpen, isEmbedMode]);

  // Clear unread count when chat is opened
  useEffect(() => {
    if (isChatOpen) {
      setChatUnreadCount(0);
    }
  }, [isChatOpen]);

  return (
    <Box bg="background" color="text" minH="100vh">
      <Flex direction={{ base: 'column', sm: 'row' }} h="100vh">
        {!isEmbedMode && (
          <Sidebar isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} chatUnreadCount={chatUnreadCount} />
        )}
        <Box 
          flex="1" 
          ml={isEmbedMode ? '0' : (isComposePage ? { base: '0', sm: '60px' } : { base: '0', sm: '60px', md: '20%' })}
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
            onRestore={() => setIsChatMinimized(false)}
            unreadCount={chatUnreadCount}
          />
        </>
      )}
    </Box>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Suspense fallback={<Box bg="background" color="text" minH="100vh">{children}</Box>}>
            <LayoutContent>{children}</LayoutContent>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
