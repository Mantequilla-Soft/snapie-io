import WalletView from '../../[...slug]/views/WalletView';

interface PageProps {
  params: Promise<{ username: string }>;
}

export default async function WalletRoute(props: PageProps) {
  const params = await props.params;
  const username = decodeURIComponent(params.username);
  if (!username.startsWith('@')) return null;
  return <WalletView username={username.substring(1)} />;
}
