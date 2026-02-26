import { NextRequest, NextResponse } from "next/server";
import {
  getDeletedDocDescriptions,
  getDeletedDocUserBookmarks,
  getDeletedDocUserVotes,
  getTopUpvotedDeletedDocs,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? "100");
    const limit = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? rawLimit : 100));
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    const results = await getTopUpvotedDeletedDocs(limit);
    const eftaIds = results.map((row) => row.efta_id);
    const [userVotes, userBookmarks, cachedDescriptions] = await Promise.all([
      getDeletedDocUserVotes(eftaIds, voterId),
      getDeletedDocUserBookmarks(eftaIds, voterId),
      getDeletedDocDescriptions(eftaIds),
    ]);
    const rowsWithDescriptions = results.map((row) => ({
      ...row,
      document_description: cachedDescriptions[row.efta_id] ?? null,
      thumbnail_url: row.thumbnail_url ?? null,
      userVoted: userVotes[row.efta_id] ?? false,
      userBookmarked: userBookmarks[row.efta_id] ?? false,
    }));

    return NextResponse.json({
      results: rowsWithDescriptions,
      count: results.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load top upvoted deleted docs", details: String(error) },
      { status: 500 },
    );
  }
}
