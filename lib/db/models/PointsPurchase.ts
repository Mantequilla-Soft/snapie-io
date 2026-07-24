import mongoose, { Schema, Document, Model } from 'mongoose';

/** Audit trail for real-money points purchases, separate from PointsLedger
 *  (which alone is sufficient for balance math). Exists so "show me every
 *  real-money purchase" for support/accounting doesn't require filtering the
 *  general ledger by actionType. */
export interface IPointsPurchase extends Document {
  username: string;
  /** The verified on-chain transfer's transaction id — also PointsLedger's
   *  refKey for this purchase, so the two records line up 1:1. */
  txid: string;
  hbdAmount: number;
  pointsCredited: number;
  createdAt: Date;
}

const PointsPurchaseSchema = new Schema<IPointsPurchase>({
  username: { type: String, required: true, index: true },
  txid: { type: String, required: true },
  hbdAmount: { type: Number, required: true },
  pointsCredited: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// A given on-chain transfer is credited at most once.
PointsPurchaseSchema.index({ txid: 1 }, { unique: true });

export const PointsPurchase: Model<IPointsPurchase> =
  mongoose.models.PointsPurchase || mongoose.model<IPointsPurchase>('PointsPurchase', PointsPurchaseSchema);
