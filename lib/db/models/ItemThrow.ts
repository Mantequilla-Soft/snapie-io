import mongoose, { Schema, Document, Model } from 'mongoose';

export type ItemThrowTargetType = 'post' | 'snap';

/** The Pile's display record — one row per item thrown at a post/Snap.
 *  `unitId` is unique: it's the idempotency gate that stops the same
 *  ItemUnit from being thrown twice, mirroring how `MoodBadges.owned`'s
 *  uniqueness gates a badge purchase. */
export interface IItemThrow extends Document {
  itemId: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  throwerUsername: string;
  targetAuthor: string;
  targetPermlink: string;
  targetType: ItemThrowTargetType;
  /** True when the thrower paid the anonymous-throw fee (marketService.ts's
   *  throwItem). throwerUsername is ALWAYS stored, even when true — this
   *  only controls whether the public Pile API redacts it; moderation still
   *  needs the real identity on file. */
  anonymous: boolean;
  createdAt: Date;
}

const ItemThrowSchema = new Schema<IItemThrow>({
  itemId: { type: Schema.Types.ObjectId, required: true, index: true, ref: 'Item' },
  unitId: { type: Schema.Types.ObjectId, required: true, ref: 'ItemUnit' },
  throwerUsername: { type: String, required: true },
  targetAuthor: { type: String, required: true },
  targetPermlink: { type: String, required: true },
  targetType: { type: String, required: true, enum: ['post', 'snap'] },
  anonymous: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

ItemThrowSchema.index({ unitId: 1 }, { unique: true });
// Serves the Pile: grouped-by-item counts and the raw throwers list for one target.
ItemThrowSchema.index({ targetAuthor: 1, targetPermlink: 1, createdAt: -1 });

export const ItemThrow: Model<IItemThrow> =
  mongoose.models.ItemThrow || mongoose.model<IItemThrow>('ItemThrow', ItemThrowSchema);
