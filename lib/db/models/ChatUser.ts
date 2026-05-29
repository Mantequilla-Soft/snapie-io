import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChatUser extends Document<string> {
  _id: string; // Hive username
  fcmTokens: string[];
  channels: string[];
  mutedUsers: string[];
  lastSeen: Date;
}

const ChatUserSchema = new Schema<IChatUser>(
  {
    _id: { type: String, required: true },
    fcmTokens: { type: [String], default: [] },
    channels: { type: [String], default: [] },
    mutedUsers: { type: [String], default: [] },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export const ChatUser: Model<IChatUser> =
  mongoose.models.ChatUser || mongoose.model<IChatUser>('ChatUser', ChatUserSchema);
