import { NextRequest, NextResponse } from "next/server";
import { upvoteDojSearchResult } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    if (!voterId) {
      return NextResponse.json({ error: "Missing voter ID" }, { status: 400 });
    }

    const body = (await request.json()) as {
      url?: string;
      title?: string | null;
      fileName?: string | null;
      snippet?: string | null;
      highlight?: string | null;
      fileSize?: number | null;
    };

    const url = body.url?.trim() ?? "";
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const result = await upvoteDojSearchResult({
      url,
      title: body.title ?? null,
      fileName: body.fileName ?? null,
      snippet: body.snippet ?? null,
      highlight: body.highlight ?? null,
      fileSize: body.fileSize ?? null,
      voterId,
    });

    return NextResponse.json({
      url,
      voteCount: result.voteCount,
      alreadyVoted: result.alreadyVoted,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to upvote result", details: String(error) },
      { status: 500 },
    );
  }
}
