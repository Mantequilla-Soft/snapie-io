import NotificationsView from '../../[...slug]/views/NotificationsView';

interface PageProps {
  params: { username: string };
}

export default function NotificationsRoute({ params }: PageProps) {
  const username = decodeURIComponent(params.username);
  if (!username.startsWith('@')) return null;
  return <NotificationsView username={username.substring(1)} />;
}
