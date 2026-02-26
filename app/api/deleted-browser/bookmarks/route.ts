import { NextRequest, NextResponse } from "next/server";
import { getDeletedBookmarkTotal, getUserBookmarkedDeletedDocs } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    if (!voterId) {
      return NextResponse.json({ error: "Missing voter ID" }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "200");
    const [results, totalBookmarks] = await Promise.all([
      getUserBookmarkedDeletedDocs(voterId, limit),
      getDeletedBookmarkTotal(voterId),
    ]);
    return NextResponse.json({
      results,
      count: results.length,
      totalBookmarks,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load deleted doc bookmarks", details: String(error) },
      { status: 500 },
    );
  }
}
