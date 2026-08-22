import mongoose, { Schema, Document, Model } from 'mongoose';

/** Audit trail for mood badge purchases — separate from the idempotency gate
 *  (that's `MoodBadges.owned`, an unpriced set), same role `PointsPurchase`
 *  plays for real-money purchases: exists purely so "what did this balance
 *  change come from" has an answer, e.g. for the points transaction history
 *  feed (lib/points/transactionHistory.ts). Not needed for balance math. */
export interface IMoodBadgePurchase extends Document {
  username: string;
  sku: string;
  price: number;
  createdAt: Date;
}

const MoodBadgePurchaseSchema = new Schema<IMoodBadgePurchase>({
  username: { type: String, required: true, index: true },
  sku: { type: String, required: true },
  price: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Supports the transaction-history query (most recent purchases for a
// user) — same shape as RouletteSpin's history index.
MoodBadgePurchaseSchema.index({ username: 1, createdAt: -1 });

export const MoodBadgePurchase: Model<IMoodBadgePurchase> =
  mongoose.models.MoodBadgePurchase || mongoose.model<IMoodBadgePurchase>('MoodBadgePurchase', MoodBadgePurchaseSchema);
