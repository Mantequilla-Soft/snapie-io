export type MoodBadgeSku = 'bull' | 'bear' | 'excited' | 'sleepy' | 'salty' | 'grouchy' | 'caffeinated' | 'amused';

export const MOOD_BADGE_SKUS: MoodBadgeSku[] = ['bull', 'bear', 'excited', 'sleepy', 'salty', 'grouchy', 'caffeinated', 'amused'];

export interface MoodBadgeCatalogItem {
  label: string;
  price: number;
  imageSrc: string;
  /** How this mood reads in "@username is feeling ___" tooltip copy. */
  feeling: string;
}

export const MOOD_BADGES: Record<MoodBadgeSku, MoodBadgeCatalogItem> = {
  bull: { label: 'Bull', price: 500, imageSrc: '/badges/bull.png', feeling: 'bullish' },
  bear: { label: 'Bear', price: 500, imageSrc: '/badges/bear.png', feeling: 'bearish' },
  excited: { label: 'Excited', price: 500, imageSrc: '/badges/excited.png', feeling: 'excited' },
  sleepy: { label: 'Sleepy', price: 500, imageSrc: '/badges/sleepy.png', feeling: 'sleepy' },
  salty: { label: 'Salty', price: 500, imageSrc: '/badges/salty.png', feeling: 'salty' },
  grouchy: { label: 'Grouchy', price: 500, imageSrc: '/badges/grouchy.png', feeling: 'grouchy' },
  caffeinated: { label: 'Caffeinated', price: 500, imageSrc: '/badges/caffeinated.png', feeling: 'caffeinated' },
  amused: { label: 'Amused', price: 500, imageSrc: '/badges/amused.png', feeling: 'amused' },
};

export function isMoodBadgeSku(value: unknown): value is MoodBadgeSku {
  return typeof value === 'string' && (MOOD_BADGE_SKUS as string[]).includes(value);
}
