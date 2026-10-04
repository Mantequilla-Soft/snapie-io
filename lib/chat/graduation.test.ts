import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Channel } from '@/lib/db/models/Channel';
import { Message } from '@/lib/db/models/Message';
import { mergeWarmupIdentity, currentChatId } from '@/lib/chat/graduation';
import { conversationSeenAt, createDmConversationId } from '@/lib/chat/conversations';

// Runs against a real Mongo, because the merge IS a set of Mongo updates and a
// mock would only test that we called them. Skipped unless one is provided:
//   docker run -d --rm -p 127.0.0.1:47099:27017 mongo:7
//   CHAT_TEST_MONGO_URI=mongodb://127.0.0.1:47099/chattest pnpm vitest run lib/chat/graduation.test.ts
const URI = process.env.CHAT_TEST_MONGO_URI;

const OLD = '~6abac678918cf1caeeb19ecc';
const NEW = 'newbie';

describe.skipIf(!URI)('mergeWarmupIdentity (real Mongo)', () => {
  beforeAll(async () => { await mongoose.connect(URI!); });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    await Promise.all([ChatUser.deleteMany({}), Channel.deleteMany({}), Message.deleteMany({})]);
  });

  async function seed() {
    const dm = createDmConversationId(OLD, 'threespeak');
    const seen = new Date('2026-10-01T10:00:00Z');
    await ChatUser.create({ _id: OLD, channels: [dm, 'general'], conversationSeen: {}, mutedUsers: ['spammer'], fcmTokens: ['fcm1'] });
    await ChatUser.updateOne({ _id: OLD }, { $set: { [`conversationSeen.${dm.replace(/~/g, '~7e')}`]: seen } });
    await ChatUser.create({ _id: 'threespeak', channels: [dm] });
    await ChatUser.updateOne({ _id: 'threespeak' }, { $set: { [`conversationSeen.${dm.replace(/~/g, '~7e')}`]: seen } });
    await ChatUser.create({ _id: 'grumpy', blockedUsers: [OLD] });
    await Channel.create({ _id: 'general', name: 'General', createdBy: 'x', members: ['x', OLD], memberCount: 2 });
    await Message.create({ type: 'dm', target: dm, sender: 'threespeak', content: 'your video is black' });
    const mine = await Message.create({ type: 'dm', target: dm, sender: OLD, content: 'oops, fixed' });
    await Message.create({ type: 'channel', target: 'general', sender: 'x', content: 'hi', replyTo: mine._id, replyToSender: OLD });
    return { dm, seen };
  }

  it('moves DMs, channels, messages, receipts and blocks onto the Hive name', async () => {
    const { dm, seen } = await seed();
    const res = await mergeWarmupIdentity(OLD, NEW);
    expect(res).toEqual({ merged: true, conversations: 2 });

    const newDm = createDmConversationId(NEW, 'threespeak');
    expect(await Message.countDocuments({ target: dm })).toBe(0);
    expect(await Message.countDocuments({ target: newDm })).toBe(2);
    expect(await Message.countDocuments({ sender: OLD })).toBe(0);
    expect(await Message.countDocuments({ replyToSender: OLD })).toBe(0);

    const peer = await ChatUser.findById('threespeak');
    expect(peer!.channels).toEqual([newDm]);
    expect(conversationSeenAt(peer, newDm)?.toISOString()).toBe(seen.toISOString());
    expect(conversationSeenAt(peer, dm)).toBeNull();

    const me = await ChatUser.findById(NEW);
    expect(me!.channels.sort()).toEqual([newDm, 'general'].sort());
    expect(conversationSeenAt(me, newDm)?.toISOString()).toBe(seen.toISOString());
    expect(me!.mutedUsers).toEqual(['spammer']);
    expect(me!.fcmTokens).toEqual(['fcm1']);

    expect((await ChatUser.findById('grumpy'))!.blockedUsers).toEqual([NEW]);
    expect((await Channel.findById('general'))!.members).toEqual(['x', NEW]);

    const old = await ChatUser.findById(OLD);
    expect(old!.mergedInto).toBe(NEW);
    expect(old!.channels).toEqual([]);
    expect(await currentChatId(OLD)).toBe(NEW);
  });

  it('does not duplicate a channel member who had already joined as the Hive account', async () => {
    await seed();
    await Channel.updateOne({ _id: 'general' }, { $push: { members: NEW }, $inc: { memberCount: 1 } });
    await mergeWarmupIdentity(OLD, NEW);
    const ch = await Channel.findById('general');
    expect(ch!.members).toEqual(['x', NEW]);
    expect(ch!.memberCount).toBe(2);
  });

  it('is a no-op the second time, and for ids that are not warm-up ids', async () => {
    await seed();
    await mergeWarmupIdentity(OLD, NEW);
    expect(await mergeWarmupIdentity(OLD, NEW)).toEqual({ merged: false, conversations: 0 });
    expect(await mergeWarmupIdentity('alice', NEW)).toEqual({ merged: false, conversations: 0 });
    expect(await mergeWarmupIdentity('~nobody', NEW)).toEqual({ merged: false, conversations: 0 });
  });
});
