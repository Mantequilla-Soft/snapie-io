import mongoose, { Schema, type Model } from 'mongoose';

const PlayerSchema = new Schema(
  {
    playerId: { type: String, required: true },
    username: { type: String, default: null },
    isGuest: { type: Boolean, required: true },
    hp: { type: Number, required: true },
    linesSent: { type: Number, required: true },
    alive: { type: Boolean, required: true },
    lastSeenAt: { type: Date, required: true },
    lastAttackAt: { type: Date, default: null },
  },
  { _id: false },
);

const GarbageSchema = new Schema(
  {
    id: { type: String, required: true },
    toPlayerId: { type: String, required: true },
    lines: { type: Number, required: true },
  },
  { _id: false },
);

const BlocksMatchSchema = new Schema(
  {
    status: { type: String, enum: ['waiting', 'active', 'finished', 'expired'], required: true },
    queuePlayerId: { type: String, default: null },
    players: { type: [PlayerSchema], required: true },
    garbage: { type: [GarbageSchema], default: [] },
    seenAttackIds: { type: [String], default: [] },
    winnerId: { type: String, default: null },
    winReason: { type: String, default: null },
    pointsAwarded: { type: Number, default: 0 },
    awardStatus: { type: String, default: null },
    startedAt: { type: Date, default: null },
    updatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'blocks_matches', timestamps: { createdAt: true, updatedAt: false } },
);

// One open queue ticket per player. Active and finished docs are outside the filter.
BlocksMatchSchema.index(
  { queuePlayerId: 1 },
  { unique: true, partialFilterExpression: { status: 'waiting' } },
);
BlocksMatchSchema.index({ status: 1, createdAt: 1 });
BlocksMatchSchema.index({ status: 1, 'players.playerId': 1 });
BlocksMatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export interface BlocksMatchMongo {
  _id: mongoose.Types.ObjectId;
  status: 'waiting' | 'active' | 'finished' | 'expired';
  queuePlayerId: string | null;
  players: Array<{
    playerId: string;
    username: string | null;
    isGuest: boolean;
    hp: number;
    linesSent: number;
    alive: boolean;
    lastSeenAt: Date;
    lastAttackAt: Date | null;
  }>;
  garbage: Array<{ id: string; toPlayerId: string; lines: number }>;
  seenAttackIds: string[];
  winnerId: string | null;
  winReason: 'ko' | 'forfeit' | 'disconnect' | null;
  pointsAwarded: number;
  awardStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  expiresAt: Date;
}

export const BlocksMatch: Model<BlocksMatchMongo> =
  (mongoose.models.BlocksMatch as Model<BlocksMatchMongo> | undefined) ||
  mongoose.model<BlocksMatchMongo>('BlocksMatch', BlocksMatchSchema);
