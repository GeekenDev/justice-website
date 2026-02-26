import { NextRequest, NextResponse } from "next/server";
import {
  getFileSourceInputsByEftaIds,
  getUserUpvotedDeletedDocs,
} from "@/lib/db";
import { buildDojLink, buildOriginalLink } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    if (!voterId) {
      return NextResponse.json({ error: "Missing voter ID" }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "100");
    const results = await getUserUpvotedDeletedDocs(voterId, limit);
    const sourceLookups = await getFileSourceInputsByEftaIds(
      results.map((row) => row.efta_id),
    );
    return NextResponse.json({
      results: results.map((row) => {
        const fromDb = sourceLookups[row.efta_id];
        const sourceInput = {
          efta_id: row.efta_id,
          dataset: fromDb?.dataset ?? row.dataset,
          file_path: fromDb?.file_path ?? row.file_path,
        };
        return {
          ...row,
          sources: {
            original_link: buildOriginalLink(sourceInput),
            doj_link: buildDojLink(sourceInput),
          },
        };
      }),
      count: results.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load your upvoted deleted docs", details: String(error) },
      { status: 500 },
    );
  }
}
