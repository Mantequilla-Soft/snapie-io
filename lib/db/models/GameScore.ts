import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGameScore extends Document {
  username: string;
  gameId: string;
  sessionId: string;
  score: number;
  stage: number;
  stagesCleared: number;
  won: boolean;
  durationMs: number;
  clientEndedAt: Date;
  pointsAwarded: number;
  createdAt: Date;
}

const GameScoreSchema = new Schema<IGameScore>({
  username: { type: String, required: true, index: true },
  gameId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true },
  score: { type: Number, required: true },
  stage: { type: Number, required: true },
  stagesCleared: { type: Number, required: true },
  won: { type: Boolean, required: true },
  durationMs: { type: Number, required: true },
  clientEndedAt: { type: Date, required: true },
  pointsAwarded: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Idempotency: a given sessionId is claimed by a given user for a given game
// exactly once. A duplicate insert throws E11000 — that's the "already saved" signal.
GameScoreSchema.index({ username: 1, gameId: 1, sessionId: 1 }, { unique: true });
// Supports per-game leaderboard queries.
GameScoreSchema.index({ gameId: 1, score: -1 });
// Supports per-player history and the daily-cap sum query.
GameScoreSchema.index({ username: 1, gameId: 1, createdAt: -1 });

export const GameScore: Model<IGameScore> =
  mongoose.models.GameScore || mongoose.model<IGameScore>('GameScore', GameScoreSchema);
