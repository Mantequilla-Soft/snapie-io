import type { Metadata } from 'next';
import { metadataForSlug } from '../[...slug]/metadata';
import ProfileView from '../[...slug]/views/ProfileView';

interface PageProps {
  params: { username: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return metadataForSlug([params.username]);
}

export default function ProfileRoute({ params }: PageProps) {
  const username = decodeURIComponent(params.username);
  if (!username.startsWith('@')) return null;
  return <ProfileView username={username.substring(1)} />;
}
