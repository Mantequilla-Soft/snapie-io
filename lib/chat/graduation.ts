import { ChatUser } from '@/lib/db/models/ChatUser';
import { Channel } from '@/lib/db/models/Channel';
import { Message } from '@/lib/db/models/Message';
import {
  createDmConversationId,
  conversationKeyPath,
  conversationSeenAt,
  getDmPeer,
  parseDmConversationId,
} from '@/lib/chat/conversations';
import { isWarmupChatId } from '@/lib/chat/butrauth';

/**
 * Move a warm-up identity's chat history onto the Hive account it became.
 *
 * A warm-up user chats as `~<userId>` (see lib/chat/butrauth.ts). Graduating
 * gives them a Hive name, and without this their next sign-in would be a
 * stranger to everybody they had been talking to: same person, empty inbox.
 * Triggered by the first ButrAuth sign-in whose token carries both the userId
 * and the new Hive name, which is the only moment we hold proof the two are
 * the same person.
 *
 * Every step is keyed by the old id and lands on a deterministic new id, so a
 * run that dies halfway is finished by simply running it again. `mergedInto`
 * is written LAST for that reason: it is what stops a rerun, so it must not
 * exist until everything it vouches for has happened.
 */
export async function mergeWarmupIdentity(
  oldId: string,
  newId: string
): Promise<{ merged: boolean; conversations: number }> {
  if (!isWarmupChatId(oldId) || isWarmupChatId(newId) || oldId === newId) {
    return { merged: false, conversations: 0 };
  }
  const old = await ChatUser.findById(oldId);
  if (!old || old.mergedInto) return { merged: false, conversations: 0 };

  await ChatUser.updateOne({ _id: newId }, { $setOnInsert: { _id: newId } }, { upsert: true });

  let moved = 0;
  for (const convId of old.channels || []) {
    if (parseDmConversationId(convId)) {
      const peer = getDmPeer(convId, oldId);
      if (!peer || peer === newId) continue; // a DM with their own future self
      const newConv = createDmConversationId(newId, peer);
      await Message.updateMany({ target: convId }, { $set: { target: newConv } });

      // The peer keeps their place in the conversation: same list entry under
      // its new id, and the same read receipt, so it does not reappear unread.
      const peerUser = await ChatUser.findById(peer);
      const peerSeen = conversationSeenAt(peerUser, convId);
      await ChatUser.updateOne({ _id: peer }, { $addToSet: { channels: newConv } });
      await ChatUser.updateOne(
        { _id: peer },
        {
          $pull: { channels: convId },
          $unset: {
            [conversationKeyPath('conversationSeen', convId)]: '',
            [conversationKeyPath('memoNotifyAt', convId)]: '',
            [conversationKeyPath('typingAt', convId)]: '',
          },
          ...(peerSeen ? { $max: { [conversationKeyPath('conversationSeen', newConv)]: peerSeen } } : {}),
        }
      );
      await adoptConversation(newId, newConv, conversationSeenAt(old, convId));
    } else {
      // Channel or group: swap the member in place, without a duplicate when
      // the Hive account had already joined on its own.
      const ch = await Channel.findById(convId);
      if (ch) {
        const already = (ch.members || []).includes(newId);
        await Channel.updateOne(
          { _id: convId },
          already
            ? { $pull: { members: oldId }, $inc: { memberCount: -1 } }
            : { $set: { members: (ch.members || []).map((m: string) => (m === oldId ? newId : m)) } }
        );
        await Channel.updateOne({ _id: convId, owner: oldId }, { $set: { owner: newId } });
        await Channel.updateOne({ _id: convId, createdBy: oldId }, { $set: { createdBy: newId } });
      }
      await adoptConversation(newId, convId, conversationSeenAt(old, convId));
    }
    moved++;
  }

  // Their own messages, everywhere, and replies that point at them.
  await Message.updateMany({ sender: oldId }, { $set: { sender: newId } });
  await Message.updateMany({ replyToSender: oldId }, { $set: { replyToSender: newId } });

  // Somebody who muted or blocked the warm-up identity has muted or blocked the
  // person, and graduating must not be a way out of that.
  for (const field of ['mutedUsers', 'blockedUsers'] as const) {
    await ChatUser.updateMany({ [field]: oldId }, { $addToSet: { [field]: newId } });
    await ChatUser.updateMany({ [field]: oldId }, { $pull: { [field]: oldId } });
  }
  await ChatUser.updateOne(
    { _id: newId },
    {
      $addToSet: {
        mutedUsers: { $each: old.mutedUsers || [] },
        blockedUsers: { $each: old.blockedUsers || [] },
        fcmTokens: { $each: old.fcmTokens || [] },
      },
    }
  );

  await ChatUser.updateOne(
    { _id: oldId },
    { $set: { mergedInto: newId, mergedAt: new Date(), channels: [], fcmTokens: [] } }
  );
  return { merged: true, conversations: moved };
}

async function adoptConversation(userId: string, convId: string, seen: Date | null): Promise<void> {
  await ChatUser.updateOne(
    { _id: userId },
    {
      $addToSet: { channels: convId },
      ...(seen ? { $max: { [conversationKeyPath('conversationSeen', convId)]: seen } } : {}),
    }
  );
}

/** Where a chat id lives now: itself, or the account a warm-up id merged into. */
export async function currentChatId(id: string): Promise<string> {
  if (!isWarmupChatId(id)) return id;
  const u = await ChatUser.findById(id, { mergedInto: 1 }).lean<{ mergedInto?: string | null }>();
  return u?.mergedInto || id;
}
