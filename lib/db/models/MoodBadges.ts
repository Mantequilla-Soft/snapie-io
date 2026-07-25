import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMoodBadges extends Document<string> {
  _id: string; // Hive username
  owned: string[]; // skus owned, e.g. ['bull']
  equipped: string | null; // currently-displayed sku, or none
}

const MoodBadgesSchema = new Schema<IMoodBadges>(
  {
    _id: { type: String, required: true },
    owned: { type: [String], default: [] },
    equipped: { type: String, default: null },
  },
  { timestamps: false },
);

export const MoodBadges: Model<IMoodBadges> =
  mongoose.models.MoodBadges || mongoose.model<IMoodBadges>('MoodBadges', MoodBadgesSchema);
