import NotificationsView from '../../[...slug]/views/NotificationsView';

interface PageProps {
  params: Promise<{ username: string }>;
}

export default async function NotificationsRoute(props: PageProps) {
  const params = await props.params;
  const username = decodeURIComponent(params.username);
  if (!username.startsWith('@')) return null;
  return <NotificationsView username={username.substring(1)} />;
}
