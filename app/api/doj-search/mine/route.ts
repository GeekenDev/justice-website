import { NextRequest, NextResponse } from "next/server";
import {
  getFileSourceInputsByEftaIds,
  getUserUpvotedDojSearchResults,
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
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    if (!voterId) {
      return NextResponse.json({ error: "Missing voter ID" }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "100");
    const results = await getUserUpvotedDojSearchResults(voterId, limit);
    const parsedRows = results.map((row) => ({
      row,
      parsed: parseDatasetAndEftaFromUrl(row.result_url, row.file_name),
    }));
    const sourceLookups = await getFileSourceInputsByEftaIds(
      parsedRows.map((entry) => entry.parsed.eftaId ?? "").filter(Boolean),
    );
    return NextResponse.json({
      results: parsedRows.map(({ row, parsed }) => {
        if (!parsed.eftaId || !parsed.dataset) {
          return {
            ...row,
            sources: { original_link: null, doj_link: null },
          };
        }
        const fromDb = sourceLookups[parsed.eftaId];
        const sourceInput = {
          efta_id: parsed.eftaId,
          dataset: fromDb?.dataset ?? parsed.dataset,
          file_path: fromDb?.file_path ?? row.file_name ?? null,
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
      { error: "Failed to load your upvoted DOJ results", details: String(error) },
      { status: 500 },
    );
  }
}
