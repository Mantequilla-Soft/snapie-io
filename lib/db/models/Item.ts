import mongoose, { Schema, Document, Model } from 'mongoose';
import { ITEM_MIN_PRICE } from '@/lib/points/marketConfig';

export type ItemStatus = 'pending' | 'approved' | 'rejected';

/** A catalog entry in the Snapie Points item market ("The Pile") — a silly,
 *  user-created (Phase 1) or admin-seeded (Phase 0) thing that can be bought
 *  with points and thrown at a post or Snap. A sale pays the creator a share
 *  of the price — see marketService.buyItem for the transactional split. */
export interface IItem extends Document {
  creatorUsername: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  status: ItemStatus;
  createdAt: Date;
  approvedAt: Date | null;
  approvedBy: string | null;
  /** Denormalized total units ever sold — bumped alongside the balance
   *  charge in buyItem (a display counter, not money, so it doesn't need
   *  the same transactional guarantee). Powers "Hot" sort without an
   *  aggregation over ItemUnit on every catalog request. */
  purchaseCount: number;
}

const ItemSchema = new Schema<IItem>({
  creatorUsername: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, required: true, trim: true, maxlength: 280 },
  imageUrl: { type: String, required: true },
  price: { type: Number, required: true, min: ITEM_MIN_PRICE },
  status: { type: String, required: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: String, default: null },
  purchaseCount: { type: Number, default: 0 },
});

// Serves the public catalog listing: New sort (newest first) and Hot sort
// (best-selling first), both scoped to approved items.
ItemSchema.index({ status: 1, createdAt: -1 });
ItemSchema.index({ status: 1, purchaseCount: -1 });

export const Item: Model<IItem> = mongoose.models.Item || mongoose.model<IItem>('Item', ItemSchema);
