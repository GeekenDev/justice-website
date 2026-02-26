import { NextRequest, NextResponse } from "next/server";
import {
  getDeletedDocUserBookmarks,
  getDeletedDocReportCounts,
  getDeletedDocUserReports,
  getDeletedDocUserVotes,
  getDeletedDocVotes,
  getRandomDeletedFile,
} from "@/lib/db";
import { withSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

function parseExcludeValues(value: string) {
  return value
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const exclude = searchParams.getAll("exclude").flatMap(parseExcludeValues);
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    const file = await getRandomDeletedFile(exclude);

    if (!file) {
      return NextResponse.json({ error: "No deleted files found" }, { status: 404 });
    }

    const [votes, userVotes, reports, userReports, userBookmarks] = await Promise.all([
      getDeletedDocVotes([file.efta_id]),
      getDeletedDocUserVotes([file.efta_id], voterId),
      getDeletedDocReportCounts([file.efta_id]),
      getDeletedDocUserReports([file.efta_id], voterId),
      getDeletedDocUserBookmarks([file.efta_id], voterId),
    ]);
    return NextResponse.json({
      file: {
        ...withSources(file),
        upvotes: votes[file.efta_id] ?? 0,
        userVoted: userVotes[file.efta_id] ?? false,
        userBookmarked: userBookmarks[file.efta_id] ?? false,
        reports: reports[file.efta_id] ?? 0,
        userReported: userReports[file.efta_id] ?? false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load random deleted file", details: String(error) },
      { status: 500 },
    );
  }
}
