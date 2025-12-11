'use client'
import { Box, Flex } from '@chakra-ui/react';
import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import FooterNavigation from '@/components/layout/FooterNavigation';
import ChatPanel from '@/components/chat/ChatPanel';
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isComposePage = pathname === '/compose';

  return (
    <html lang="en">
      <body>
        <Providers>
          <Box bg="background" color="text" minH="100vh">
            <Flex direction={{ base: 'column', sm: 'row' }} h="100vh">
              <Sidebar />
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
            <FooterNavigation />
            <ChatPanel />
          </Box>
        </Providers>
      </body>
    </html>
  );
}
