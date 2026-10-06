import HomePage from '@/components/homepage/HomePage';
import { getInitialPublicSnapPage } from '@/lib/hive/publicSnapFeed';

// Short window: the public first page is shared by every logged-out visitor.
// Logged-in mutes and following still load on the client.
export const revalidate = 30;

export default async function Page() {
  // Blended "Latest" is a different source (the sidecar). When that flag is
  // on, leave the feed client-side so we don't paint a snaps-only page the
  // client immediately replaces.
  const blended = process.env.NEXT_PUBLIC_ENABLE_BLENDED_FEED === 'true';
  const initialSnapPage = blended ? null : await getInitialPublicSnapPage();
  return <HomePage initialSnapPage={initialSnapPage} />;
}
