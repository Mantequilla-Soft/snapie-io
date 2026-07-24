import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUserInterests extends Document<string> {
  _id: string; // Hive username
  interestTags: string[];
  interestsOnboardedAt: Date | null;
}

const UserInterestsSchema = new Schema<IUserInterests>(
  {
    _id: { type: String, required: true },
    interestTags: { type: [String], default: [] },
    interestsOnboardedAt: { type: Date, default: null },
  },
  { timestamps: false },
);

export const UserInterests: Model<IUserInterests> =
  mongoose.models.UserInterests || mongoose.model<IUserInterests>('UserInterests', UserInterestsSchema);
