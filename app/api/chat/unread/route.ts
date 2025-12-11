import { NextRequest, NextResponse } from "next/server";

const ECENCY_CHAT_BASE = "https://ecency.com/api/mattermost";

/**
 * Get unread message count across all channels
 * GET /api/chat/unread
 */
export async function GET(request: NextRequest) {
  try {
    const mmPatCookie = request.cookies.get("mm_pat");
    
    if (!mmPatCookie) {
      // Not authenticated - return 0 unread
      return NextResponse.json({ unread: 0 });
    }

    // Fetch channels to get unread counts
    const response = await fetch(`${ECENCY_CHAT_BASE}/channels`, {
      method: "GET",
      headers: {
        Cookie: `mm_pat=${mmPatCookie.value}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json({ unread: 0 });
    }

    const data = await response.json();
    const channels = Array.isArray(data) ? data : data.channels || [];
    
    // Sum up unread counts from all channels
    // Mattermost typically includes msg_count, mention_count, or total_msg_count_root
    let totalUnread = 0;
    
    for (const channel of channels) {
      // Different possible field names for unread counts
      totalUnread += channel.msg_count || 0;
      totalUnread += channel.mention_count || 0;
    }

    return NextResponse.json({ 
      unread: totalUnread,
      // Also return per-channel breakdown for potential future use
      channels: channels.map((ch: any) => ({
        id: ch.id,
        name: ch.name,
        display_name: ch.display_name,
        msg_count: ch.msg_count || 0,
        mention_count: ch.mention_count || 0,
      }))
    });
  } catch (error: any) {
    console.error("Unread count error:", error);
    return NextResponse.json({ unread: 0 });
  }
}
