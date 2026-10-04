import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChatUser extends Document<string> {
  _id: string; // Hive username, or `~<butrauth userId>` for a warm-up user
  fcmTokens: string[];
  channels: string[];
  mutedUsers: string[];
  blockedUsers: string[];
  lastSeen: Date;
  conversationSeen: Map<string, Date>;
  memoNotifyAt: Map<string, Date>;
  typingAt: Map<string, Date>;
  /** Shown instead of the id: the warm-up handle for a `~` identity. */
  displayName?: string | null;
  /** The ButrAuth user behind this id, when they signed in through ButrAuth. */
  butrauthUserId?: string | null;
  /** Set on a warm-up identity once its conversations moved to the Hive
   *  account it graduated to. Nobody signs in as it again. */
  mergedInto?: string | null;
  mergedAt?: Date | null;
}

const ChatUserSchema = new Schema<IChatUser>(
  {
    _id: { type: String, required: true },
    fcmTokens: { type: [String], default: [] },
    channels: { type: [String], default: [] },
    mutedUsers: { type: [String], default: [] },
    blockedUsers: { type: [String], default: [] },
    lastSeen: { type: Date, default: Date.now },
    conversationSeen: { type: Map, of: Date, default: {} },
    memoNotifyAt: { type: Map, of: Date, default: {} },
    typingAt: { type: Map, of: Date, default: {} },
    displayName: { type: String, default: null },
    butrauthUserId: { type: String, default: null },
    mergedInto: { type: String, default: null },
    mergedAt: { type: Date, default: null },
  },
  { timestamps: false }
);

export const ChatUser: Model<IChatUser> =
  mongoose.models.ChatUser || mongoose.model<IChatUser>('ChatUser', ChatUserSchema);
