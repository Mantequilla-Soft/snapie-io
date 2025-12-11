import { NextRequest, NextResponse } from "next/server";

const ECENCY_CHAT_BASE = "https://ecency.com/api/mattermost";

/**
 * Get channels for current user
 * GET /api/chat/channels
 */
export async function GET(request: NextRequest) {
  try {
    const mmPatCookie = request.cookies.get("mm_pat");
    
    if (!mmPatCookie) {
      return NextResponse.json(
        { error: "Not authenticated. Call /api/chat/bootstrap first." },
        { status: 401 }
      );
    }

    const response = await fetch(`${ECENCY_CHAT_BASE}/channels`, {
      method: "GET",
      headers: {
        Cookie: `mm_pat=${mmPatCookie.value}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch channels: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Channels fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch channels" },
      { status: 500 }
    );
  }
}
