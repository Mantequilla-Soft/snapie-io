import { connectDB } from '@/lib/db/mongodb';
import { UserInterests } from '@/lib/db/models/UserInterests';
import { isNewHiveAccount } from '@/lib/discovery/newAccountCheck';

export interface InterestsState {
  interestTags: string[];
  interestsOnboardedAt: Date | null;
  isNewAccount: boolean;
}

export async function getInterestsState(username: string): Promise<InterestsState> {
  await connectDB();
  const [doc, isNewAccount] = await Promise.all([
    UserInterests.findById(username).lean(),
    isNewHiveAccount(username),
  ]);

  return {
    interestTags: doc?.interestTags ?? [],
    interestsOnboardedAt: doc?.interestsOnboardedAt ?? null,
    isNewAccount,
  };
}

export async function saveInterests(username: string, interestTags: string[]): Promise<void> {
  await connectDB();
  await UserInterests.findByIdAndUpdate(
    username,
    { $set: { interestTags, interestsOnboardedAt: new Date() } },
    { upsert: true },
  );
}
