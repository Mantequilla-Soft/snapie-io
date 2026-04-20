'use client';
import HiveClient from "./hiveclient";
import crypto from 'crypto';
import { signImageHash } from "./server-functions";
import { Account, Discussion, Notifications, PublicKey, PrivateKey, KeyRole } from "@hiveio/dhive";
import { extractNumber } from "../utils/extractNumber";
import { ExtendedComment } from "@/hooks/useComments";
import {
  getAioha,
  KeyTypes,
  broadcastOps,
  voteWithAioha,
  transferWithAioha,
  customJsonWithAioha,
  commentWithAioha,
  signMessageWithAioha,
} from "./aioha";

interface HiveBroadcastResponse {
  success: boolean;
  result?: any;
  error?: string;
  publicKey?: string;
  message?: string;
}

interface VoteArgs {
  username: string;
  author: string;
  permlink: string;
  weight: number;
}

function keyTypeFromString(keyType: 'posting' | 'active'): KeyTypes {
  return keyType === 'active' ? KeyTypes.Active : KeyTypes.Posting;
}

async function aiohaBroadcast(
  operations: any[],
  keyType: KeyTypes,
  title?: string,
): Promise<HiveBroadcastResponse> {
  try {
    const out = await broadcastOps(operations, keyType, title);
    return { success: true, result: out.result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Broadcast failed',
    };
  }
}

/**
 * Convert HIVE to VESTS using current dynamic global properties.
 */
async function convertHiveToVests(hive: number): Promise<number> {
  const globalProps = await HiveClient.call('condenser_api', 'get_dynamic_global_properties', []);
  const totalVestingFund = extractNumber(globalProps.total_vesting_fund_hive);
  const totalVestingShares = extractNumber(globalProps.total_vesting_shares);
  return (hive * totalVestingShares) / totalVestingFund;
}

/**
 * Sign and broadcast operations using the currently logged-in aioha provider.
 */
export async function signAndBroadcastWithKeychain(
  username: string,
  operations: any[],
  keyType: 'posting' | 'active' = 'posting'
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    return await aiohaBroadcast(operations, keyTypeFromString(keyType), 'Approve transaction');
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;

export async function vote(props: VoteArgs): Promise<HiveBroadcastResponse> {
  try {
    const out = await voteWithAioha(props.author, props.permlink, props.weight);
    return { success: true, result: out.result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Vote failed' };
  }
}

export async function commentWithKeychain(formParamsAsObject: any): Promise<HiveBroadcastResponse | undefined> {
  try {
    const data = formParamsAsObject.data;
    const jsonMetadata = typeof data.json_metadata === 'string'
      ? data.json_metadata
      : JSON.stringify(data.json_metadata || {});
    const overlayTitle = data.parent_username ? 'Approve reply' : 'Approve post';
    const result = await commentWithAioha(
      data.parent_username || '',
      data.parent_perm || '',
      data.permlink,
      data.title || '',
      data.body,
      jsonMetadata,
      data.comment_options,
      overlayTitle,
    );
    return { success: true, publicKey: String(result.publicKey || ''), result: result.result };
  } catch (error: any) {
    console.error('commentWithKeychain error:', error);
    return {
      success: false,
      publicKey: '',
      error: error?.message || error?.error || String(error),
    };
  }
}

export function getReputation(rep: number) {
  let out = ((Math.log10(Math.abs(rep)) - 9) * 9) + 25;
  out = Math.round(out);
  return out;
}

export async function transferWithKeychain(username: string, destination: string, amount: string, memo: string, currency: string) {
  try {
    const amt = parseFloat(amount);
    const transfer = await transferWithAioha(destination, amt, currency, memo);
    console.log({ transfer });
    return transfer;
  } catch (error) {
    console.log({ error });
  }
}

export async function powerUpWithKeychain(username: string, amount: number) {
  try {
    const op = [
      'transfer_to_vesting',
      {
        from: username,
        to: username,
        amount: `${amount.toFixed(3)} HIVE`,
      },
    ];
    const result = await aiohaBroadcast([op], KeyTypes.Active, `Approve power-up of ${amount.toFixed(3)} HIVE`);
    console.log({ powerUp: result });
    return result;
  } catch (error) {
    console.log({ error });
    throw error;
  }
}

export async function powerDownWithKeychain(username: string, hivePower: number) {
  try {
    const vests = await convertHiveToVests(hivePower);
    const op = [
      'withdraw_vesting',
      {
        account: username,
        vesting_shares: `${vests.toFixed(6)} VESTS`,
      },
    ];
    const result = await aiohaBroadcast([op], KeyTypes.Active, `Approve power-down of ${hivePower.toFixed(3)} HP`);
    console.log({ powerDown: result });
    return result;
  } catch (error) {
    console.log({ error });
    throw error;
  }
}

export async function delegateWithKeychain(username: string, delegatee: string, amount: number) {
  try {
    const vests = await convertHiveToVests(amount);
    const op = [
      'delegate_vesting_shares',
      {
        delegator: username,
        delegatee,
        vesting_shares: `${vests.toFixed(6)} VESTS`,
      },
    ];
    const result = await aiohaBroadcast([op], KeyTypes.Active, `Approve delegation of ${amount.toFixed(3)} HP to @${delegatee}`);
    console.log({ delegation: result });
    return result;
  } catch (error) {
    console.log({ error });
    throw error;
  }
}

export async function broadcastWithKeychain(
  username: string,
  operations: any[],
  method: 'posting' | 'active' = 'active',
) {
  try {
    const keyType = typeof method === 'string' ? keyTypeFromString(method) : method;
    const result = await aiohaBroadcast(operations, keyType, 'Approve transaction');
    console.log({ broadcast: result });
    return result;
  } catch (error) {
    console.log({ error });
    throw error;
  }
}

export async function updateProfile(
  username: string,
  name: string,
  about: string,
  location: string,
  coverImageUrl: string,
  avatarUrl: string,
  website: string,
) {
  try {
    const profileMetadata = {
      profile: {
        name,
        about,
        location,
        cover_image: coverImageUrl,
        profile_image: avatarUrl,
        website,
        version: 2,
      },
    };
    const op = [
      'account_update2',
      {
        account: username,
        posting_json_metadata: JSON.stringify(profileMetadata),
        extensions: [],
      },
    ];
    const result = await aiohaBroadcast([op], KeyTypes.Active, 'Approve profile update');
    console.log('Broadcast success:', result);
  } catch (error) {
    console.error('Profile update failed:', error);
  }
}

export async function checkCommunitySubscription(username: string) {
  const parameters = { account: username };
  try {
    const subscriptions = await HiveClient.call('bridge', 'list_all_subscriptions', parameters);
    return subscriptions.some((subscription: any) => subscription[0] === communityTag);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return false;
  }
}

export async function communitySubscribeKeyChain(username: string) {
  try {
    const json = JSON.stringify(['subscribe', { community: communityTag }]);
    const result = await customJsonWithAioha(
      KeyTypes.Posting,
      'community',
      json,
      'Subscribe to community',
      'Approve community subscription',
    );
    console.log('Broadcast success:', result);
  } catch (error) {
    console.error('Community subscribe failed:', error);
  }
}

export async function checkFollow(follower: string, following: string): Promise<boolean> {
  try {
    const status = await HiveClient.call('bridge', 'get_relationship_between_accounts', [
      follower,
      following,
    ]);
    return !!status?.follows;
  } catch (error) {
    console.log(error);
    return false;
  }
}

export async function checkAccountName(username: string) {
  try {
    const users = await HiveClient.call('condenser_api', 'lookup_accounts', [username, 1]);
    console.log(users[0]);
    return users[0];
  } catch (error) {
    console.log(error);
  }
}

export async function changeFollow(follower: string, following: string) {
  try {
    const status = await checkFollow(follower, following);
    const type = status ? '' : 'blog';
    const json = JSON.stringify([
      'follow',
      { follower, following, what: type ? [type] : [] },
    ]);
    const overlayTitle = status ? `Approve unfollow @${following}` : `Approve follow @${following}`;
    const result = await customJsonWithAioha(
      KeyTypes.Posting,
      'follow',
      json,
      status ? 'Unfollow' : 'Follow',
      overlayTitle,
    );
    console.log('Broadcast success:', result);
  } catch (error) {
    console.error('Follow update failed:', error);
  }
}

export async function witnessVoteWithKeychain(username: string, witness: string) {
  try {
    const op = [
      'account_witness_vote',
      {
        account: username,
        witness: witness || 'skatehive',
        approve: true,
      },
    ];
    const result = await aiohaBroadcast([op], KeyTypes.Active, `Approve witness vote for @${witness}`);
    console.log({ witnessvote: result });
  } catch (error) {
    console.log({ error });
  }
}

/**
 * Upload audio to 3Speak Audio API
 */
export async function uploadAudioTo3Speak(
  audioBlob: Blob,
  duration: number,
  username: string
): Promise<{ success: boolean; permlink?: string; cid?: string; playUrl?: string; apiUrl?: string; error?: string }> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_3SPEAK_API_KEY;

    if (!apiKey) {
      throw new Error('3Speak API key not configured');
    }

    const format = audioBlob.type.includes('webm') ? 'webm' : 'mp3';

    const formData = new FormData();
    formData.append('audio', audioBlob, `recording.${format}`);
    formData.append('duration', duration.toString());
    formData.append('format', format);
    formData.append('title', `Audio Snap by ${username}`);

    const response = await fetch('https://audio.3speak.tv/api/audio/upload', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'X-User': username,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errorData.error || `Upload failed with status ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      permlink: data.permlink,
      cid: data.cid,
      playUrl: data.playUrl?.replace(/^http:/, 'https:') || data.playUrl,
      apiUrl: data.apiUrl?.replace(/^http:/, 'https:') || data.apiUrl,
    };
  } catch (error) {
    console.error('Error uploading audio to 3Speak:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function getFileSignature(file: File): Promise<string> {
  return new Promise<string>(async (resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async () => {
      if (reader.result) {
        const content = Buffer.from(reader.result as ArrayBuffer);
        const hash = crypto.createHash('sha256')
          .update('ImageSigningChallenge')
          .update(content as any)
          .digest('hex');
        try {
          const signature = await signImageHash(hash);
          resolve(signature);
        } catch (error) {
          console.error('Error signing the hash:', error);
          reject(error);
        }
      } else {
        reject(new Error('Failed to read file.'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Error reading file.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Upload an image to 3Speak image server as a fallback.
 */
async function uploadTo3Speak(
  file: File,
  options?: {
    index?: number;
    setUploadProgress?: React.Dispatch<React.SetStateAction<number[]>>;
    onProgress?: (progress: number) => void;
  }
): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_IMAGE_SERVER_API_KEY;

  if (!apiKey) {
    throw new Error('IMAGE_SERVER_API_KEY is not configured');
  }

  console.log('📤 Uploading to 3Speak fallback server:', file.name);

  const formData = new FormData();
  formData.append('image', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://images.3speak.tv/upload', true);
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = (event.loaded / event.total) * 100;
        options?.onProgress?.(progress);
        if (options?.index !== undefined && options?.setUploadProgress) {
          options.setUploadProgress((prevProgress: number[]) => {
            const updatedProgress = [...prevProgress];
            updatedProgress[options.index!] = progress;
            return updatedProgress;
          });
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status === 201 || xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success && response.url) {
            console.log('✅ 3Speak upload successful:', response.url);
            resolve(response.url);
          } else {
            reject(new Error('Invalid response from 3Speak server'));
          }
        } catch (e) {
          reject(new Error(`Invalid response format: ${xhr.responseText}`));
        }
      } else {
        let errorMsg = `3Speak upload failed: ${xhr.status} - ${xhr.statusText}`;
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          if (errorResponse.error) {
            errorMsg = errorResponse.error;
          }
        } catch {}
        console.error('❌ 3Speak upload failed:', errorMsg);
        reject(new Error(errorMsg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during 3Speak image upload'));
    };

    xhr.send(formData);
  });
}

export async function uploadImage(file: File, signature: string, index?: number, setUploadProgress?: React.Dispatch<React.SetStateAction<number[]>>): Promise<string> {
  const signatureUser = process.env.NEXT_PUBLIC_HIVE_USER;

  console.log('📤 Uploading via API route with automatic fallback...');

  const formData = new FormData();
  formData.append("file", file);
  formData.append("username", signatureUser || '');
  formData.append("signature", signature);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload-image', true);

    if (index !== undefined && setUploadProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          setUploadProgress((prevProgress: number[]) => {
            const updatedProgress = [...prevProgress];
            updatedProgress[index] = progress;
            return updatedProgress;
          });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success && response.url) {
            const source = response.source || 'hive.blog';
            console.log(`✅ Upload successful via ${source}:`, response.url);
            resolve(response.url);
          } else {
            reject(new Error('Invalid response from upload API'));
          }
        } catch (e) {
          reject(new Error(`Invalid response format: ${xhr.responseText}`));
        }
      } else {
        let errorMsg = `Upload failed: ${xhr.status} - ${xhr.statusText}`;
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          if (errorResponse.error) {
            errorMsg = errorResponse.message || errorResponse.error;
          }
        } catch {}
        console.error('❌ Upload failed:', errorMsg);
        reject(new Error(errorMsg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}

// ============================================================================
// IMAGE UPLOAD WITH USER SIGNATURE (via aioha)
// ============================================================================
// Signs the images.hive.blog challenge buffer using whichever provider the
// user is logged in with (Keychain, HiveAuth, PeakVault, Ledger, HiveSigner).

async function readFileAsBuffer(file: File): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        resolve(Buffer.from(reader.result as ArrayBuffer));
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsArrayBuffer(file);
  });
}

export async function uploadImageWithKeychain(
  file: File,
  username: string,
  options?: {
    index?: number;
    setUploadProgress?: React.Dispatch<React.SetStateAction<number[]>>;
    onProgress?: (progress: number) => void;
  }
): Promise<string> {
  console.log('🔐 uploadImageWithKeychain called for:', file.name, 'user:', username);

  const aioha = getAioha();
  if (!aioha.isLoggedIn()) {
    throw new Error('Not logged in');
  }

  console.log('📖 Reading file...');
  const fileContent = await readFileAsBuffer(file);
  console.log('📖 File read, size:', fileContent.length, 'bytes');

  const prefix = Buffer.from('ImageSigningChallenge');
  const challengeBuffer = Buffer.concat([prefix, fileContent]);
  const challengeString = JSON.stringify(challengeBuffer);

  console.log('✍️ Requesting signature via aioha...');
  const signResult = await signMessageWithAioha(
    challengeString,
    KeyTypes.Posting,
    'Approve image upload signature',
  );
  const signature = signResult.result;
  console.log('✍️ Signature received:', signature.substring(0, 20) + '...');

  console.log('📤 Uploading via API route with automatic fallback...');

  const formData = new FormData();
  formData.append("file", file);
  formData.append("username", username);
  formData.append("signature", signature);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload-image', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = (event.loaded / event.total) * 100;
        options?.onProgress?.(progress);
        if (options?.index !== undefined && options?.setUploadProgress) {
          options.setUploadProgress((prevProgress: number[]) => {
            const updatedProgress = [...prevProgress];
            updatedProgress[options.index!] = progress;
            return updatedProgress;
          });
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success && response.url) {
            const source = response.source || 'hive.blog';
            console.log(`✅ Upload successful via ${source}:`, response.url);
            resolve(response.url);
          } else {
            reject(new Error('Invalid response from upload API'));
          }
        } catch (e) {
          reject(new Error(`Invalid response format: ${xhr.responseText}`));
        }
      } else {
        let errorMsg = `Upload failed: ${xhr.status} - ${xhr.statusText}`;
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          if (errorResponse.error) {
            errorMsg = errorResponse.message || errorResponse.error;
          }
        } catch {}
        console.error('❌ Upload failed:', errorMsg);
        reject(new Error(errorMsg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during image upload'));
    };

    xhr.send(formData);
  });
}

export async function getPost(user: string, postId: string) {
  const postContent = await HiveClient.database.call('get_content', [
    user,
    postId,
  ]);
  if (!postContent) throw new Error('Failed to fetch post content');

  return postContent as Discussion;
}

export function getPayoutValue(post: any): string {
  const createdDate = new Date(post.created);
  const now = new Date();

  const timeDifferenceInMs = now.getTime() - createdDate.getTime();
  const timeDifferenceInDays = timeDifferenceInMs / (1000 * 60 * 60 * 24);

  if (timeDifferenceInDays >= 7) {
    return post.total_payout_value.replace(" HBD", "");
  } else if (timeDifferenceInDays < 7) {
    return post.pending_payout_value.replace(" HBD", "");
  } else {
    return "0.000";
  }
}

export async function findLastNotificationsReset(username: string, start = -1, loopCount = 0): Promise<string> {
  if (loopCount >= 5) {
    return '1970-01-01T00:00:00Z';
  }

  try {
    const params = {
      account: username,
      start: start,
      limit: 1000,
      include_reversible: true,
      operation_filter_low: 262144,
    };

    const transactions = await HiveClient.call('account_history_api', 'get_account_history', params);
    const history = transactions.history.reverse();

    if (history.length === 0) {
      return '1970-01-01T00:00:00Z';
    }

    for (const item of history) {
      if (item[1].op.value.id === 'notify') {
        const json = JSON.parse(item[1].op.value.json);
        return json[1].date;
      }
    }

    return findLastNotificationsReset(username, start - 1000, loopCount + 1);

  } catch (error) {
    console.log(error);
    return '1970-01-01T00:00:00Z';
  }
}

export async function fetchNewNotifications(username: string) {
  try {
    const notifications: Notifications[] = await HiveClient.call('bridge', 'account_notifications', { account: username, limit: 100 });
    const lastDate = await findLastNotificationsReset(username);

    if (lastDate) {
      const filteredNotifications = notifications.filter(notification => notification.date > lastDate);
      return filteredNotifications;
    } else {
      return notifications;
    }
  } catch (error) {
    console.log('Error:', error);
    return [];
  }
}

export async function convertVestToHive(amount: number) {
  const globalProperties = await HiveClient.call('condenser_api', 'get_dynamic_global_properties', []);
  const totalVestingFund = extractNumber(globalProperties.total_vesting_fund_hive);
  const totalVestingShares = extractNumber(globalProperties.total_vesting_shares);
  const vestHive = (totalVestingFund * amount) / totalVestingShares;
  return vestHive;
}

export async function getProfile(username: string) {
  const profile = await HiveClient.call('bridge', 'get_profile', { account: username });
  return profile;
}

export async function getCommunityInfo(username: string) {
  const profile = await HiveClient.call('bridge', 'get_community', { name: username });
  return profile;
}

export async function findPosts(query: string, params: any) {
  const by = 'get_discussions_by_' + query;
  const posts = await HiveClient.database.call(by, [params]);
  return posts;
}

export async function getLastSnapsContainer() {
  const author = "peak.snaps";
  const beforeDate = new Date().toISOString().split('.')[0];
  const permlink = '';
  const limit = 1;

  const result = await HiveClient.database.call('get_discussions_by_author_before_date',
    [author, permlink, beforeDate, limit]);

  return {
    author,
    permlink: result[0].permlink
  };
}

/**
 * Get the relationship between two accounts using Bridge API
 */
export async function getRelationshipBetweenAccounts(
  follower: string,
  following: string
): Promise<{
  follows: boolean;
  ignores: boolean;
  blacklists: boolean;
}> {
  try {
    const result = await HiveClient.call('bridge', 'get_relationship_between_accounts', [
      follower,
      following
    ]);

    return {
      follows: result?.follows || false,
      ignores: result?.ignores || false,
      blacklists: result?.blacklists || false,
    };
  } catch (error) {
    console.error('Error fetching relationship between accounts:', error);
    return {
      follows: false,
      ignores: false,
      blacklists: false,
    };
  }
}

/**
 * @deprecated Use `mutedAccountsManager.getMutedList()` from '@/lib/hive/muted-accounts' instead.
 */
export async function getCommunityMutedAccounts(community: string): Promise<string[]> {
  try {
    const result = await HiveClient.call('bridge', 'list_community_roles', {
      community,
      limit: 1000
    });

    if (result && Array.isArray(result)) {
      const mutedAccounts = result
        .filter((r: any) => r[1] === 'muted')
        .map((r: any) => r[0]);

      return mutedAccounts;
    }
    return [];
  } catch (error) {
    console.error('Error fetching community muted accounts:', error);
    return [];
  }
}

/**
 * Set user relationship (follow, mute, blacklist, or unfollow) using aioha.
 */
export async function setUserRelationship(
  follower: string,
  following: string,
  type: 'blog' | 'ignore' | 'blacklist' | ''
): Promise<boolean> {
  try {
    const json = JSON.stringify([
      'follow',
      {
        follower,
        following,
        what: type ? [type] : [],
      },
    ]);
    const overlayTitle = type === 'blog'
      ? `Approve follow @${following}`
      : type === 'ignore'
        ? `Approve mute @${following}`
        : type === 'blacklist'
          ? `Approve blacklist @${following}`
          : `Approve unfollow @${following}`;
    const result = await customJsonWithAioha(
      KeyTypes.Posting,
      'follow',
      json,
      'Update relationship',
      overlayTitle,
    );
    console.log('Relationship update success:', result);
    return true;
  } catch (error) {
    console.error('Error setting user relationship:', error);
    return false;
  }
}

export async function getFollowing(
  username: string,
  startFollowing: string = '',
  limit: number = 100
): Promise<string[]> {
  try {
    const result = await HiveClient.database.call('get_following', [
      username,
      startFollowing,
      'blog',
      limit
    ]);

    return result.map((item: any) => item.following).filter(Boolean);
  } catch (error) {
    console.error('Error fetching following list:', error);
    return [];
  }
}

export async function getFollowers(
  username: string,
  startFollower: string = '',
  limit: number = 100
): Promise<string[]> {
  try {
    const result = await HiveClient.database.call('get_followers', [
      username,
      startFollower,
      'blog',
      limit
    ]);

    return result.map((item: any) => item.follower).filter(Boolean);
  } catch (error) {
    console.error('Error fetching followers list:', error);
    return [];
  }
}

export async function getCryptoPrices(): Promise<{ hive: number; hbd: number }> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=hive,hive_dollar&vs_currencies=usd'
    );
    const data = await response.json();

    return {
      hive: data.hive?.usd || 0,
      hbd: data.hive_dollar?.usd || 0,
    };
  } catch (error) {
    console.error('Error fetching crypto prices:', error);
    return { hive: 0, hbd: 0 };
  }
}

export interface Transaction {
  type: string;
  from: string;
  to: string;
  amount: string;
  memo: string;
  timestamp: string;
  trx_id?: string;
}

export async function getTransactionHistory(
  username: string,
  start: number = -1,
  limit: number = 1000
): Promise<{ transactions: Transaction[], oldestIndex: number }> {
  try {
    const history = await HiveClient.database.getAccountHistory(
      username,
      start,
      limit
    );

    const transactions: Transaction[] = [];
    let oldestIndex = -1;

    for (const [index, transaction] of history) {
      if (oldestIndex === -1 || index < oldestIndex) {
        oldestIndex = index;
      }

      const op = transaction.op;
      const opType = op[0];
      const opData = op[1];

      if (opType === 'transfer') {
        transactions.push({
          type: 'transfer',
          from: opData.from,
          to: opData.to,
          amount: opData.amount,
          memo: opData.memo || '',
          timestamp: transaction.timestamp,
          trx_id: transaction.trx_id,
        });
      } else if (opType === 'transfer_to_vesting') {
        transactions.push({
          type: 'power_up',
          from: opData.from,
          to: opData.to,
          amount: opData.amount,
          memo: 'Power Up',
          timestamp: transaction.timestamp,
          trx_id: transaction.trx_id,
        });
      } else if (opType === 'withdraw_vesting') {
        const vestsAmount = parseFloat(opData.vesting_shares.split(' ')[0]);
        const hiveAmount = await convertVestToHive(vestsAmount);

        transactions.push({
          type: 'power_down',
          from: opData.account,
          to: opData.account,
          amount: `${hiveAmount.toFixed(3)} HIVE`,
          memo: 'Power Down',
          timestamp: transaction.timestamp,
          trx_id: transaction.trx_id,
        });
      } else if (opType === 'transfer_to_savings') {
        transactions.push({
          type: 'to_savings',
          from: opData.from,
          to: opData.to,
          amount: opData.amount,
          memo: opData.memo || 'Transfer to Savings',
          timestamp: transaction.timestamp,
          trx_id: transaction.trx_id,
        });
      } else if (opType === 'transfer_from_savings') {
        transactions.push({
          type: 'from_savings',
          from: opData.from,
          to: opData.to,
          amount: opData.amount,
          memo: opData.memo || 'Withdraw from Savings',
          timestamp: transaction.timestamp,
          trx_id: transaction.trx_id,
        });
      } else if (opType === 'claim_reward_balance') {
        const rewards = [];

        if (opData.reward_hive && opData.reward_hive !== '0.000 HIVE') {
          rewards.push(opData.reward_hive);
        }
        if (opData.reward_hbd && opData.reward_hbd !== '0.000 HBD') {
          rewards.push(opData.reward_hbd);
        }
        if (opData.reward_vests && opData.reward_vests !== '0.000000 VESTS') {
          const vestsAmount = parseFloat(opData.reward_vests.split(' ')[0]);
          const hiveAmount = await convertVestToHive(vestsAmount);
          rewards.push(`${hiveAmount.toFixed(3)} HP`);
        }

        if (rewards.length > 0) {
          transactions.push({
            type: 'claim_rewards',
            from: 'rewards',
            to: opData.account,
            amount: rewards.join(' + '),
            memo: 'Claim Rewards',
            timestamp: transaction.timestamp,
            trx_id: transaction.trx_id,
          });
        }
      }
    }

    return {
      transactions: transactions.reverse(),
      oldestIndex: oldestIndex
    };
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return { transactions: [], oldestIndex: -1 };
  }
}
