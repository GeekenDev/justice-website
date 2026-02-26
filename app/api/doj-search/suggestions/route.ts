import { NextRequest, NextResponse } from "next/server";
import {
  getDojSearchQuerySuggestions,
  getLatestDojSearchQueries,
  getTopDojSearchQueries,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Number(searchParams.get("limit") ?? "8");

    if (q) {
      const suggestions = await getDojSearchQuerySuggestions(q, limit);
      return NextResponse.json({ suggestions, topSuggestions: [], latestSuggestions: [] });
    }

    const safeLimit = limit || 10;
    const [topSuggestions, latestSuggestions] = await Promise.all([
      getTopDojSearchQueries(safeLimit),
      getLatestDojSearchQueries(safeLimit),
    ]);

    return NextResponse.json({
      suggestions: [],
      topSuggestions,
      latestSuggestions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load suggestions", details: String(error) },
      { status: 500 },
    );
  }
}
