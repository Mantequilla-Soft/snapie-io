
'use client'

import { ChakraProvider } from '@chakra-ui/react'

import { blueSkyTheme } from '@/themes/bluesky'
import { hackerTheme } from '@/themes/hacker'
import { nounsDaoTheme } from '@/themes/nounish'
import { forestTheme } from '@/themes/forest'


import { Aioha } from '@aioha/aioha'
import { AiohaProvider } from '@aioha/react-ui'

import { useEffect } from 'react'
import { windows95Theme } from '@/themes/windows95'
import { hiveBRTheme } from '@/themes/hivebr'
import { cannabisTheme } from '@/themes/cannabis'
import { mengaoTheme } from '@/themes/mengao'
import { UserProvider } from '@/contexts/UserContext'

const aioha = new Aioha()

const themeMap = {
  forest: forestTheme,
  bluesky: blueSkyTheme,
  hacker: hackerTheme,
  nounish: nounsDaoTheme,
  windows95: windows95Theme,
  snapie: windows95Theme,
  hivebr: hiveBRTheme,
  cannabis: cannabisTheme,
  mengao: mengaoTheme,
}

type ThemeName = keyof typeof themeMap;

const themeName = (process.env.NEXT_PUBLIC_THEME as ThemeName) || 'hacker';
const selectedTheme = themeMap[themeName];

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    aioha.registerKeychain()
    aioha.registerLedger()
    aioha.registerPeakVault()
    aioha.registerHiveAuth({
      name: process.env.NEXT_PUBLIC_COMMUNITY_NAME || 'MyCommunity',
      description: ''
    })
    aioha.loadAuth()
  })

  // Global listener for 3Speak video player orientation
  useEffect(() => {
    const handleVideoOrientation = (event: MessageEvent) => {
      // Check if message is from 3speak player
      if (event.data.type === '3speak-player-ready') {
        console.log('📹 3Speak video loaded:', event.data);
        
        // Find all 3speak iframes and match by src
        const iframes = document.querySelectorAll('iframe[src*="play.3speak.tv"]');
        
        iframes.forEach((iframe) => {
          const iframeElement = iframe as HTMLIFrameElement;
          
          // Check if this iframe's contentWindow matches the event source
          try {
            if (iframeElement.contentWindow === event.source) {
              if (event.data.isVertical) {
                // Vertical video - mobile-friendly portrait dimensions
                iframeElement.style.height = '800px';
                iframeElement.style.maxWidth = '450px';
                iframeElement.style.margin = '0 auto';
                iframeElement.parentElement?.classList.add('vertical-video');
                console.log('📱 Applied vertical video styling');
              } else {
                // Horizontal video - standard landscape dimensions
                iframeElement.style.height = '450px';
                iframeElement.style.maxWidth = '800px';
                iframeElement.style.margin = '0 auto';
                iframeElement.parentElement?.classList.add('horizontal-video');
                console.log('🖥️ Applied horizontal video styling');
              }
            }
          } catch (e) {
            // Cross-origin check failed, skip this iframe
          }
        });
      }
    };

    window.addEventListener('message', handleVideoOrientation);
    
    return () => {
      window.removeEventListener('message', handleVideoOrientation);
    };
  }, []);

  return (
    <ChakraProvider theme={selectedTheme}>
      <AiohaProvider aioha={aioha}>
        <UserProvider>
          {children}
        </UserProvider>
      </AiohaProvider>
    </ChakraProvider>
  )
}
