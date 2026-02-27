import { NextRequest, NextResponse } from "next/server";
import {
  getDojSearchBookmarkCounts,
  getDojSearchUserBookmarks,
  getDojSearchUserVotes,
  getFileSourceInputsByEftaIds,
  getTopUpvotedDojSearchResults,
} from "@/lib/db";
import { buildDojLink, buildOriginalLink } from "@/lib/sources";

export const dynamic = "force-dynamic";

function parseDatasetAndEftaFromUrl(url: string, fileName: string | null) {
  const datasetMatch = url.match(/DataSet(?:%20|\s)+(\d+)/i);
  const eftaFromName = fileName?.match(/(EFTA\d{8})/i)?.[1] ?? null;
  const eftaFromUrl = url.match(/(EFTA\d{8})/i)?.[1] ?? null;
  return {
    dataset: datasetMatch?.[1] ?? null,
    eftaId: (eftaFromName ?? eftaFromUrl)?.toUpperCase() ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "100");
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    const results = await getTopUpvotedDojSearchResults(limit);
    const resultUrls = results.map((row) => row.result_url);
    const [bookmarkCounts, userVotes, userBookmarks] = await Promise.all([
      getDojSearchBookmarkCounts(resultUrls),
      getDojSearchUserVotes(resultUrls, voterId),
      getDojSearchUserBookmarks(resultUrls, voterId),
    ]);
    const parsedRows = results.map((row) => ({
      row,
      parsed: parseDatasetAndEftaFromUrl(row.result_url, row.file_name),
    }));
    const sourceLookups = await getFileSourceInputsByEftaIds(
      parsedRows.map((entry) => entry.parsed.eftaId ?? "").filter(Boolean),
    );
    return NextResponse.json({
      results: parsedRows.map(({ row, parsed }) => ({
        ...row,
        sources: (() => {
          if (!parsed.eftaId) {
            return { original_link: null, doj_link: null };
          }
          const fromDb = sourceLookups[parsed.eftaId];
          const resolvedDataset = fromDb?.dataset ?? parsed.dataset;
          if (!resolvedDataset) {
            return { original_link: null, doj_link: null };
          }
          const sourceInput = {
            efta_id: parsed.eftaId,
            dataset: resolvedDataset,
            file_path: fromDb?.file_path ?? row.file_name ?? null,
          };
          return {
            original_link: buildOriginalLink(sourceInput),
            doj_link: buildDojLink(sourceInput),
          };
        })(),
        bookmarkCount: bookmarkCounts[row.result_url] ?? 0,
        userVoted: userVotes[row.result_url] ?? false,
        userBookmarked: userBookmarks[row.result_url] ?? false,
      })),
      count: results.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load top upvoted results", details: String(error) },
      { status: 500 },
    );
  }
}
