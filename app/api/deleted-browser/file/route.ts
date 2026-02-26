import { NextRequest, NextResponse } from "next/server";
import {
  getDeletedDocReportCounts,
  getDeletedDocUserBookmarks,
  getDeletedDocUserReports,
  getDeletedDocUserVotes,
  getDeletedDocVotes,
  getDeletedFileById,
} from "@/lib/db";
import { withSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eftaId = (searchParams.get("id") ?? "").trim().toUpperCase();
    if (!eftaId) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    const file = await getDeletedFileById(eftaId);
    if (!file) {
      return NextResponse.json(
        { error: "Deleted file not found for id" },
        { status: 404 },
      );
    }

    const [votes, userVotes, reports, userReports, userBookmarks] =
      await Promise.all([
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
      { error: "Failed to load deleted file by id", details: String(error) },
      { status: 500 },
    );
  }
}

