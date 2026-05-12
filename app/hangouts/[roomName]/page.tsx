'use client';
import { useParams } from 'next/navigation';
import HangoutsLobbyView from '@/components/hangouts/HangoutsLobbyView';

export default function HangoutsDeepLinkPage() {
  const params = useParams<{ roomName: string }>();
  const roomName = typeof params?.roomName === 'string' ? params.roomName : undefined;
  return <HangoutsLobbyView roomName={roomName} />;
}
