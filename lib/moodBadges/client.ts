'use client';
import { authenticatedFetch, POINTS_SPENT_EVENT, PointsSpentDetail } from '@/lib/points/client';
import { notifyMoodBadgeChanged } from '@/hooks/useMoodBadges';
import { MoodBadgeSku, MOOD_BADGES } from '@/lib/moodBadges/constants';
import { BuyBadgeStatus } from '@/lib/moodBadges/service';

export interface BuyBadgeClientResult {
  status: BuyBadgeStatus;
  owned: string[];
  equipped: string | null;
  balance: number;
}

export async function buyMoodBadge(username: string, sku: MoodBadgeSku): Promise<BuyBadgeClientResult> {
  const res = await authenticatedFetch(username, '/api/mood-badges/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku }),
  });
  if (!res) throw new Error('Could not start a session to complete this purchase. Please try again.');
  if (!res.ok) throw new Error('Could not complete this purchase. Please try again.');

  const data = (await res.json()) as BuyBadgeClientResult;
  if (data.status === 'purchased') {
    window.dispatchEvent(
      new CustomEvent<PointsSpentDetail>(POINTS_SPENT_EVENT, {
        detail: { spent: MOOD_BADGES[sku].price, balance: data.balance },
      }),
    );
    notifyMoodBadgeChanged();
  }
  return data;
}

export interface EquipBadgeClientResult {
  status: 'equipped' | 'not_owned';
  equipped: string | null;
}

export async function equipMoodBadge(username: string, sku: MoodBadgeSku | null): Promise<EquipBadgeClientResult> {
  const res = await authenticatedFetch(username, '/api/mood-badges/equip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku }),
  });
  if (!res) throw new Error('Could not start a session to update your badge. Please try again.');
  if (!res.ok) throw new Error('Could not update your badge. Please try again.');

  const data = (await res.json()) as EquipBadgeClientResult;
  if (data.status === 'equipped') notifyMoodBadgeChanged();
  return data;
}

export interface MyMoodBadges {
  owned: string[];
  equipped: string | null;
}

export async function getMyMoodBadges(username: string): Promise<MyMoodBadges> {
  const res = await authenticatedFetch(username, '/api/mood-badges/mine', { method: 'GET' }, { silent: true });
  if (!res || !res.ok) return { owned: [], equipped: null };
  return (await res.json()) as MyMoodBadges;
}
