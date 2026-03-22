import { Suspense } from 'react';
import { Providers } from './providers';
import LayoutContent from './LayoutContent';
import type { Metadata } from 'next';

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
    title: 'Snapie',
    description: 'Decentralized social on Hive',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Suspense fallback={null}>
            <LayoutContent>{children}</LayoutContent>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
