import type { Metadata } from 'next';
import { metadataForSlug } from '../../[...slug]/metadata';
import PostView from '../../[...slug]/views/PostView';

interface PageProps {
  params: Promise<{ username: string; permlink: string }>;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  return metadataForSlug([params.username, params.permlink]);
}

export default async function PostRoute(props: PageProps) {
  const params = await props.params;
  const username = decodeURIComponent(params.username);
  const permlink = decodeURIComponent(params.permlink);
  if (!username.startsWith('@')) return null;
  if (permlink === 'wallet' || permlink === 'notifications') return null;
  return <PostView author={username.substring(1)} permlink={permlink} />;
}
