import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChallenge extends Document {
  nonce: string;
  username: string;
  createdAt: Date;
}

const ChallengeSchema = new Schema<IChallenge>(
  {
    nonce: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 }, // 5-min TTL
  }
);

export const Challenge: Model<IChallenge> =
  mongoose.models.Challenge || mongoose.model<IChallenge>('Challenge', ChallengeSchema);
