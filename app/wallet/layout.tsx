import type { Metadata } from 'next';

// A per-user shortcut, not content: keep it out of search results but let
// crawlers follow the links on it.
export const metadata: Metadata = {
  title: 'Wallet',
  description: 'Your Hive wallet on Snapie.',
  robots: { index: false, follow: true },
};

export default function WalletShortcutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
