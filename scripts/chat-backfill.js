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
    if (!(key in process.env)) process.env[key] = value;
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

  const messageCollection = mongoose.connection.collection('messages');
  // Repair first: a document with a leftover nested key fails Mongoose's
  // Map-of-Date cast entirely on load, so every OTHER backfill step below that
  // touches ChatUser via the model (not the raw driver) would silently see an
  // empty conversationSeen for these users otherwise.
  await repairNestedConversationKeys(chatUserCollection);
  // Order matters: floors first. A user with no read receipt has no lower bound
  // to measure against, so every historical mention counts as unread — if the
  // mentions land first, that burst is live for however long the rest of the
  // backfill takes. Stamping floors first makes the window empty instead.
  await backfillChannelReadFloor(chatUserCollection);
  await backfillMessageMentions(messageCollection);

  await mongoose.disconnect();
}

// Kept in sync with lib/chat/mentions.ts — this script is plain JS run outside
// the Next build, so it cannot import the TS module.
const MENTION_REGEX = /@[a-z0-9.-]+/gi;

function extractMentions(content) {
  if (!content) return [];
  const matches = content.match(MENTION_REGEX) || [];
  const out = new Set();
  for (const token of matches) {
    const name = token.replace(/^@/, '').trim().toLowerCase().replace(/[.-]+$/, '');
    if (name) out.add(name);
  }
  return Array.from(out);
}

/** Unread now reads `mentions` and `replyToSender` off each message instead of
 *  regex-scanning content at query time, so existing messages need those fields
 *  populated or no historical mention will ever badge. */
async function backfillMessageMentions(messages) {
  const cursor = messages.find(
    { mentions: { $exists: false } },
    { projection: { content: 1, replyTo: 1, target: 1 } }
  );

  let batch = [];
  let processed = 0;
  const flush = async () => {
    if (!batch.length) return;
    await messages.bulkWrite(batch, { ordered: false });
    processed += batch.length;
    batch = [];
  };

  while (await cursor.hasNext()) {
    const msg = await cursor.next();
    let replyToSender = null;
    if (msg.replyTo) {
      const parent = await messages.findOne({ _id: msg.replyTo }, { projection: { sender: 1 } });
      replyToSender = parent?.sender || null;
    }
    batch.push({
      updateOne: {
        filter: { _id: msg._id },
        update: { $set: { mentions: extractMentions(msg.content), replyToSender } },
      },
    });
    if (batch.length >= 500) await flush();
  }
  await flush();

  console.log('[chat-backfill] messages backfilled with mentions/replyToSender:', processed);
}

// Kept in sync with encodeConversationKey in lib/chat/conversations.ts.
const CONVERSATION_KEY_ESCAPES = { '~': '~7e', '.': '~2e', '$': '~24' };
function encodeConversationKey(id) {
  return id.replace(/[~.$]/g, (c) => CONVERSATION_KEY_ESCAPES[c]);
}

/** Depth-first walk of a nested map value, rebuilding the original dotted id
 *  one path segment at a time. A leaf is anything that isn't a plain object —
 *  a Date, an ISO string, or (for a stale typingAt entry) an empty object,
 *  which yields no leaves and is just discarded. */
function flattenNestedEntry(value, pathParts) {
  if (!value || typeof value !== 'object' || value instanceof Date) {
    return [{ id: pathParts.join('.'), value }];
  }
  const leaves = [];
  for (const [key, child] of Object.entries(value)) {
    leaves.push(...flattenNestedEntry(child, [...pathParts, key]));
  }
  return leaves;
}

/** Before either fix in this file's history existed, a raw (unescaped) write
 *  for a conversation id containing a dot — legal in a Hive username, e.g.
 *  rashed.ifte — split into a nested subdocument instead of one flat key:
 *  `dm:ksuccess:rashed.ifte` became `{ "dm:ksuccess:rashed": { ifte: <date> } }`.
 *  Mongoose's `Map of Date` schema fails to cast that ONE nested value, and
 *  that single bad key discards the ENTIRE map on load — every read receipt
 *  that user has, not just the broken one, silently disappears every time
 *  their document loads. Reconstructs each dotted id from its nested path,
 *  re-encodes it the correct way, and keeps whichever timestamp — the
 *  reconstructed one or an already-correct sibling, if one coexists — is
 *  newer, since a still-broken deploy could have kept writing the nested
 *  form after a correct one already existed. */
async function repairNestedConversationKeys(chatUsers) {
  const cursor = chatUsers.find({});
  let usersRepaired = 0;
  let keysRepaired = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const $set = {};
    const $unset = {};

    for (const field of ['conversationSeen', 'typingAt', 'memoNotifyAt']) {
      const map = doc[field];
      if (!map || typeof map !== 'object') continue;

      for (const [topKey, value] of Object.entries(map)) {
        if (!value || typeof value !== 'object' || value instanceof Date) continue; // already fine

        for (const leaf of flattenNestedEntry(value, [topKey])) {
          if (leaf.value === undefined) continue; // stale empty-object entry, nothing to keep
          const properKey = encodeConversationKey(leaf.id);
          const existing = map[properKey];
          const reconstructed = new Date(leaf.value);
          if (!existing || new Date(existing) < reconstructed) {
            $set[`${field}.${properKey}`] = reconstructed;
          }
        }
        $unset[`${field}.${topKey}`] = 1;
        keysRepaired++;
      }
    }

    if (Object.keys($set).length || Object.keys($unset).length) {
      const update = {};
      if (Object.keys($set).length) update.$set = $set;
      if (Object.keys($unset).length) update.$unset = $unset;
      await chatUsers.updateOne({ _id: doc._id }, update);
      usersRepaired += 1;
    }
  }

  console.log('[chat-backfill] nested-key corruption repaired — users:', usersRepaired, 'keys:', keysRepaired);
}

/** Every channel a user is in needs a read receipt to measure "new" against.
 *  Without one the whole backlog counts as unread the first time the new
 *  counter runs, so existing memberships are floored at now. */
async function backfillChannelReadFloor(chatUsers) {
  const cursor = chatUsers.find({}, { projection: { channels: 1, conversationSeen: 1 } });
  const now = new Date();
  let stamped = 0;
  let users = 0;

  while (await cursor.hasNext()) {
    const user = await cursor.next();
    const seen = user.conversationSeen || {};
    const missing = (user.channels || []).filter(id => !id.startsWith('dm:') && !seen[id]);
    if (!missing.length) continue;
    const $set = {};
    for (const id of missing) {
      if (id.includes('.') || id.includes('$')) continue; // unusable as a map key
      $set[`conversationSeen.${id}`] = now;
    }
    if (!Object.keys($set).length) continue;
    await chatUsers.updateOne({ _id: user._id }, { $set });
    stamped += Object.keys($set).length;
    users += 1;
  }

  console.log('[chat-backfill] channel read floors stamped:', stamped, 'across users:', users);
}

run().catch(async (err) => {
  console.error('[chat-backfill] failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});

