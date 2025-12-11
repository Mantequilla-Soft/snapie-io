'use client'
import { Box, Flex } from '@chakra-ui/react';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import FooterNavigation from '@/components/layout/FooterNavigation';
import ChatPanel from '@/components/chat/ChatPanel';
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isComposePage = pathname === '/compose';
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  useEffect(() => {
    console.log('🟢 Layout: isChatOpen changed to:', isChatOpen);
  }, [isChatOpen]);

  // Poll for unread messages
  useEffect(() => {
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
  }, [isChatOpen]);

  // Clear unread count when chat is opened
  useEffect(() => {
    if (isChatOpen) {
      setChatUnreadCount(0);
    }
  }, [isChatOpen]);

  return (
    <html lang="en">
      <body>
        <Providers>
          <Box bg="background" color="text" minH="100vh">
            <Flex direction={{ base: 'column', sm: 'row' }} h="100vh">
              <Sidebar isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} chatUnreadCount={chatUnreadCount} />
              <Box 
                flex="1" 
                ml={isComposePage ? { base: '0', sm: '60px' } : { base: '0', sm: '60px', md: '20%' }}
                h="100vh"
                overflowY="auto"
                transition="margin-left 0.3s ease"
              >
                {children}
              </Box>
            </Flex>
            <FooterNavigation isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} chatUnreadCount={chatUnreadCount} />
            <ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
          </Box>
        </Providers>
      </body>
    </html>
  );
}
