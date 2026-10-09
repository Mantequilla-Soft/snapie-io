import { readFileSync } from 'fs';
import { join } from 'path';
import { Suspense } from 'react';
import { ColorModeScript } from '@chakra-ui/react';
import { Providers } from './providers';
import LayoutContent from './LayoutContent';
import type { Metadata } from 'next';

// In the document so the home feed does not wait on another stylesheet
// before first paint. The rules only reference Chakra theme variables.
const feedChromeCss = [
  readFileSync(join(process.cwd(), 'app/sidebarSlot.css'), 'utf8'),
  readFileSync(join(process.cwd(), 'components/homepage/feedChrome.css'), 'utf8'),
].join('\n');

export const metadata: Metadata = {
  metadataBase: new URL('https://snapie.io'),
  title: {
    default: 'Snapie',
    template: '%s | Snapie',
  },
  description: 'Decentralized social on Hive',
  openGraph: {
    title: 'Snapie',
    description: 'Decentralized social on Hive',
    siteName: 'Snapie',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    site: '@SnapieApp',
    title: 'Snapie',
    description: 'Decentralized social on Hive',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* aioha-modal.css (Tailwind v4 preflight) loads when the login modal
          opens, so it is not a render-blocking stylesheet on first paint. */}
      <body>
        <style dangerouslySetInnerHTML={{ __html: feedChromeCss }} />
        {/* Chakra color-mode script: sets the color-mode class on <html>
            synchronously before hydration so server + client render match. */}
        <ColorModeScript initialColorMode="dark" />
        <Providers>
          <Suspense fallback={null}>
            <LayoutContent>{children}</LayoutContent>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
