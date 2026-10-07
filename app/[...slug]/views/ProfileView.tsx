import ProfilePage from '@/components/profile/ProfilePage';
import { loadProfileSeed } from '@/lib/hive/profileSeed';

export default async function ProfileView({ username }: { username: string }) {
  const seed = await loadProfileSeed(username);
  return (
    <ProfilePage
      username={username}
      initialAccount={seed?.account ?? null}
      initialProfile={seed?.profile ?? null}
    />
  );
}
