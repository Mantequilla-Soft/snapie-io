import NotificationsComp from '@/components/notifications/NotificationsComp';

export default function NotificationsView({ username }: { username: string }) {
  return <NotificationsComp username={username} />;
}
