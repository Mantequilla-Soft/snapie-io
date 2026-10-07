import type { Metadata } from 'next';
import { metadataForSlug } from '../../[...slug]/metadata';
import PostView from '../../[...slug]/views/PostView';

interface PageProps {
  params: { username: string; permlink: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return metadataForSlug([params.username, params.permlink]);
}

export default function PostRoute({ params }: PageProps) {
  const username = decodeURIComponent(params.username);
  const permlink = decodeURIComponent(params.permlink);
  if (!username.startsWith('@')) return null;
  if (permlink === 'wallet' || permlink === 'notifications') return null;
  return <PostView author={username.substring(1)} permlink={permlink} />;
}
