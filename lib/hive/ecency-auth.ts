import { PrivateKey, cryptoUtils } from "@hiveio/dhive";
import { KeychainSDK, KeychainKeyTypes } from "keychain-sdk";

/**
 * Converts base64 to base64url (browser-compatible)
 */
function toBase64Url(base64: string): string {
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Builds a Hivesigner-style access token for Ecency chat authentication
 * @param username - Hive username
 * @param hsClientId - App identifier (e.g., 'snapie')
 * @param postingKey - Optional posting private key (for server-side)
 * @returns base64url-encoded signed token
 */
export async function buildEcencyAccessToken(
  username: string,
  hsClientId: string = "snapie",
  postingKey?: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);

  // Hivesigner-style payload
  const payload = {
    signed_message: { type: "code", app: hsClientId },
    authors: [username],
    timestamp,
  };

  const message = JSON.stringify(payload);
  const hash = cryptoUtils.sha256(message);

  let signature: string;

  if (postingKey) {
    // Server-side: sign with provided posting key
    signature = PrivateKey.fromString(postingKey).sign(hash).toString();
  } else {
    // Client-side: use Keychain to sign
    const keychain = new KeychainSDK(window);
    
    const response = await keychain.signBuffer({
      username,
      message: hash.toString("hex"),
      method: KeychainKeyTypes.posting,
      title: "Snapie Chat Authentication",
    });

    if (!response || !response.success) {
      throw new Error(response?.message || "Failed to sign authentication challenge");
    }

    signature = response.result as unknown as string;
  }

  // Attach signature and encode
  const signedPayload = {
    ...payload,
    signatures: [signature],
  };

  // Use browser-compatible base64url encoding
  const jsonString = JSON.stringify(signedPayload);
  const base64 = btoa(jsonString);
  return toBase64Url(base64);
}

/**
 * Bootstrap Ecency chat for a user
 * @param username - Hive username
 * @param accessToken - Ecency access token (generated via buildEcencyAccessToken)
 * @param community - Optional community to join (defaults to Snapie community)
 * @param communityTitle - Optional community title
 * @returns Bootstrap response with userId and channelId
 */
export async function bootstrapEcencyChat(
  username: string,
  accessToken: string,
  community?: string,
  communityTitle?: string
): Promise<{ ok: boolean; userId: string; channelId?: string }> {
  const response = await fetch("https://ecency.com/api/mattermost/bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include", // Important: allows cookie to be set
    body: JSON.stringify({
      username,
      accessToken,
      refreshToken: accessToken, // Use same token for refresh
      displayName: username,
      community: community || process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG,
      communityTitle: communityTitle || "Snapie",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bootstrap failed: ${error}`);
  }

  return response.json();
}

/**
 * Check if user has an active Ecency chat session (mm_pat cookie exists)
 * Note: This only works client-side
 */
export function hasEcencyChatSession(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.includes("mm_pat=");
}
