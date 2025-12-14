import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const ECENCY_CHAT_BASE = "https://ecency.com/api/mattermost";

/**
 * Get posts (messages) for a channel
 * GET /api/chat/channels/[channelId]/posts
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { channelId: string } }
) {
  try {
    const mmPatCookie = request.cookies.get("mm_pat");
    
    if (!mmPatCookie) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { channelId } = params;
    const response = await fetch(`${ECENCY_CHAT_BASE}/channels/${channelId}/posts`, {
      method: "GET",
      headers: {
        Cookie: `mm_pat=${mmPatCookie.value}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch posts: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Posts fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

/**
 * Send a message to a channel
 * POST /api/chat/channels/[channelId]/posts
 * Body: { message: string, rootId?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { channelId: string } }
) {
  try {
    const mmPatCookie = request.cookies.get("mm_pat");
    
    if (!mmPatCookie) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { channelId } = params;
    const body = await request.json();

    const response = await fetch(`${ECENCY_CHAT_BASE}/channels/${channelId}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mm_pat=${mmPatCookie.value}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Failed to send message: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Send message error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send message" },
      { status: 500 }
    );
  }
}
