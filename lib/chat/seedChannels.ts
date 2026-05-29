import { Channel } from '@/lib/db/models/Channel';

export async function seedDefaultChannels(): Promise<void> {
  await Channel.findOneAndUpdate(
    { _id: 'general' },
    {
      $setOnInsert: {
        name: 'General',
        description: 'Welcome to Snapie chat!',
        type: 'community',
        isPublic: true,
        createdBy: 'system',
        memberCount: 0,
      },
    },
    { upsert: true }
  );
}
