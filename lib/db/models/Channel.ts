import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChannel extends Document<string> {
  _id: string;
  name: string;
  description?: string;
  type: 'community' | 'livestream' | 'hangout' | 'custom' | 'group';
  conversationKind: 'channel' | 'group';
  createdBy: string;
  owner?: string;
  members: string[];
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
    type: { type: String, enum: ['community', 'livestream', 'hangout', 'custom', 'group'], default: 'community' },
    conversationKind: { type: String, enum: ['channel', 'group'], default: 'channel', index: true },
    createdBy: { type: String, required: true },
    owner: { type: String },
    members: { type: [String], default: [] },
    memberCount: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

ChannelSchema.index({ conversationKind: 1, isPublic: 1 });
ChannelSchema.index({ members: 1 });

export const Channel: Model<IChannel> =
  mongoose.models.Channel || mongoose.model<IChannel>('Channel', ChannelSchema);
