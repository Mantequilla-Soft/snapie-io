import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG = 'hive-180932';
  process.env.NEXT_PUBLIC_HIVE_USER = 'snapie';
  process.env.NEXT_PUBLIC_3SPEAK_API_KEY = 'speak-key';
  process.env.NEXT_PUBLIC_IMAGE_SERVER_API_KEY = 'image-key';
  return {
    hiveCall: vi.fn(),
    databaseCall: vi.fn(),
    broadcastOps: vi.fn(),
    voteWithAioha: vi.fn(),
    transferWithAioha: vi.fn(),
    customJsonWithAioha: vi.fn(),
    commentWithAioha: vi.fn(),
    signMessageWithAioha: vi.fn(),
    ensureAioha: vi.fn(),
    getAioha: vi.fn(),
    isSnapieMode: vi.fn(() => false),
    emitNeedsWallet: vi.fn(),
    powerUp: vi.fn(),
    powerDown: vi.fn(),
    delegate: vi.fn(),
    transferToSavings: vi.fn(),
    transferFromSavings: vi.fn(),
    convertHbd: vi.fn(),
    collateralizedConvert: vi.fn(),
    limitOrderCreate: vi.fn(),
    limitOrderCancel: vi.fn(),
    broadcastOp: vi.fn(),
    witnessVote: vi.fn(),
  };
});

vi.mock('./hiveclient', () => ({
  default: {
    call: (...args: unknown[]) => env.hiveCall(...args),
    database: { call: (...args: unknown[]) => env.databaseCall(...args) },
  },
}));

vi.mock('./aioha', async () => {
  const enums = await vi.importActual<typeof import('@aioha/aioha')>('@aioha/aioha');
  return {
    KeyTypes: enums.KeyTypes,
    Providers: enums.Providers,
    broadcastOps: (...args: unknown[]) => env.broadcastOps(...args),
    voteWithAioha: (...args: unknown[]) => env.voteWithAioha(...args),
    transferWithAioha: (...args: unknown[]) => env.transferWithAioha(...args),
    customJsonWithAioha: (...args: unknown[]) => env.customJsonWithAioha(...args),
    commentWithAioha: (...args: unknown[]) => env.commentWithAioha(...args),
    signMessageWithAioha: (...args: unknown[]) => env.signMessageWithAioha(...args),
    ensureAioha: (...args: unknown[]) => env.ensureAioha(...args),
    getAioha: () => env.getAioha(),
  };
});

vi.mock('@/lib/hive/signing', () => ({
  isSnapieMode: () => env.isSnapieMode(),
  emitNeedsWallet: (...args: unknown[]) => env.emitNeedsWallet(...args),
}));

vi.mock('@/lib/snapie-auth/client', () => ({
  powerUp: (...args: unknown[]) => env.powerUp(...args),
  powerDown: (...args: unknown[]) => env.powerDown(...args),
  delegate: (...args: unknown[]) => env.delegate(...args),
  transferToSavings: (...args: unknown[]) => env.transferToSavings(...args),
  transferFromSavings: (...args: unknown[]) => env.transferFromSavings(...args),
  convertHbd: (...args: unknown[]) => env.convertHbd(...args),
  collateralizedConvert: (...args: unknown[]) => env.collateralizedConvert(...args),
  limitOrderCreate: (...args: unknown[]) => env.limitOrderCreate(...args),
  limitOrderCancel: (...args: unknown[]) => env.limitOrderCancel(...args),
  broadcastOp: (...args: unknown[]) => env.broadcastOp(...args),
  witnessVote: (...args: unknown[]) => env.witnessVote(...args),
}));

import { Providers } from '@aioha/aioha';
import {
  broadcastWithKeychain,
  changeFollow,
  checkAccountName,
  checkCommunitySubscription,
  checkFollow,
  claimHbdSavingsInterest,
  claimRewardsWithKeychain,
  commentWithKeychain,
  communitySubscribeKeyChain,
  convertVestToHive,
  delegateWithKeychain,
  fetchNewNotifications,
  findFeedPosts,
  findLastNotificationsReset,
  findPosts,
  getAccountPosts,
  getCommunityInfo,
  getCommunityMutedAccounts,
  getCommunityRole,
  getCryptoPrices,
  getFollowing,
  getFollowers,
  getHiveHbdMarketQuote,
  getHiveHbdTicker,
  getLastSnapsContainer,
  getPost,
  getProfile,
  getRebloggedBy,
  getRelationshipBetweenAccounts,
  getReputation,
  getSimilarPosts,
  getTransactionHistory,
  getUserSubscribedCommunities,
  powerDownWithKeychain,
  powerUpWithKeychain,
  reblogPost,
  searchPosts,
  setCommunityRole,
  setCommunitySubscription,
  setUserRelationship,
  signAndBroadcastWithKeychain,
  swapHiveHbdWithSlippage,
  transferWithKeychain,
  updateProfile,
  uploadAudioTo3Speak,
  uploadImage,
  uploadImageWithKeychain,
  vote,
  witnessVoteWithKeychain,
} from './client-functions';

const GLOBAL = {
  total_vesting_fund_hive: '1000.000 HIVE',
  total_vesting_shares: '2000.000000 VESTS',
  time: '2026-10-06T00:00:00',
};

type XhrScript = {
  status?: number;
  statusText?: string;
  responseText?: string;
  error?: boolean;
  progress?: { loaded: number; total: number; lengthComputable: boolean };
};

let xhrScript: XhrScript = { status: 200, responseText: '{"success":true,"url":"https://cdn.example/a.jpg"}' };
let readerMode: 'ok' | 'empty' | 'error' = 'ok';
let wallet: { loggedIn: boolean; provider: string } = { loggedIn: true, provider: 'keychain' };

class FakeXHR {
  status = 0;
  statusText = '';
  responseText = '';
  upload = { onprogress: null as ((event: XhrScript['progress']) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  send() {
    const script = xhrScript;
    queueMicrotask(() => {
      if (script.progress) this.upload.onprogress?.(script.progress);
      if (script.error) {
        this.onerror?.();
        return;
      }
      this.status = script.status ?? 200;
      this.statusText = script.statusText ?? 'OK';
      this.responseText = script.responseText ?? '';
      this.onload?.();
    });
  }
}

class FakeFileReader {
  result: ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    queueMicrotask(() => {
      if (readerMode === 'error') {
        this.onerror?.();
        return;
      }
      if (readerMode === 'empty') {
        this.result = null;
        this.onload?.();
        return;
      }
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onload?.();
      });
    });
  }
}

function file() {
  return new File([new Uint8Array([1, 2, 3, 4])], 'pic.png', { type: 'image/png' });
}

function hiveAmount(amount: string, nai = '@@000000021', precision = 3) {
  return { amount, precision, nai };
}

function historyRow(index: number, type: string, value: Record<string, unknown>) {
  return [index, {
    op: { type: `${type}_operation`, value },
    timestamp: '2026-10-06T00:00:00',
    trx_id: `tx-${index}`,
  }];
}

beforeEach(() => {
  vi.clearAllMocks();
  env.isSnapieMode.mockReturnValue(false);
  env.broadcastOps.mockResolvedValue({ result: 'broadcast' });
  env.voteWithAioha.mockResolvedValue({ result: 'voted' });
  env.transferWithAioha.mockResolvedValue({ result: 'sent' });
  env.customJsonWithAioha.mockResolvedValue({ result: 'json' });
  env.commentWithAioha.mockResolvedValue({ result: 'comment', publicKey: 'STM' });
  env.signMessageWithAioha.mockResolvedValue({ result: 'SIG' });
  env.ensureAioha.mockImplementation(async () => ({
    isLoggedIn: () => wallet.loggedIn,
    getCurrentProvider: () => wallet.provider,
  }));
  env.getAioha.mockImplementation(() => ({
    isLoggedIn: () => wallet.loggedIn,
    getCurrentProvider: () => wallet.provider,
  }));
  wallet = { loggedIn: true, provider: 'keychain' };
  xhrScript = { status: 200, responseText: '{"success":true,"url":"https://cdn.example/a.jpg"}' };
  readerMode = 'ok';
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  vi.stubGlobal('FileReader', FakeFileReader);
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  env.hiveCall.mockImplementation(async (_api: string, method: string) => {
    if (method === 'get_dynamic_global_properties') return GLOBAL;
    if (method === 'get_ticker') return { latest: '1.500', highest_bid: '1.400', lowest_ask: '1.600' };
    return {};
  });
  env.databaseCall.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe('reputation, votes, comments, and transfers', () => {
  it('maps raw reputation onto the displayed score', () => {
    expect(getReputation(0)).toBe(25);
    expect(getReputation(74_394_090_000_000)).toBeGreaterThan(25);
  });

  it('votes and comments through aioha, including a failed vote and a reply', async () => {
    await expect(vote({ username: 'alice', author: 'bob', permlink: 'hi', weight: 10000 })).resolves.toEqual({
      success: true,
      result: 'voted',
    });
    env.voteWithAioha.mockRejectedValueOnce(new Error('no'));
    await expect(vote({ username: 'alice', author: 'bob', permlink: 'hi', weight: 1 })).resolves.toEqual({
      success: false,
      error: 'no',
    });
    env.voteWithAioha.mockRejectedValueOnce('nope');
    await expect(vote({ username: 'alice', author: 'bob', permlink: 'hi', weight: 1 })).resolves.toMatchObject({
      success: false,
      error: 'Vote failed',
    });

    const posted = await commentWithKeychain({
      data: {
        parent_username: '',
        parent_perm: 'hive-180932',
        permlink: 'hello',
        title: 'Hello',
        body: 'body',
        json_metadata: { app: 'snapie' },
      },
    });
    expect(posted?.success).toBe(true);
    const replied = await commentWithKeychain({
      data: {
        parent_username: 'bob',
        parent_perm: 'hi',
        permlink: 're',
        body: 're',
        json_metadata: '{"app":"snapie"}',
      },
    });
    expect(replied?.success).toBe(true);
    env.commentWithAioha.mockRejectedValueOnce({ message: 'declined' });
    await expect(commentWithKeychain({ data: {} })).resolves.toMatchObject({ success: false, error: 'declined' });
  });

  it('broadcasts and transfers, and reports a transfer failure', async () => {
    await expect(signAndBroadcastWithKeychain('alice', [['vote', {}]], 'active')).resolves.toMatchObject({ success: true });
    await expect(transferWithKeychain('alice', 'bob', '1.000', 'hi', 'HIVE')).resolves.toEqual({ result: 'sent' });
    env.transferWithAioha.mockRejectedValueOnce(new Error('no'));
    await expect(transferWithKeychain('alice', 'bob', '1', '', 'HIVE')).resolves.toBeUndefined();
  });
});

describe('wallet operations', () => {
  it('powers up, powers down, and delegates with the wallet', async () => {
    await expect(powerUpWithKeychain('alice', 1.5)).resolves.toMatchObject({ success: true });
    await expect(powerDownWithKeychain('alice', 2)).resolves.toMatchObject({ success: true });
    await expect(delegateWithKeychain('alice', 'bob', 3)).resolves.toMatchObject({ success: true });
    env.broadcastOps.mockRejectedValueOnce(new Error('declined'));
    await expect(powerUpWithKeychain('alice', 1)).resolves.toMatchObject({ success: false, error: 'declined' });
  });

  it('routes the same operations through snapie auth, including a wallet prompt', async () => {
    env.isSnapieMode.mockReturnValue(true);
    const dispatch = vi.fn();
    (globalThis as unknown as { window: { dispatchEvent: typeof dispatch } }).window = { dispatchEvent: dispatch };
    env.powerUp.mockResolvedValueOnce({ txId: 'p', emancipationRequired: true });
    await expect(powerUpWithKeychain('alice', 1)).resolves.toMatchObject({ txId: 'p' });
    expect(dispatch).toHaveBeenCalled();

    env.powerDown.mockResolvedValueOnce({ needsClientSigning: true });
    await expect(powerDownWithKeychain('alice', 1)).rejects.toMatchObject({ code: 'needs_client_signing' });
    expect(env.emitNeedsWallet).toHaveBeenCalledWith('active');

    env.delegate.mockResolvedValueOnce({ txId: 'd' });
    await expect(delegateWithKeychain('alice', 'bob', 1)).resolves.toMatchObject({ txId: 'd' });

    env.witnessVote.mockResolvedValueOnce({ needsClientSigning: true });
    await expect(witnessVoteWithKeychain('alice', 'blocktrades', true)).rejects.toMatchObject({ code: 'needs_client_signing' });
    env.witnessVote.mockResolvedValueOnce({ txId: 'w', emancipationRequired: true });
    await expect(witnessVoteWithKeychain('alice', 'blocktrades', false)).resolves.toMatchObject({ success: true, result: 'w' });
  });

  it('claims rewards and dispatches every snapie broadcast op', async () => {
    await expect(claimRewardsWithKeychain('alice', '1.000 HIVE', '0.000 HBD', '0.000001 VESTS')).resolves.toMatchObject({ success: true });
    await expect(claimHbdSavingsInterest('alice')).resolves.toMatchObject({ success: true });
    await expect(witnessVoteWithKeychain('alice', 'blocktrades')).resolves.toMatchObject({ success: true });

    env.isSnapieMode.mockReturnValue(true);
    const snapieBroadcast = {
      transferToSavings: env.transferToSavings,
      transferFromSavings: env.transferFromSavings,
      convertHbd: env.convertHbd,
      collateralizedConvert: env.collateralizedConvert,
      limitOrderCreate: env.limitOrderCreate,
      limitOrderCancel: env.limitOrderCancel,
      broadcastOp: env.broadcastOp,
    };
    const ops: Array<[string, Record<string, unknown>, keyof typeof snapieBroadcast]> = [
      ['transfer_to_savings', { amount: '1.000 HBD', to: 'bob', memo: 'm' }, 'transferToSavings'],
      ['transfer_from_savings', { amount: '1.000 HBD', request_id: 4 }, 'transferFromSavings'],
      ['convert', { amount: '1.000 HBD', requestid: 2 }, 'convertHbd'],
      ['convert', { amount: { amount: '2.5' }, requestid: 3 }, 'convertHbd'],
      ['collateralized_convert', { amount: '1.000 HIVE', requestid: 1 }, 'collateralizedConvert'],
      ['limit_order_create', { amount_to_sell: '1.000 HIVE', min_to_receive: '1.000 HBD', fill_or_kill: true, orderid: 9 }, 'limitOrderCreate'],
      ['limit_order_cancel', { orderId: 9 }, 'limitOrderCancel'],
      ['custom', { foo: 1 }, 'broadcastOp'],
    ];
    for (const [name, body, fn] of ops) {
      snapieBroadcast[fn].mockResolvedValueOnce({ txId: name });
      await expect(broadcastWithKeychain('alice', [[name, body]])).resolves.toEqual({ success: true, result: name });
    }
    env.transferToSavings.mockResolvedValueOnce({ needsClientSigning: true });
    await expect(broadcastWithKeychain('alice', [['transfer_to_savings', { amount: '1.000 HBD' }]])).rejects.toMatchObject({
      code: 'needs_client_signing',
    });
    env.broadcastOps.mockRejectedValueOnce(new Error('no'));
    env.isSnapieMode.mockReturnValue(false);
    await expect(broadcastWithKeychain('alice', [])).resolves.toMatchObject({ success: false, error: 'no' });
  });

  it('updates a profile', async () => {
    await expect(updateProfile('alice', 'Alice', 'about', 'here', 'cover', 'avatar', 'https://alice.example')).resolves.toEqual({ success: true });
    env.broadcastOps.mockRejectedValueOnce('nope');
    await expect(updateProfile('alice', '', '', '', '', '', '')).resolves.toEqual({ success: false, error: 'nope' });
  });
});

describe('social and community rpc helpers', () => {
  it('checks subscriptions, roles, follows, and account names', async () => {
    env.hiveCall.mockImplementation(async (_api: string, method: string) => {
      if (method === 'list_all_subscriptions') return [['hive-180932', 'Snapie']];
      if (method === 'list_community_roles') return [['alice', 'mod', ''], ['bob', 'muted', '']];
      if (method === 'get_relationship_between_accounts') return { follows: true };
      if (method === 'lookup_accounts') return ['alice'];
      return {};
    });
    await expect(checkCommunitySubscription('alice')).resolves.toBe(true);
    await expect(getCommunityRole('hive-180932', 'alice')).resolves.toBe('mod');
    await expect(getCommunityRole('hive-180932', 'nobody')).resolves.toBeNull();
    await expect(checkFollow('alice', 'bob')).resolves.toBe(true);
    await expect(checkAccountName('alice')).resolves.toBe('alice');
    await communitySubscribeKeyChain('alice');
    await changeFollow('alice', 'bob');
    expect(env.customJsonWithAioha).toHaveBeenCalled();

    env.hiveCall.mockRejectedValue(new Error('down'));
    await expect(checkCommunitySubscription('alice')).resolves.toBe(false);
    await expect(getCommunityRole('hive-180932', 'alice')).resolves.toBeNull();
    await expect(checkFollow('alice', 'bob')).resolves.toBe(false);
    await expect(checkAccountName('alice')).resolves.toBeUndefined();
    env.customJsonWithAioha.mockRejectedValueOnce(new Error('no'));
    await expect(communitySubscribeKeyChain('alice')).resolves.toBeUndefined();
    env.hiveCall.mockResolvedValue({ follows: false });
    env.customJsonWithAioha.mockRejectedValueOnce(new Error('no'));
    await expect(changeFollow('alice', 'bob')).resolves.toBeUndefined();
  });

  it('lists muted accounts, relationships, followers, and communities', async () => {
    env.hiveCall.mockImplementation(async (_api: string, method: string) => {
      if (method === 'list_community_roles') return [['bob', 'muted'], ['alice', 'admin']];
      if (method === 'get_relationship_between_accounts') return { follows: true, ignores: false, blacklists: true };
      if (method === 'list_all_subscriptions') return [['hive-1', 'One'], [null, 'skip']];
      if (method === 'get_community') return { name: 'hive-1' };
      if (method === 'get_profile') return { name: 'alice' };
      if (method === 'get_account_posts' || method === 'get_ranked_posts') return [{ author: 'alice' }];
      return {};
    });
    env.databaseCall.mockImplementation(async (method: string) => {
      if (method === 'get_reblogged_by') return ['carol'];
      if (method === 'get_following') return [{ following: 'bob' }, { following: '' }];
      if (method === 'get_followers') return [{ follower: 'carol' }];
      if (method === 'get_content') return { author: 'alice', permlink: 'hi' };
      if (method === 'get_discussions_by_author_before_date') return [{ permlink: 'snaps-2026' }];
      return [];
    });
    await expect(getCommunityMutedAccounts('hive-180932')).resolves.toEqual(['bob']);
    await expect(getRelationshipBetweenAccounts('alice', 'bob')).resolves.toEqual({
      follows: true, ignores: false, blacklists: true,
    });
    await expect(setUserRelationship('alice', 'bob', 'ignore')).resolves.toBe(true);
    await expect(setUserRelationship('alice', 'bob', '')).resolves.toBe(true);
    await expect(setUserRelationship('alice', 'bob', 'blacklist')).resolves.toBe(true);
    await expect(setUserRelationship('alice', 'bob', 'blog')).resolves.toBe(true);
    await expect(setCommunitySubscription('alice', 'hive-1', true)).resolves.toBe(true);
    await expect(setCommunitySubscription('alice', 'hive-1', false)).resolves.toBe(true);
    await expect(getFollowing('alice')).resolves.toEqual(['bob']);
    await expect(getFollowers('alice')).resolves.toEqual(['carol']);
    await expect(getRebloggedBy('alice', 'hi')).resolves.toEqual(['carol']);
    await expect(reblogPost('alice', 'bob', 'hi')).resolves.toEqual({ result: 'json' });
    await expect(setCommunityRole('hive-1', 'bob', 'muted')).resolves.toEqual({ result: 'json' });
    await expect(setCommunityRole('hive-1', 'bob', 'member')).resolves.toEqual({ result: 'json' });
    await expect(getUserSubscribedCommunities('alice')).resolves.toEqual([{ id: 'hive-1', title: 'One' }]);
    await expect(getCommunityInfo('hive-1')).resolves.toEqual({ name: 'hive-1' });
    await expect(getProfile('alice', 'bob')).resolves.toEqual({ name: 'alice' });
    await expect(getAccountPosts('alice', 10, 'bob', 'carol', 'last')).resolves.toEqual([{ author: 'alice' }]);
    await expect(getPost('alice', 'hi')).resolves.toMatchObject({ author: 'alice' });
    await expect(getLastSnapsContainer()).resolves.toEqual({ author: 'peak.snaps', permlink: 'snaps-2026' });
    await expect(findPosts('trending', { tag: 'hive', limit: 5 })).resolves.toEqual([{ author: 'alice' }]);
    await expect(findPosts('author_before_date', { author: 'alice' })).resolves.toEqual([{ permlink: 'snaps-2026' }]);
    await expect(findFeedPosts('alice', { limit: 2, start_author: 'bob', start_permlink: 'x' })).resolves.toEqual([{ author: 'alice' }]);

    env.hiveCall.mockRejectedValue(new Error('down'));
    env.databaseCall.mockRejectedValue(new Error('down'));
    env.customJsonWithAioha.mockRejectedValue(new Error('no'));
    await expect(getCommunityMutedAccounts('hive-1')).resolves.toEqual([]);
    await expect(getRelationshipBetweenAccounts('alice', 'bob')).resolves.toEqual({ follows: false, ignores: false, blacklists: false });
    await expect(setUserRelationship('alice', 'bob', 'blog')).resolves.toBe(false);
    await expect(setCommunitySubscription('alice', 'hive-1', true)).resolves.toBe(false);
    await expect(getFollowing('alice')).resolves.toEqual([]);
    await expect(getFollowers('alice')).resolves.toEqual([]);
    await expect(getRebloggedBy('alice', 'hi')).resolves.toEqual([]);
    await expect(getUserSubscribedCommunities('alice')).resolves.toEqual([]);
    env.hiveCall.mockResolvedValueOnce('nope');
    await expect(getCommunityRole('hive-1', 'alice')).resolves.toBeNull();
    env.databaseCall.mockResolvedValueOnce(null);
    await expect(getPost('alice', 'missing')).rejects.toThrow('Failed to fetch post content');
    env.databaseCall.mockResolvedValueOnce({ not: 'array' });
    await expect(getRebloggedBy('alice', 'hi')).resolves.toEqual([]);
  });
});

describe('notifications, prices, search, and swaps', () => {
  it('finds the last notifications reset and filters newer ones', async () => {
    let page = 0;
    env.hiveCall.mockImplementation(async (_api: string, method: string) => {
      if (method === 'account_notifications') {
        return [
          { date: '2026-10-02T00:00:00', msg: 'new' },
          { date: '2026-09-01T00:00:00', msg: 'old' },
        ];
      }
      if (method !== 'get_account_history') return {};
      page += 1;
      if (page === 1) {
        return { history: [[1, { op: { value: { id: 'other', json: '[]' } } }]] };
      }
      return {
        history: [[2, { op: { value: { id: 'notify', json: JSON.stringify(['notify', { date: '2026-10-01T00:00:00' }]) } } }]],
      };
    });
    await expect(findLastNotificationsReset('alice', -1, 5)).resolves.toBe('1970-01-01T00:00:00Z');
    await expect(findLastNotificationsReset('alice')).resolves.toBe('2026-10-01T00:00:00');
    env.hiveCall.mockImplementation(async (_api: string, method: string) => {
      if (method === 'get_account_history') return { history: [] };
      if (method === 'account_notifications') return [{ date: '2026-10-02T00:00:00' }];
      return {};
    });
    await expect(findLastNotificationsReset('alice')).resolves.toBe('1970-01-01T00:00:00Z');
    const fresh = await fetchNewNotifications('alice');
    expect(fresh).toEqual([{ date: '2026-10-02T00:00:00' }]);
    env.hiveCall.mockRejectedValue(new Error('down'));
    await expect(findLastNotificationsReset('alice')).resolves.toBe('1970-01-01T00:00:00Z');
    await expect(fetchNewNotifications('alice')).resolves.toEqual([]);
  });

  it('converts vests and reads profiles of the market', async () => {
    await expect(convertVestToHive(2)).resolves.toBe(1);
    await expect(getHiveHbdMarketQuote()).resolves.toEqual({ latest: 1.5, highestBid: 1.4, lowestAsk: 1.6 });
    await expect(getHiveHbdTicker()).resolves.toBe(1.5);
    env.hiveCall.mockImplementation(async (_api: string, method: string) => {
      if (method === 'get_ticker') return { latest: '0', highest_bid: '1', lowest_ask: '3' };
      return GLOBAL;
    });
    await expect(getHiveHbdTicker()).resolves.toBe(2);
    env.hiveCall.mockImplementation(async (_api: string, method: string) => {
      if (method === 'get_ticker') return {};
      return GLOBAL;
    });
    await expect(getHiveHbdTicker()).rejects.toThrow('Unable to fetch HIVE/HBD market price.');
    env.hiveCall.mockRejectedValue(new Error('down'));
    await expect(getHiveHbdTicker()).rejects.toThrow('Unable to fetch HIVE/HBD market price.');
  });

  it('searches, prices, and swaps in both directions', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ author: 'alice' }] } as Response);
    await expect(getSimilarPosts('alice', 'hi', 2)).resolves.toEqual([{ author: 'alice' }]);
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => [] } as Response);
    await expect(getSimilarPosts('alice', 'hi')).resolves.toEqual([]);
    await expect(searchPosts('  ')).resolves.toEqual([]);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ not: 'array' }) } as Response);
    await expect(searchPosts('hive', { limit: 5, observer: 'bob' })).resolves.toEqual([]);
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => [] } as Response);
    await expect(searchPosts('hive')).resolves.toEqual([]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hive: { usd: 0.3 }, hive_dollar: { usd: 1 } }),
    } as Response);
    await expect(getCryptoPrices()).resolves.toEqual({ hive: 0.3, hbd: 1 });
    fetchMock.mockRejectedValueOnce(new Error('down'));
    await expect(getCryptoPrices()).resolves.toEqual({ hive: 0, hbd: 0 });

    await expect(swapHiveHbdWithSlippage({ username: 'alice', direction: 'HIVE_TO_HBD', amount: 0, slippagePercent: 1 })).rejects.toThrow(/greater than zero/);
    await expect(swapHiveHbdWithSlippage({ username: 'alice', direction: 'HIVE_TO_HBD', amount: 1, slippagePercent: 21 })).rejects.toThrow(/Slippage/);
    const sold = await swapHiveHbdWithSlippage({ username: 'alice', direction: 'HIVE_TO_HBD', amount: 1, slippagePercent: 10 });
    expect(sold.success).toBe(true);
    const bought = await swapHiveHbdWithSlippage({ username: 'alice', direction: 'HBD_TO_HIVE', amount: 2, slippagePercent: 0 });
    expect(bought.success).toBe(true);
    env.hiveCall.mockImplementation(async (_api: string, method: string) => {
      if (method === 'get_ticker') return { latest: '0', highest_bid: '0', lowest_ask: '0' };
      if (method === 'get_dynamic_global_properties') return { time: 'not-a-time' };
      return {};
    });
    await expect(swapHiveHbdWithSlippage({ username: 'alice', direction: 'HIVE_TO_HBD', amount: 1, slippagePercent: 1 })).rejects.toThrow(/Market price/);
    env.hiveCall.mockImplementation(async (_api: string, method: string) => {
      if (method === 'get_ticker') return { latest: '1', highest_bid: '1', lowest_ask: '1' };
      if (method === 'get_dynamic_global_properties') return { time: 5 };
      return {};
    });
    await expect(swapHiveHbdWithSlippage({ username: 'alice', direction: 'HBD_TO_HIVE', amount: 1, slippagePercent: 1 })).rejects.toThrow(/head block time/);
  });
});

describe('uploads', () => {
  it('uploads audio to 3speak and reports configuration and http failures', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ permlink: 'p', cid: 'c', playUrl: 'http://play', apiUrl: 'http://api' }),
    } as Response);
    const blob = new Blob([new Uint8Array([1])], { type: 'audio/webm' });
    await expect(uploadAudioTo3Speak(blob, 3, 'alice')).resolves.toMatchObject({
      success: true,
      playUrl: 'https://play',
      apiUrl: 'https://api',
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('no body'); },
    } as unknown as Response);
    await expect(uploadAudioTo3Speak(new Blob([new Uint8Array([1])], { type: 'audio/mp4' }), 1, 'alice')).resolves.toMatchObject({
      success: false,
    });
    delete process.env.NEXT_PUBLIC_3SPEAK_API_KEY;
    await expect(uploadAudioTo3Speak(blob, 1, 'alice')).resolves.toMatchObject({ success: false, error: expect.stringContaining('API key') });
    process.env.NEXT_PUBLIC_3SPEAK_API_KEY = 'speak-key';
    fetchMock.mockRejectedValueOnce('down');
    await expect(uploadAudioTo3Speak(blob, 1, 'alice')).resolves.toMatchObject({ success: false, error: 'Unknown error' });
  });

  it('uploads a file, including progress and error responses', async () => {
    const progress: number[][] = [];
    xhrScript = {
      status: 200,
      responseText: '{"success":true,"url":"https://cdn.example/a.jpg","source":"3speak"}',
      progress: { loaded: 1, total: 2, lengthComputable: true },
    };
    await expect(uploadImage(file(), 'sig', 0, (update) => {
      if (typeof update === 'function') progress.push(update([0]));
    })).resolves.toBe('https://cdn.example/a.jpg');
    expect(progress[0][0]).toBe(50);

    xhrScript = { status: 500, statusText: 'bad', responseText: '{"error":"nope","message":"rejected"}' };
    await expect(uploadImage(file(), 'sig')).rejects.toThrow('rejected');
    xhrScript = { status: 500, statusText: 'bad', responseText: 'not-json' };
    await expect(uploadImage(file(), 'sig')).rejects.toThrow(/Upload failed/);
    xhrScript = { status: 200, responseText: '{"success":false}' };
    await expect(uploadImage(file(), 'sig')).rejects.toThrow('Invalid response');
    xhrScript = { status: 200, responseText: '{' };
    await expect(uploadImage(file(), 'sig')).rejects.toThrow('Invalid response format');
    xhrScript = { error: true };
    await expect(uploadImage(file(), 'sig')).rejects.toThrow('Network error');
  });

  it('uploads with the wallet, and falls back to 3speak for snapie and hiveauth', async () => {
    xhrScript = {
      status: 200,
      responseText: '{"success":true,"url":"https://images.hive.blog/x"}',
      progress: { loaded: 4, total: 4, lengthComputable: true },
    };
    const seen: number[] = [];
    await expect(uploadImageWithKeychain(file(), 'alice', {
      index: 1,
      onProgress: (value) => seen.push(value),
      setUploadProgress: (update) => {
        if (typeof update === 'function') update([0, 0]);
      },
    })).resolves.toBe('https://images.hive.blog/x');
    expect(seen).toEqual([100]);

    wallet.loggedIn = false;
    await expect(uploadImageWithKeychain(file(), 'alice')).rejects.toThrow('Not logged in');

    wallet = { loggedIn: true, provider: Providers.HiveAuth };
    xhrScript = { status: 201, responseText: '{"success":true,"url":"https://images.3speak.tv/a.jpg"}', progress: { loaded: 1, total: 4, lengthComputable: true } };
    await expect(uploadImageWithKeychain(file(), 'alice', {
      index: 0,
      setUploadProgress: (update) => {
        if (typeof update === 'function') update([0]);
      },
    })).resolves.toBe('https://images.3speak.tv/a.jpg');

    env.isSnapieMode.mockReturnValue(true);
    xhrScript = { status: 400, responseText: '{"error":"quota"}' };
    await expect(uploadImageWithKeychain(file(), 'alice')).rejects.toThrow('quota');
    xhrScript = { status: 500, responseText: 'nope' };
    await expect(uploadImageWithKeychain(file(), 'alice')).rejects.toThrow(/3Speak upload failed/);
    xhrScript = { status: 200, responseText: '{"success":false}' };
    await expect(uploadImageWithKeychain(file(), 'alice')).rejects.toThrow('Invalid response from 3Speak');
    xhrScript = { status: 200, responseText: '{' };
    await expect(uploadImageWithKeychain(file(), 'alice')).rejects.toThrow('Invalid response format');
    xhrScript = { error: true };
    await expect(uploadImageWithKeychain(file(), 'alice')).rejects.toThrow('Network error during 3Speak');
    delete process.env.NEXT_PUBLIC_IMAGE_SERVER_API_KEY;
    await expect(uploadImageWithKeychain(file(), 'alice')).rejects.toThrow(/IMAGE_SERVER_API_KEY/);
    process.env.NEXT_PUBLIC_IMAGE_SERVER_API_KEY = 'image-key';
  });
});

describe('getTransactionHistory', () => {
  it('normalises wallet operations and pages back toward genesis', async () => {
    const rows = [
      historyRow(50, 'transfer', { from: 'alice', to: 'bob', amount: hiveAmount('1500'), memo: 'hi' }),
      historyRow(49, 'recurrent_transfer', { from: 'a', to: 'b', amount: '1.000 HIVE', memo: '' }),
      historyRow(48, 'transfer_to_vesting', { from: 'alice', to: 'alice', amount: hiveAmount('1000') }),
      historyRow(47, 'withdraw_vesting', { account: 'alice', vesting_shares: hiveAmount('2000000', '@@000000037', 6) }),
      historyRow(46, 'fill_vesting_withdraw', { from_account: 'alice', to_account: 'alice', deposited: hiveAmount('500') }),
      historyRow(45, 'transfer_to_savings', { from: 'alice', to: 'alice', amount: hiveAmount('1000', '@@000000013'), memo: '' }),
      historyRow(44, 'transfer_from_savings', { from: 'alice', to: 'alice', amount: hiveAmount('1000') }),
      historyRow(43, 'fill_transfer_from_savings', { from: 'alice', to: 'alice', amount: hiveAmount('1000') }),
      historyRow(42, 'cancel_transfer_from_savings', { from: 'alice' }),
      historyRow(41, 'claim_reward_balance', {
        account: 'alice',
        reward_hive: hiveAmount('1000'),
        reward_hbd: hiveAmount('0', '@@000000013'),
        reward_vests: hiveAmount('2000000', '@@000000037', 6),
      }),
      historyRow(40, 'author_reward', {
        author: 'alice',
        permlink: 'hi',
        hbd_payout: hiveAmount('1000', '@@000000013'),
        hive_payout: hiveAmount('0'),
        vesting_payout: hiveAmount('0', '@@000000037', 6),
      }),
      historyRow(39, 'curation_reward', {
        curator: 'alice', author: 'bob', permlink: 'x', reward: hiveAmount('2000000', '@@000000037', 6),
      }),
      historyRow(38, 'interest', { owner: 'alice', interest: hiveAmount('100', '@@000000099') }),
      historyRow(37, 'delegate_vesting_shares', { delegator: 'alice', delegatee: 'bob', vesting_shares: hiveAmount('2000000', '@@000000037', 6) }),
      historyRow(36, 'fill_convert_request', { owner: 'alice', amount_out: hiveAmount('1000') }),
      historyRow(35, 'collateralized_convert', { owner: 'alice', amount: hiveAmount('1000', '@@000000013') }),
      historyRow(34, 'limit_order_create', {
        owner: 'alice', fill_or_kill: true, amount_to_sell: hiveAmount('1000'), min_to_receive: hiveAmount('1000', '@@000000013'),
      }),
      historyRow(33, 'limit_order_create2', {
        owner: 'alice',
        fill_or_kill: false,
        amount_to_sell: hiveAmount('1000'),
        exchange_rate: { base: hiveAmount('1000'), quote: hiveAmount('2000', '@@000000013') },
      }),
      historyRow(32, 'limit_order_create2', { owner: 'alice', fill_or_kill: false, amount_to_sell: '1.000 HIVE' }),
      historyRow(31, 'limit_order_cancel', { owner: 'alice' }),
      historyRow(30, 'fill_order', {
        current_owner: 'alice', open_owner: 'bob', current_pays: hiveAmount('1000'), open_pays: hiveAmount('1000', '@@000000013'),
      }),
      historyRow(29, 'fill_order', {
        current_owner: 'bob', open_owner: 'alice', current_pays: hiveAmount('1000'), open_pays: hiveAmount('1000', '@@000000013'),
      }),
      historyRow(28, 'vote', { voter: 'alice' }),
      historyRow(27, 'claim_reward_balance', {
        account: 'alice',
        reward_hive: hiveAmount('0'),
        reward_hbd: hiveAmount('0', '@@000000013'),
        reward_vests: hiveAmount('0', '@@000000037', 6),
      }),
    ];
    let calls = 0;
    env.hiveCall.mockImplementation(async (_api: string, method: string, params?: { start?: number }) => {
      if (method === 'get_dynamic_global_properties') return GLOBAL;
      if (method !== 'get_account_history') return {};
      calls += 1;
      if (params?.start === 3) return { history: [historyRow(3, 'transfer', { from: 'a', to: 'b', amount: '1.000 HIVE', memo: '' })] };
      if (calls === 1) return { history: rows };
      return { history: [historyRow(1, 'transfer', { from: 'a', to: 'b', amount: '1.000 HIVE', memo: '' })] };
    });
    const page = await getTransactionHistory('alice', -1, 30);
    expect(page.transactions.map((tx) => tx.type)).toContain('transfer');
    expect(page.transactions.map((tx) => tx.type)).toContain('market_swap_fill');
    expect(page.transactions.find((tx) => tx.type === 'interest')?.amount).toContain('@@000000099');
    expect(page.oldestIndex).toBeGreaterThanOrEqual(0);

    const near = await getTransactionHistory('alice', 3, 5);
    expect(near.transactions.length).toBeGreaterThan(0);

    env.hiveCall.mockRejectedValue(new Error('down'));
    await expect(getTransactionHistory('alice')).resolves.toEqual({ transactions: [], oldestIndex: -1 });
  });
});
