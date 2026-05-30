const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

function loadEnvFile(fileName) {
  const fullPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(fullPath)) return;
  const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

async function run() {
  // Match Next.js-style local env precedence for this standalone script.
  loadEnvFile('.env.local');
  loadEnvFile('.env');

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'snapiechat';
  if (!uri) throw new Error('MONGODB_URI is required');
  await mongoose.connect(uri, { dbName });

  const channelCollection = mongoose.connection.collection('channels');
  const chatUserCollection = mongoose.connection.collection('chatusers');

  const channelRes = await channelCollection.updateMany(
    {},
    [
      {
        $set: {
          conversationKind: { $ifNull: ['$conversationKind', 'channel'] },
          members: { $ifNull: ['$members', []] },
          owner: { $ifNull: ['$owner', '$createdBy'] },
        },
      },
    ]
  );

  const userRes = await chatUserCollection.updateMany(
    {},
    [
      {
        $set: {
          blockedUsers: { $ifNull: ['$blockedUsers', []] },
          conversationSeen: { $ifNull: ['$conversationSeen', {}] },
          memoNotifyAt: { $ifNull: ['$memoNotifyAt', {}] },
        },
      },
    ]
  );

  console.log('[chat-backfill] channels matched/modified:', channelRes.matchedCount, channelRes.modifiedCount);
  console.log('[chat-backfill] users matched/modified:', userRes.matchedCount, userRes.modifiedCount);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('[chat-backfill] failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});

