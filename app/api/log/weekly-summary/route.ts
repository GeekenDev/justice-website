import { NextRequest, NextResponse } from "next/server";
import { getFilesChangeLogWeeklySummary } from "@/lib/db";

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

export async function GET(request: NextRequest) {
  try {
    const requestedDays = parsePositiveInt(request.nextUrl.searchParams.get("days"), 7);
    const days = Math.max(1, Math.min(31, requestedDays));
    const summary = await getFilesChangeLogWeeklySummary({ days });

    return NextResponse.json({
      days: summary.days,
      requestedDays: days,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load weekly log summary",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
