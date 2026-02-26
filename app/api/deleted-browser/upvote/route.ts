import { NextRequest, NextResponse } from "next/server";
import { upvoteDeletedDoc } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    if (!voterId) {
      return NextResponse.json({ error: "Missing voter ID" }, { status: 400 });
    }

    const body = (await request.json()) as {
      eftaId?: string;
      dataset?: string | null;
      filePath?: string | null;
      originalLink?: string | null;
      dojLink?: string | null;
    };

    const eftaId = body.eftaId?.trim() ?? "";
    if (!eftaId) {
      return NextResponse.json({ error: "Missing eftaId" }, { status: 400 });
    }

    const result = await upvoteDeletedDoc({
      eftaId,
      dataset: body.dataset ?? null,
      filePath: body.filePath ?? null,
      originalLink: body.originalLink ?? null,
      dojLink: body.dojLink ?? null,
      voterId,
    });

    return NextResponse.json({
      eftaId: eftaId.toUpperCase(),
      voteCount: result.voteCount,
      alreadyVoted: result.alreadyVoted,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to upvote deleted doc", details: String(error) },
      { status: 500 },
    );
  }
}
