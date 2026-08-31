import mongoose, { Schema, Document, Model } from 'mongoose';

export type ItemUnitStatus = 'owned' | 'thrown';

/** One document per purchased unit of an Item — not a count field, because a
 *  throw needs to atomically claim ONE specific unit (so it can't be thrown
 *  twice) and ItemThrow needs a real unit identity for "who threw what".
 *  Thrown units are kept, not deleted, as purchase/throw history. */
export interface IItemUnit extends Document {
  itemId: mongoose.Types.ObjectId;
  ownerUsername: string;
  status: ItemUnitStatus;
  acquiredAt: Date;
  thrownAt: Date | null;
  /** Client-supplied purchase idempotency key (a UUID minted per buy
   *  attempt) — its uniqueness IS the claim-then-charge guard for buyItem,
   *  the same role a spinId/sku plays for Roulette/Mood Badges. Also ties
   *  the unit back to the buyer's PointsLedger 'item_purchase' row. */
  purchaseRefKey: string;
}

const ItemUnitSchema = new Schema<IItemUnit>({
  itemId: { type: Schema.Types.ObjectId, required: true, index: true, ref: 'Item' },
  ownerUsername: { type: String, required: true, index: true },
  status: { type: String, required: true, enum: ['owned', 'thrown'], default: 'owned', index: true },
  acquiredAt: { type: Date, default: Date.now },
  thrownAt: { type: Date, default: null },
  purchaseRefKey: { type: String, required: true },
});

// Serves "my inventory" (owned units grouped by item).
ItemUnitSchema.index({ ownerUsername: 1, status: 1, itemId: 1 });
// The idempotency gate for buyItem — see purchaseRefKey doc comment above.
ItemUnitSchema.index({ purchaseRefKey: 1 }, { unique: true });

export const ItemUnit: Model<IItemUnit> =
  mongoose.models.ItemUnit || mongoose.model<IItemUnit>('ItemUnit', ItemUnitSchema);
