'use client';
import { Broadcast, Custom, KeychainKeyTypes, KeychainRequestResponse, KeychainSDK, Login, Post, Transfer, Vote, WitnessVote } from "keychain-sdk";
import HiveClient from "./hiveclient";
import crypto from 'crypto';
import { signImageHash } from "./server-functions";
import { Account, Discussion, Notifications, PublicKey, PrivateKey, KeyRole } from "@hiveio/dhive";
import { extractNumber } from "../utils/extractNumber";
import { ExtendedComment } from "@/hooks/useComments";

interface HiveKeychainResponse {
  success: boolean
  publicKey: string
}

const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;

export async function vote(props: Vote): Promise<KeychainRequestResponse> {
  const keychain = new KeychainSDK(window)

  const result = await keychain.vote({
    username: props.username,
    permlink: props.permlink,
    author: props.author,
    weight: props.weight,
  } as Vote);
  return result;
}

export async function commentWithKeychain(formParamsAsObject: any): Promise<HiveKeychainResponse | undefined> {

  const keychain = new KeychainSDK(window);
  const post = await keychain.post(formParamsAsObject.data as Post);
  if (post) {
    console.log('post', post);
    return {
      success: true,
      publicKey: String(post.publicKey)
    }
  } else {
    return {
      success: false,
      publicKey: 'deu merda'
    }

  }
}

export async function loginWithKeychain(username: string) {
  try {
    const memo = `${username} signed up with skatehive app at ${Date.now()}`
    const keychain = new KeychainSDK(window);
    undefined
    const formParamsAsObject = {
      "data": {
        "username": username,
        "message": memo,
        "method": KeychainKeyTypes.posting,
        "title": "Login"
      }
    }

    const login = await keychain
      .login(
        formParamsAsObject.data as Login);
    return({ login });
  } catch (error) {
    console.log({ error });
  }
}

export function getReputation(rep: number) {
  let out = ((Math.log10(Math.abs(rep)) - 9) * 9) + 25;
  out = Math.round(out);
  return out;
}

export async function transferWithKeychain(username: string, destination: string, amount: string, memo: string, currency: string) {
  try {
    const keychain = new KeychainSDK(window);

    const formParamsAsObject = {
      "data": {
        "username": username,
        "to": destination,
        "amount": amount,
        "memo": memo,
        "enforce": false,
        "currency": currency,
      }
    }

    const transfer = await keychain
      .transfer(
        formParamsAsObject.data as Transfer);
    console.log({ transfer });
  } catch (error) {
    console.log({ error });
  }
}

export async function updateProfile(username: string, name: string, about: string, location: string, coverImageUrl: string, avatarUrl: string, website: string) {
  try {
    const keychain = new KeychainSDK(window);

    const profileMetadata = {
      profile: {
        name: name,
        about: about,
        location: location,
        cover_image: coverImageUrl,
        profile_image: avatarUrl,
        website: website,
        version: 2
      }
    };

    const formParamsAsObject = {
      data: {
        username: username,
        operations: [
          [
            'account_update2',
            {
              account: username,
              posting_json_metadata: JSON.stringify(profileMetadata),
              extensions: []
            }
          ]
        ],
        method: KeychainKeyTypes.active,
      },
    };

    const broadcast = await keychain.broadcast(formParamsAsObject.data as unknown as Broadcast);
    console.log('Broadcast success:', broadcast);
  } catch (error) {
    console.error('Profile update failed:', error);
  }
}

export async function checkCommunitySubscription(username: string) {

  const parameters = {
    account: username
  }
  try {
    const subscriptions = await HiveClient.call('bridge', 'list_all_subscriptions', parameters);
    return subscriptions.some((subscription: any) => subscription[0] === communityTag);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return false; // Returning false in case of an error
  }
}

export async function communitySubscribeKeyChain(username: string) {

  const keychain = new KeychainSDK(window);
  const json = [
    'subscribe',
    {
      community: communityTag
    }
  ]
  const formParamsAsObject = {
    data: {
      username: username,
      id: "community",
      method: KeychainKeyTypes.posting,
      json: JSON.stringify(json)
    },
  };
  try {
    const custom = await keychain.custom(formParamsAsObject.data as unknown as Custom);
    //const broadcast = await keychain.broadcast(formParamsAsObject.data as unknown as Broadcast);
    console.log('Broadcast success:', custom);
  } catch (error) {
    console.error('Profile update failed:', error);
  }
}

export async function checkFollow(follower: string, following: string): Promise<boolean> {
  try {
    const status = await HiveClient.call('bridge', 'get_relationship_between_accounts', [
      follower,
      following
    ]);
    if (status.follows) {
      return true
    } else {
      return false
    }
  } catch (error) {
    console.log(error)
    return false
  }
}

export async function checkAccountName(username: string) {
  try {
    const users = await HiveClient.call('condenser_api', 'lookup_accounts', [
      username, 1
    ]);
    console.log(users[0])
    return users[0]
  } catch (error) {
    console.log(error)
    //return false
  }
}

export async function changeFollow(follower: string, following: string) {
  const keychain = new KeychainSDK(window);
  const status = await checkFollow(follower, following)
  let type = ''
  if (status) {
    type = ''
  } else {
    type = 'blog'
  }
  const json = JSON.stringify([
    'follow',
    {
      follower: follower,
      following: following,
      what: [type], //null value for unfollow, 'blog' for follow
    },
  ]);

  const formParamsAsObject = {
    data: {
      username: follower,
      id: "follow",
      method: KeychainKeyTypes.posting,
      json: JSON.stringify(json)
    },
  };
  try {
    const custom = await keychain.custom(formParamsAsObject.data as unknown as Custom);
    //const broadcast = await keychain.broadcast(formParamsAsObject.data as unknown as Broadcast);
    console.log('Broadcast success:', custom);
  } catch (error) {
    console.error('Profile update failed:', error);
  }

}

export async function witnessVoteWithKeychain(username: string, witness: string) {
  const keychain = new KeychainSDK(window);
  try {
    const formParamsAsObject = {
      "data": {
        "username": username,
        "witness": "skatehive",
        "vote": true
      }
    };
    const witnessvote = await keychain
      .witnessVote(
        formParamsAsObject.data as WitnessVote);
    console.log({ witnessvote });
  } catch (error) {
    console.log({ error });
  }
}

/**
 * Upload audio to 3Speak Audio API
 * @param audioBlob - Audio blob from recording
 * @param duration - Duration in seconds
 * @param username - Hive username
 * @returns Promise with upload result
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

    // Convert webm to mp3 format name (API expects format parameter)
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
      playUrl: data.playUrl,
      apiUrl: data.apiUrl,
    };
  } catch (error) {
    console.error('Error uploading audio to 3Speak:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function getFileSignature (file: File): Promise<string> {
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

export async function uploadImage(file: File, signature: string, index?: number, setUploadProgress?: React.Dispatch<React.SetStateAction<number[]>>): Promise<string> {
  const signatureUser = process.env.NEXT_PUBLIC_HIVE_USER;
  const formData = new FormData();
  formData.append("file", file, file.name);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://images.hive.blog/${signatureUser}/${signature}`, true);

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
      }
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response.url);
        } catch (e) {
          reject(new Error(`Invalid response format: ${xhr.responseText}`));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} - ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error'));
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
    
    // Calculate the time difference in days
    const timeDifferenceInMs = now.getTime() - createdDate.getTime();
    const timeDifferenceInDays = timeDifferenceInMs / (1000 * 60 * 60 * 24);
    
    if (timeDifferenceInDays >= 7) {
      // Post is older than 7 days, return the total payout value
      return post.total_payout_value.replace(" HBD", "");
    } else if (timeDifferenceInDays < 7) {
      // Post is less than 7 days old, return the pending payout value
      return post.pending_payout_value.replace(" HBD", "");
    } else {
      return "0.000"
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

export async function convertVestToHive (amount: number) {
  const globalProperties = await HiveClient.call('condenser_api', 'get_dynamic_global_properties', []);
  const totalVestingFund = extractNumber(globalProperties.total_vesting_fund_hive)
  const totalVestingShares = extractNumber(globalProperties.total_vesting_shares)
  const vestHive = ( totalVestingFund * amount ) / totalVestingShares
  return vestHive
}

export async function getProfile (username: string) {
  const profile = await HiveClient.call('bridge', 'get_profile', {account: username});
  return profile
}

export async function getCommunityInfo (username: string) {
  const profile = await HiveClient.call('bridge', 'get_community', {name: username});
  return profile
}

export async function findPosts(query: string, params: any) {
      const by = 'get_discussions_by_' + query;
      const posts = await HiveClient.database.call(by, [params]);
  return posts
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
  }
}

/**
 * Get the relationship between two accounts using Bridge API
 * @param follower - The account that might be following
 * @param following - The account that might be followed
 * @returns Object with relationship information (follows, ignores, blacklists)
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
 * Get community muted accounts list
 * @param community - The community name (e.g., 'hive-178315')
 * @returns Promise<string[]> - Array of muted account usernames
 */
export async function getCommunityMutedAccounts(community: string): Promise<string[]> {
  try {
    const result = await HiveClient.call('bridge', 'list_community_roles', {
      community,
      limit: 1000
    });
    
    if (result && Array.isArray(result)) {
      // Each item is [account, role, title] tuple
      // Filter for muted role and extract account names
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
 * Set user relationship (follow, mute, blacklist, or unfollow) using Keychain
 * @param follower - The username performing the action
 * @param following - The username to follow/mute/blacklist
 * @param type - Type of action: 'blog' (follow), 'ignore' (mute), 'blacklist', or '' (unfollow)
 * @returns Promise<boolean> - True if successful
 */
export async function setUserRelationship(
  follower: string,
  following: string,
  type: 'blog' | 'ignore' | 'blacklist' | ''
): Promise<boolean> {
  try {
    const keychain = new KeychainSDK(window);
    
    const json = JSON.stringify([
      'follow',
      {
        follower,
        following,
        what: type ? [type] : [], // Empty array for unfollow
      },
    ]);

    const formParamsAsObject = {
      data: {
        username: follower,
        id: 'follow',
        method: KeychainKeyTypes.posting,
        json: json,
      },
    };

    const result = await keychain.custom(formParamsAsObject.data as unknown as Custom);
    
    if (result.success) {
      console.log('Relationship update success:', result);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error setting user relationship:', error);
    return false;
  }
}

/**
 * Get the following list for a user
 * @param username - The username to get following list for
 * @param startFollowing - Optional: username to start from for pagination
 * @param limit - Optional: number of results to return (default: 100)
 * @returns Array of usernames that the user is following
 */
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
    
    // The result is an array of objects with 'following' property
    return result.map((item: any) => item.following).filter(Boolean);
  } catch (error) {
    console.error('Error fetching following list:', error);
    return [];
  }
}

/**
 * Get the followers list for a user
 * @param username - The username to get followers list for
 * @param startFollower - Optional: username to start from for pagination
 * @param limit - Optional: number of results to return (default: 100)
 * @returns Array of usernames that follow the user
 */
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
    
    // The result is an array of objects with 'follower' property
    return result.map((item: any) => item.follower).filter(Boolean);
  } catch (error) {
    console.error('Error fetching followers list:', error);
    return [];
  }
}

/**
 * Get current HIVE and HBD prices from CoinGecko
 * @returns Object with HIVE and HBD prices in USD
 */
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

/**
 * Transaction interface for wallet history
 */
export interface Transaction {
  type: string;
  from: string;
  to: string;
  amount: string;
  memo: string;
  timestamp: string;
  trx_id?: string;
}

/**
 * Get transaction history for a user
 * @param username - Hive username
 * @param start - Starting index (use -1 for most recent, or specific index for pagination)
 * @param limit - Number of transactions to fetch
 * @returns Array of transactions
 */
export async function getTransactionHistory(
  username: string,
  start: number = -1,
  limit: number = 100
): Promise<{ transactions: Transaction[], oldestIndex: number }> {
  try {
    // Get account history with transfer operations
    const history = await HiveClient.database.getAccountHistory(
      username,
      start,
      limit
    );

    const transactions: Transaction[] = [];
    let oldestIndex = -1;

    for (const [index, transaction] of history) {
      // Track the minimum index we've seen
      if (oldestIndex === -1 || index < oldestIndex) {
        oldestIndex = index;
      }
      
      const op = transaction.op;
      const opType = op[0];
      const opData = op[1];

      // Filter for transfer operations
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
        // Convert VESTS to HIVE
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
          // Convert VESTS to HIVE for display
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

    // Return in chronological order (newest first)
    return {
      transactions: transactions.reverse(),
      oldestIndex: oldestIndex
    };
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return { transactions: [], oldestIndex: -1 };
  }
}
