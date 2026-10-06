import WalletView from '../../[...slug]/views/WalletView';

interface PageProps {
  params: { username: string };
}

export default function WalletRoute({ params }: PageProps) {
  const username = decodeURIComponent(params.username);
  if (!username.startsWith('@')) return null;
  return <WalletView username={username.substring(1)} />;
}
