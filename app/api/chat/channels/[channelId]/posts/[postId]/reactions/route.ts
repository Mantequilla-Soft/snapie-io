import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const ECENCY_CHAT_BASE = "https://ecency.com/api/mattermost";

// Map emoji characters to Mattermost emoji names
const EMOJI_TO_NAME: { [key: string]: string } = {
  "👍": "+1",
  "👎": "-1",
  "❤️": "heart",
  "😂": "joy",
  "😮": "open_mouth",
  "😢": "cry",
  "🔥": "fire",
  "🎉": "tada",
  "👀": "eyes",
  "😀": "grinning",
  "🙂": "slightly_smiling_face",
  "😍": "heart_eyes",
  "🤔": "thinking",
  "👏": "clap",
  "🚀": "rocket",
};

/**
 * Add or remove an emoji reaction to a post
 * POST /api/chat/channels/[channelId]/posts/[postId]/reactions
 * Body: { emoji: string, add: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { channelId: string; postId: string } }
) {
  try {
    const mmPatCookie = request.cookies.get("mm_pat");

    if (!mmPatCookie) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { emoji, add } = await request.json();

    if (!emoji) {
      return NextResponse.json(
        { error: "Emoji is required" },
        { status: 400 }
      );
    }

    // Convert emoji character to Mattermost emoji name
    const emojiName = EMOJI_TO_NAME[emoji] || emoji;
    console.log("🔵 Adding reaction:", emoji, "->", emojiName);

    // Ecency uses POST for adding reactions, DELETE for removing
    // The endpoint format is: /channels/{channelId}/posts/{postId}/reactions
    const method = add ? "POST" : "DELETE";
    
    const response = await fetch(
      `${ECENCY_CHAT_BASE}/channels/${params.channelId}/posts/${params.postId}/reactions`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          Cookie: `mm_pat=${mmPatCookie.value}`,
        },
        body: JSON.stringify({ emoji: emojiName }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Reaction error:", error);
      return NextResponse.json(
        { error: `Failed to ${add ? "add" : "remove"} reaction: ${error}` },
        { status: response.status }
      );
    }

    // Response might be empty for successful reaction
    let data = {};
    try {
      data = await response.json();
    } catch {
      // Empty response is fine
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("Reaction error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update reaction" },
      { status: 500 }
    );
  }
}
