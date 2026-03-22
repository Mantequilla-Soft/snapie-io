import HiveClient from "./hiveclient";

export async function getPostForMetadata(author: string, permlink: string) {
  try {
    const post = await HiveClient.database.call('get_content', [author, permlink]);
    if (!post || !post.author) return null;
    return post;
  } catch {
    return null;
  }
}

export async function getProfileForMetadata(username: string) {
  try {
    const profile = await HiveClient.call('bridge', 'get_profile', { account: username });
    if (!profile || !profile.name) return null;
    return profile;
  } catch {
    return null;
  }
}
