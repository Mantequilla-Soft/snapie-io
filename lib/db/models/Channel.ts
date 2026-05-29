import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChannel extends Document<string> {
  _id: string;
  name: string;
  description?: string;
  type: 'community' | 'livestream' | 'hangout' | 'custom';
  createdBy: string;
  memberCount: number;
  isPublic: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema = new Schema<IChannel>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    type: { type: String, enum: ['community', 'livestream', 'hangout', 'custom'], default: 'community' },
    createdBy: { type: String, required: true },
    memberCount: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export const Channel: Model<IChannel> =
  mongoose.models.Channel || mongoose.model<IChannel>('Channel', ChannelSchema);
