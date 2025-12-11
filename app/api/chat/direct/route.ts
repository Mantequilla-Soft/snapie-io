import { NextRequest, NextResponse } from "next/server";

const ECENCY_CHAT_BASE = "https://ecency.com/api/mattermost";

/**
 * Create or get a direct message channel with a user
 * POST /api/chat/direct
 * Body: { username: string }
 */
export async function POST(request: NextRequest) {
  try {
    const mmPatCookie = request.cookies.get("mm_pat");
    
    if (!mmPatCookie) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { username } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    const response = await fetch(`${ECENCY_CHAT_BASE}/direct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mm_pat=${mmPatCookie.value}`,
      },
      body: JSON.stringify({ username }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Failed to create DM: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Create DM error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create DM" },
      { status: 500 }
    );
  }
}
