import mongoose, { Schema, Document, Model } from 'mongoose';
import { RouletteMultiplier } from '@/lib/points/rouletteConfig';

export interface IRouletteSpin extends Document {
  username: string;
  /** Client-generated UUID. Together with `username`, this is the
   *  idempotency gate — see rouletteService.spinRoulette. */
  spinId: string;
  stake: number;
  multiplier: RouletteMultiplier;
  /** stake * multiplier. 0 on a loss. */
  payout: number;
  /** The raw 0-9999 integer the outcome was derived from (see
   *  ROULETTE_ODDS_BP) — kept for the RTP audit described in the roadmap
   *  spec, not needed for balance math. */
  serverRoll: number;
  createdAt: Date;
}

const RouletteSpinSchema = new Schema<IRouletteSpin>({
  username: { type: String, required: true, index: true },
  spinId: { type: String, required: true },
  stake: { type: Number, required: true },
  multiplier: { type: Number, required: true, enum: [0, 2, 3, 5] },
  payout: { type: Number, required: true },
  serverRoll: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Idempotency: a given spinId is claimed by a given user exactly once. A
// duplicate insert throws E11000 — that's the "already spun" signal.
RouletteSpinSchema.index({ username: 1, spinId: 1 }, { unique: true });
// Supports the spin-cooldown lookup (most recent spin for a user) without a
// full collection scan.
RouletteSpinSchema.index({ username: 1, createdAt: -1 });

export const RouletteSpin: Model<IRouletteSpin> =
  mongoose.models.RouletteSpin || mongoose.model<IRouletteSpin>('RouletteSpin', RouletteSpinSchema);
