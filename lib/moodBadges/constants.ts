export type MoodBadgeSku = 'bull' | 'bear';

export const MOOD_BADGE_SKUS: MoodBadgeSku[] = ['bull', 'bear'];

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
};

export function isMoodBadgeSku(value: unknown): value is MoodBadgeSku {
  return typeof value === 'string' && (MOOD_BADGE_SKUS as string[]).includes(value);
}
