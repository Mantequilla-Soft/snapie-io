import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IMessage extends Document {
  _id: Types.ObjectId;
  type: 'channel' | 'dm';
  target: string;
  sender: string;
  content: string;
  replyTo?: Types.ObjectId | null;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    type: { type: String, enum: ['channel', 'dm'], required: true },
    target: { type: String, required: true },
    sender: { type: String, required: true },
    content: { type: String, required: true, maxlength: 2000 },
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound index for efficient paginated channel fetch (newest first)
MessageSchema.index({ target: 1, _id: -1 });

export const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
