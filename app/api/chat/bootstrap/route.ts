import { NextRequest, NextResponse } from "next/server";

const ECENCY_CHAT_BASE = "https://ecency.com/api/mattermost";

/**
 * Bootstrap Ecency chat for authenticated user
 * POST /api/chat/bootstrap
 * Body: { username: string, accessToken: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { username, accessToken } = await request.json();

    if (!username || !accessToken) {
      return NextResponse.json(
        { error: "Missing username or accessToken" },
        { status: 400 }
      );
    }

    // Call Ecency bootstrap with Snapie community
    const response = await fetch(`${ECENCY_CHAT_BASE}/bootstrap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        username,
        accessToken,
        refreshToken: accessToken,
        displayName: username,
        community: process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || "hive-178315",
        communityTitle: "Snapie",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Bootstrap failed: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Forward the mm_pat cookie from Ecency to our client
    const setCookieHeader = response.headers.get("set-cookie");
    const headers = new Headers();
    if (setCookieHeader) {
      headers.set("set-cookie", setCookieHeader);
    }

    return NextResponse.json(data, { headers });
  } catch (error: any) {
    console.error("Bootstrap error:", error);
    return NextResponse.json(
      { error: error.message || "Bootstrap failed" },
      { status: 500 }
    );
  }
}
