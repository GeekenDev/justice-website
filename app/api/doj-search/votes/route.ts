import { NextRequest, NextResponse } from "next/server";
import { getDojSearchUserVotes, getDojSearchVotes } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = (searchParams.get("url") ?? "").trim();
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    const [votes, userVotes] = await Promise.all([
      getDojSearchVotes([url]),
      getDojSearchUserVotes([url], voterId),
    ]);
    return NextResponse.json({
      url,
      voteCount: votes[url] ?? 0,
      userVoted: userVotes[url] ?? false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load vote state", details: String(error) },
      { status: 500 },
    );
  }
}

