
'use client'

import { ChakraProvider } from '@chakra-ui/react'

import { blueSkyTheme } from '@/themes/bluesky'
import { hackerTheme } from '@/themes/hacker'
import { nounsDaoTheme } from '@/themes/nounish'
import { forestTheme } from '@/themes/forest'

import { useEffect } from 'react'
import { windows95Theme } from '@/themes/windows95'
import { hiveBRTheme } from '@/themes/hivebr'
import { cannabisTheme } from '@/themes/cannabis'
import { mengaoTheme } from '@/themes/mengao'
import { KeychainProvider } from '@/contexts/KeychainContext'
import { UserProvider } from '@/contexts/UserContext'

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

// Persistent across renders + strict mode remounts
let hasAttachedPlayerListener = false;

// WeakSet tracks which iframes have been styled
const styledIframes = new WeakSet<HTMLIFrameElement>();

// WeakMap caches window→iframe mapping to avoid repeated searches
const iframeBySource = new WeakMap<Window, HTMLIFrameElement>();

// Helper function to style an iframe based on orientation
function styleIframe(iframe: HTMLIFrameElement, data: any) {
  const isVertical = data.isVertical;
  
  const parent = iframe.parentElement;
  if (!parent) return;
  
  if (isVertical) {
    // Vertical videos: constrain width, height auto
    iframe.style.position = 'static';
    iframe.style.width = '100%';
    iframe.style.maxWidth = '450px';
    iframe.style.height = 'auto';
    iframe.style.aspectRatio = '9 / 16';
    iframe.style.display = 'block';
    iframe.style.margin = '0 auto';
    iframe.style.overflow = 'hidden';
    
    parent.style.display = 'flex';
    parent.style.justifyContent = 'center';
    parent.style.width = '100%';
    parent.style.overflow = 'hidden';
  } else {
    // Horizontal videos: use padding trick
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.overflow = 'hidden';
    
    parent.style.position = 'relative';
    parent.style.width = '100%';
    parent.style.maxWidth = '800px';
    parent.style.margin = '0 auto';
    parent.style.paddingBottom = '56.25%'; // 16:9 ratio
    parent.style.overflow = 'hidden';
  }
  
  parent.classList.add(isVertical ? 'vertical-video' : 'horizontal-video');
  
  // Only log in development
  if (process.env.NODE_ENV === 'development') {
    console.log('📹 3Speak video:', isVertical ? 'vertical' : 'horizontal');
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Global listener for 3Speak video player orientation
  useEffect(() => {
    // Prevent Strict Mode from double-attaching the listener
    if (hasAttachedPlayerListener) return;
    
    const handleVideoOrientation = (event: MessageEvent) => {
      // Check if message is from 3speak player
      if (event.data?.type !== '3speak-player-ready') return;
      
      // Check if we've already mapped this event source to an iframe
      const linkedIframe = iframeBySource.get(event.source as Window);
      
      if (linkedIframe) {
        // Already matched this window → iframe pair, style once only
        if (!styledIframes.has(linkedIframe)) {
          styleIframe(linkedIframe, event.data);
          styledIframes.add(linkedIframe);
        }
        return; // Done - no need to search through all iframes
      }
      
      // First time seeing this event source - find matching iframe
      const iframes = document.querySelectorAll<HTMLIFrameElement>(
        'iframe[src*="play.3speak.tv"]'
      );
      
      iframes.forEach((iframe) => {
        try {
          if (iframe.contentWindow === event.source) {
            // Cache this window → iframe mapping
            iframeBySource.set(event.source as Window, iframe);
            
            // Style if not already styled
            if (!styledIframes.has(iframe)) {
              styleIframe(iframe, event.data);
              styledIframes.add(iframe);
            }
          }
        } catch {
          // Cross-origin check failed, skip
        }
      });
    };

    window.addEventListener('message', handleVideoOrientation);
    hasAttachedPlayerListener = true;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🎯 Attached 3Speak orientation listener');
    }
  }, []);

  return (
    <ChakraProvider theme={selectedTheme}>
      <KeychainProvider>
        <UserProvider>
          {children}
        </UserProvider>
      </KeychainProvider>
    </ChakraProvider>
  )
}
