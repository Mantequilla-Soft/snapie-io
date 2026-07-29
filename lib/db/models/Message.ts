import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IMessage extends Document {
  _id: Types.ObjectId;
  type: 'channel' | 'dm';
  target: string;
  sender: string;
  content: string;
  replyTo?: Types.ObjectId | null;
  editedAt?: Date | null;
  createdAt: Date;
  /** Usernames mentioned in `content`, extracted at write time. Denormalized so
   *  unread can be an indexed query — a channel only counts as unread when it
   *  mentions you (see lib/chat/unread.ts). */
  mentions: string[];
  /** Sender of the message this one replies to, copied at write time so "someone
   *  replied to me" is a field match rather than a per-message $lookup. */
  replyToSender?: string | null;
}

const MessageSchema = new Schema<IMessage>(
  {
    type: { type: String, enum: ['channel', 'dm'], required: true },
    target: { type: String, required: true },
    sender: { type: String, required: true },
    content: { type: String, required: true, maxlength: 2000 },
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    editedAt: { type: Date, default: null },
    mentions: { type: [String], default: [] },
    replyToSender: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound index for efficient paginated channel fetch (newest first)
MessageSchema.index({ target: 1, _id: -1 });
// Unread counts scan by conversation over a "since I last read it" window.
MessageSchema.index({ target: 1, createdAt: -1 });
// Narrows the channel-unread scan to messages that can possibly notify someone.
MessageSchema.index({ mentions: 1, createdAt: -1 });
MessageSchema.index({ replyToSender: 1, createdAt: -1 });

export const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
