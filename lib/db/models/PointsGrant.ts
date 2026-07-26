import mongoose, { Schema, Document, Model } from 'mongoose';

/** Audit trail for admin-granted points ("points cannon"), separate from
 *  PointsLedger (which alone is sufficient for balance math) — same split
 *  as PointsPurchase. Exists so "show me every comp an admin has handed
 *  out" doesn't require filtering the general ledger by actionType. */
export interface IPointsGrant extends Document {
  username: string;
  /** Admin's Hive username — who authorized this grant. */
  grantedBy: string;
  points: number;
  /** Optional free-text note, e.g. "apology for the mood-badge bug". */
  reason?: string;
  /** Client-generated idempotency key — also PointsLedger's refKey for this
   *  grant, so the two records line up 1:1. */
  refKey: string;
  createdAt: Date;
}

const PointsGrantSchema = new Schema<IPointsGrant>({
  username: { type: String, required: true, index: true },
  grantedBy: { type: String, required: true },
  points: { type: Number, required: true },
  reason: { type: String },
  refKey: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// A given grant (identified by its client-generated idempotency key) is
// credited at most once.
PointsGrantSchema.index({ refKey: 1 }, { unique: true });

export const PointsGrant: Model<IPointsGrant> =
  mongoose.models.PointsGrant || mongoose.model<IPointsGrant>('PointsGrant', PointsGrantSchema);
