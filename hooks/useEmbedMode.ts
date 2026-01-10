'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface EmbedModeOptions {
  embed: boolean;
  theme?: 'dark' | 'light';
  bgColor?: string;
  textColor?: string;
}

export function useEmbedMode(): EmbedModeOptions {
  const searchParams = useSearchParams();
  const [embedOptions, setEmbedOptions] = useState<EmbedModeOptions>({
    embed: false,
  });

  useEffect(() => {
    const isEmbed = searchParams.get('embed') === 'true';
    const theme = searchParams.get('theme') as 'dark' | 'light' | null;
    const bgColor = searchParams.get('bgColor');
    const textColor = searchParams.get('textColor');

    setEmbedOptions({
      embed: isEmbed,
      theme: theme || undefined,
      bgColor: bgColor ? decodeURIComponent(bgColor) : undefined,
      textColor: textColor ? decodeURIComponent(textColor) : undefined,
    });

    // Add embed-mode class to body when embed mode is active
    if (isEmbed) {
      document.body.classList.add('embed-mode');
      
      // Apply theme colors if provided
      if (bgColor) {
        document.body.style.backgroundColor = decodeURIComponent(bgColor);
      }
      if (textColor) {
        document.body.style.color = decodeURIComponent(textColor);
      }
      if (theme) {
        document.body.classList.add(`theme-${theme}`);
      }

      // Send message to parent frame when loaded
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'snapie-loaded' }, '*');
      }
    } else {
      document.body.classList.remove('embed-mode');
      document.body.classList.remove('theme-dark', 'theme-light');
      document.body.style.backgroundColor = '';
      document.body.style.color = '';
    }
  }, [searchParams]);

  return embedOptions;
}
