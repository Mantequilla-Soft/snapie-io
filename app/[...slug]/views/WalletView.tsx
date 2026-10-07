import WalletPage from '@/components/wallet/WalletPage';

export default function WalletView({ username }: { username: string }) {
  return <WalletPage username={username} />;
}
