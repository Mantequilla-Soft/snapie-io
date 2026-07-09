import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPostCategory extends Document<string> {
  _id: string; // `${author}/${permlink}`
  categories: string[];
  sentiment?: string;
  sentimentScore?: number;
  primaryLanguage?: string;
  isNsfw?: boolean;
  // Freshness is checked at read time (see lib/discovery/postCategoryCache.ts)
  // rather than a Mongo TTL index — a hard TTL would delete the document
  // entirely once stale, which conflicts with falling back to a stale doc
  // when Combflow itself is unreachable.
  cachedAt: Date;
}

const PostCategorySchema = new Schema<IPostCategory>(
  {
    _id: { type: String, required: true },
    categories: { type: [String], default: [], index: true },
    sentiment: { type: String },
    sentimentScore: { type: Number },
    primaryLanguage: { type: String },
    isNsfw: { type: Boolean },
    cachedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export const PostCategory: Model<IPostCategory> =
  mongoose.models.PostCategory || mongoose.model<IPostCategory>('PostCategory', PostCategorySchema);
