import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPointsAccount extends Document<string> {
  _id: string; // Hive username
  /** Spendable balance. In Stage 1 (earn-only) this equals lifetimeEarned;
   *  spending later decrements only this. */
  balance: number;
  /** Total ever earned — never decremented. Basis for the "most active"
   *  leaderboard so spending doesn't demote you. */
  lifetimeEarned: number;
  updatedAt: Date;
}

const PointsAccountSchema = new Schema<IPointsAccount>(
  {
    _id: { type: String, required: true },
    balance: { type: Number, default: 0 },
    lifetimeEarned: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Ranks the leaderboard by all-time earnings (see getLeaderboard).
PointsAccountSchema.index({ lifetimeEarned: -1 });

export const PointsAccount: Model<IPointsAccount> =
  mongoose.models.PointsAccount || mongoose.model<IPointsAccount>('PointsAccount', PointsAccountSchema);
