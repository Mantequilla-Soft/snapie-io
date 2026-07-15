import mongoose, { Schema, Document, Model } from 'mongoose';
import { PointsActionType, POINTS_ACTION_TYPES } from '@/lib/points/constants';

export interface IPointsLedger extends Document {
  username: string;
  actionType: PointsActionType;
  points: number;
  /** `${targetAuthor}/${targetPermlink}` — the thing the action was about. */
  refKey: string;
  createdAt: Date;
}

const PointsLedgerSchema = new Schema<IPointsLedger>({
  username: { type: String, required: true, index: true },
  actionType: { type: String, required: true, enum: POINTS_ACTION_TYPES },
  points: { type: Number, required: true },
  refKey: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Idempotency: a given user earns for a given action on a given target exactly
// once. A duplicate insert throws E11000 — that's the "already awarded" signal.
PointsLedgerSchema.index({ username: 1, actionType: 1, refKey: 1 }, { unique: true });
// Supports the per-UTC-day cap count.
PointsLedgerSchema.index({ username: 1, actionType: 1, createdAt: 1 });

export const PointsLedger: Model<IPointsLedger> =
  mongoose.models.PointsLedger || mongoose.model<IPointsLedger>('PointsLedger', PointsLedgerSchema);
